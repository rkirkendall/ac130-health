'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { ScrollArea } from './ui/scroll-area';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Lock, Settings, Plus, Edit, Trash2, MoreHorizontal } from 'lucide-react';
import { ResourceForm } from './ResourceForm';
import { DeleteConfirmation } from './DeleteConfirmation';
import type { Dependent, RecordCount, PhiVaultEntry } from './types';
import {
  formatDateValue,
  formatFieldValue,
  formatTitleCandidate,
  humanNameToString,
} from './utils';

interface DependentViewerProps {
  apiBaseUrl?: string;
}

type PhiState = 'hidden' | 'loading' | 'visible' | 'error';

interface ProfileFormState {
  recordIdentifier: string;
  legalFirst: string;
  legalLast: string;
  sex: string;
  fullDob: string;
}

const createEmptyProfileForm = (): ProfileFormState => ({
  recordIdentifier: '',
  legalFirst: '',
  legalLast: '',
  sex: '',
  fullDob: '',
});

const PHI_FIELD_OPTIONS = [
  { value: 'legal_name', label: 'Full Legal Name' },
  { value: 'relationship_note', label: 'Relationship Note' },
  { value: 'full_dob', label: 'Full Date of Birth' },
  { value: 'birth_year', label: 'Birth Year' },
  { value: 'sex', label: 'Sex' },
  { value: 'contact_phone', label: 'Phone Number' },
  { value: 'contact_email', label: 'Email' },
  { value: 'address_line1', label: 'Address' },
] as const;

type PhiFieldType = (typeof PHI_FIELD_OPTIONS)[number]['value'];

const DEFAULT_PHI_FIELD = PHI_FIELD_OPTIONS[0]?.value ?? 'legal_name';

const FIELD_LABEL_OVERRIDES: Record<string, string> = {
  record_identifier: 'Identifier',
  full_name: 'Name',
  patient_name: 'Name',
  provider_name: 'Provider Name',
  created_at: 'Created',
  updated_at: 'Updated',
};

const HIDDEN_FIELD_KEYS = new Set([
  '_id',
  'id',
  'dependent_id',
  'phi_vault_id',
  'record_id',
  'created_by',
  'updated_by',
  'database_id',
  'created_at',
  'updated_at',
  'archived',
]);

const RECORD_TYPE_ORDER = [
  'active_summaries',
  'visits',
  'prescriptions',
  'labs',
  'lab',
  'conditions',
  'allergies',
  'immunizations',
  'vital_signs',
  'procedures',
  'imaging',
  'insurance',
  'treatments',
  'provider',
  'dependent',
] as const;

const RECORD_TYPE_LABELS: Record<string, string> = {
  active_summaries: 'Summary',
  dependent: 'Profiles',
  provider: 'Care Team',
  visit: 'Visits',
  prescription: 'Prescriptions',
  lab: 'Labs',
  labs: 'Labs',
  treatment: 'Treatments',
  condition: 'Conditions',
  allergy: 'Allergies',
  immunization: 'Immunizations',
  vital_signs: 'Vital Signs',
  procedure: 'Procedures',
  imaging: 'Imaging',
  insurance: 'Insurance',
};

const shouldHideField = (key: string) => {
  const lower = key.toLowerCase();
  if (HIDDEN_FIELD_KEYS.has(lower)) {
    return true;
  }
  return lower === 'id' || lower.endsWith('_id');
};

const hasRenderableValue = (value: string | null | undefined) => {
  if (value === null || value === undefined) {
    return false;
  }
  const trimmed = value.toString().trim();
  if (!trimmed) {
    return false;
  }
  return trimmed.toLowerCase() !== 'n/a';
};

const formatRecordTypeLabel = (type: string, fallback?: string) => {
  if (RECORD_TYPE_LABELS[type]) {
    return RECORD_TYPE_LABELS[type];
  }

  const cleaned = fallback
    ?.replace(/records?/gi, '')
    .replace(/dependent/gi, 'profile')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned) {
    return cleaned
      .split(' ')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  return type
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const normalizeRecordCounts = (counts: RecordCount[]): RecordCount[] => {
  const remaining = Array.isArray(counts) ? [...counts] : [];
  const sorted: RecordCount[] = [];

  for (const type of RECORD_TYPE_ORDER) {
    const index = remaining.findIndex(entry => entry.type === type);
    if (index !== -1) {
      const [entry] = remaining.splice(index, 1);
      sorted.push({
        ...entry,
        label: formatRecordTypeLabel(type, entry.label),
      });
    }
  }

  return [
    ...sorted,
    ...remaining.map(entry => ({
      ...entry,
      label: formatRecordTypeLabel(entry.type, entry.label),
    })),
  ];
};

const isLabRecordType = (type?: string) => type === 'lab' || type === 'labs';

async function parseJsonResponse<T>(res: Response): Promise<T | null> {
  if (!res.ok) {
    const message = await res.text().catch(() => '');
    throw new Error(
      `Request failed with ${res.status} ${res.statusText}${
        message ? ` - ${message}` : ''
      }`
    );
  }

  const text = await res.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Unexpected non-JSON response');
  }
}

const formatContact = (contact?: { phone?: string; email?: string }) => {
  if (!contact) return null;
  return [contact.email, contact.phone].filter(Boolean).join(' • ') || null;
};

const formatAddress = (address?: PhiVaultEntry['address']) => {
  if (!address) return null;
  const parts = [
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(', '),
    address.postal_code,
    address.country,
  ]
    .map(part => (part ? part.trim() : ''))
    .filter(Boolean);
  return parts.length > 0 ? parts.join('\n') : null;
};

const getRecordTitle = (
  recordType: string,
  record: Record<string, any>,
  index: number
): string => {
  if (recordType === 'prescriptions') {
    return record.medication_name || record.title || `Prescription ${index + 1}`;
  }
  if (recordType === 'procedures') {
    return record.procedure_name || record.title || `Procedure ${index + 1}`;
  }
  if (recordType === 'conditions') {
    return (
      record.condition_name ||
      record.name ||
      record.title ||
      `Condition ${index + 1}`
    );
  }
  if (recordType === 'allergies') {
    return record.allergen || record.title || `Allergy ${index + 1}`;
  }
  if (recordType === 'immunizations') {
    return record.vaccine_name || record.title || `Immunization ${index + 1}`;
  }
  if (recordType === 'imaging') {
    return record.study_type || record.title || `Imaging ${index + 1}`;
  }
  if (recordType === 'insurance') {
    return record.provider_name || record.plan_name || record.title || `Insurance ${index + 1}`;
  }
  if (recordType === 'visits') {
    return (
      record.reason ||
      record.type ||
      formatTitleCandidate(record.description) ||
      `Visit ${index + 1}`
    );
  }

  return (
    formatTitleCandidate(record.name) ||
    formatTitleCandidate(record.title) ||
    formatTitleCandidate(record.description) ||
    `Record ${index + 1}`
  );
};

function PhiTextRenderer({ text, phiMap }: { text: string; phiMap?: Record<string, string> }) {
  if (!text) return null;
  if (!phiMap) return <>{text}</>;

  const parts = text.split(/(phi:vault:[0-9a-f]{24})/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('phi:vault:')) {
          const id = part.split(':')[2];
          const value = phiMap[id];

          if (value) {
            return (
              <span
                key={index}
                className="mx-0.5 inline-flex items-center rounded border border-dashed border-slate-400 bg-slate-100 px-1.5 py-0 text-sm font-medium text-slate-900 select-all"
                title="Protected Health Information"
              >
                {value}
              </span>
            );
          }
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

export function DependentViewer({ apiBaseUrl = '' }: DependentViewerProps) {
  const router = useRouter();
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [selectedDependent, setSelectedDependent] = useState<string>('');
  const [recordCounts, setRecordCounts] = useState<RecordCount[]>([]);
  const [selectedRecordType, setSelectedRecordType] = useState<string>('');
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [phiState, setPhiState] = useState<PhiState>('hidden');
  const [phiEntry, setPhiEntry] = useState<PhiVaultEntry | null>(null);
  const [phiError, setPhiError] = useState<string | null>(null);
  const [showPhiModal, setShowPhiModal] = useState(false);
  const [phiModalType, setPhiModalType] = useState<PhiFieldType>(DEFAULT_PHI_FIELD);
  const [phiModalValue, setPhiModalValue] = useState('');
  const [phiModalError, setPhiModalError] = useState<string | null>(null);
  const [phiSaving, setPhiSaving] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(() =>
    createEmptyProfileForm()
  );
  const maxDob = useMemo(() => new Date().toISOString().split('T')[0], []);

  // CRUD state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [selectedRecordForEdit, setSelectedRecordForEdit] = useState<any>(null);
  const [selectedRecordForDelete, setSelectedRecordForDelete] = useState<any>(null);
  const [crudLoading, setCrudLoading] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [showDependentDeleteDialog, setShowDependentDeleteDialog] = useState(false);
  const [dependentDeleteLoading, setDependentDeleteLoading] = useState(false);
  const [dependentDeleteError, setDependentDeleteError] = useState<string | null>(null);
  const resetProfileForm = useCallback(() => {
    setProfileForm(createEmptyProfileForm());
    setProfileError(null);
  }, []);

  const openProfileModal = () => {
    resetProfileForm();
    setShowProfileModal(true);
  };

  const closeProfileModal = () => {
    setShowProfileModal(false);
    resetProfileForm();
  };

  const handleProfileFieldChange = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = event.target;
    setProfileForm(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedIdentifier = profileForm.recordIdentifier.trim();

    if (!trimmedIdentifier) {
      setProfileError('Relationship identifier is required.');
      return;
    }

    setProfileSubmitting(true);
    setProfileError(null);

    const payload: Record<string, any> = {
      record_identifier: trimmedIdentifier,
    };

    const phiPayload: Record<string, any> = {};
    const legalFirst = profileForm.legalFirst.trim();
    const legalLast = profileForm.legalLast.trim();

    if (legalFirst || legalLast) {
      phiPayload.legal_name = {
        ...(legalFirst ? { given: legalFirst } : {}),
        ...(legalLast ? { family: legalLast } : {}),
      };
    }

    const sex = profileForm.sex.trim().toLowerCase();
    if (sex === 'male' || sex === 'female') {
      phiPayload.sex = sex;
    }

    if (profileForm.fullDob) {
      phiPayload.full_dob = profileForm.fullDob;
    }

    if (Object.keys(phiPayload).length > 0) {
      payload.phi = phiPayload;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/api/dependents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let parsed: any = null;

      if (responseText) {
        try {
          parsed = JSON.parse(responseText);
        } catch {
          parsed = null;
        }
      }

      if (!response.ok && response.status !== 404) {
        const message =
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.error === 'string'
            ? parsed.error
            : 'Failed to create profile.';
        throw new Error(message);
      }

      if (!parsed) {
        throw new Error('Failed to create profile.');
      }

      const created = parsed as Dependent;

      setDependents(prev => {
        const remaining = prev.filter(
          dependent => dependent._id !== created._id
        );
        return [created, ...remaining];
      });

      handleSelectDependent(created._id);
      closeProfileModal();
    } catch (error) {
      console.error('Error creating profile:', error);
      setProfileError(
        error instanceof Error ? error.message : 'Failed to create profile.'
      );
    } finally {
      setProfileSubmitting(false);
    }
  };

  const resetPhiState = useCallback(() => {
    setPhiState('hidden');
    setPhiEntry(null);
    setPhiError(null);
  }, []);

  const resetPhiModalState = () => {
    setPhiModalValue('');
    setPhiModalError(null);
    setPhiModalType(DEFAULT_PHI_FIELD);
  };

  const openPhiModal = () => {
    resetPhiModalState();
    setShowPhiModal(true);
  };

  const closePhiModal = () => {
    setShowPhiModal(false);
    resetPhiModalState();
  };

  const handleSelectDependent = useCallback((dependentId: string) => {
    setSelectedDependent(dependentId);
    setRecordCounts([]);
    setSelectedRecordType('');
    resetPhiState();
  }, [resetPhiState]);

  useEffect(() => {
    if (!profileMenuOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/dependents`)
      .then(parseJsonResponse<Dependent[]>)
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setDependents(list);
        handleSelectDependent(list[0]?._id ?? '');
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching dependents:', err);
        setLoading(false);
      });
  }, [apiBaseUrl, handleSelectDependent]);

  useEffect(() => {
    if (!selectedDependent) {
      return;
    }

    let cancelled = false;

    fetch(`${apiBaseUrl}/api/dependents/${selectedDependent}/counts`)
      .then(parseJsonResponse<RecordCount[]>)
      .then(data => {
        if (cancelled) {
          return;
        }

        const normalized = normalizeRecordCounts(Array.isArray(data) ? data : []);
        setRecordCounts(normalized);
        setSelectedRecordType(prev =>
          prev && normalized.some(entry => entry.type === prev)
            ? prev
            : normalized[0]?.type ?? ''
        );
      })
      .catch(err => console.error('Error fetching counts:', err));

    return () => {
      cancelled = true;
    };
  }, [selectedDependent, apiBaseUrl]);

  useEffect(() => {
    if (selectedDependent && selectedRecordType) {
      fetch(`${apiBaseUrl}/api/dependents/${selectedDependent}/records/${selectedRecordType}`)
        .then(parseJsonResponse<any[]>)
        .then(data => setRecords(Array.isArray(data) ? data : []))
        .catch(err => console.error('Error fetching records:', err));
    }
  }, [selectedDependent, selectedRecordType, apiBaseUrl]);

  const selectedDependentDetails = useMemo(
    () => dependents.find(dependent => dependent._id === selectedDependent),
    [dependents, selectedDependent]
  );

  const handleRevealPhi = async () => {
    if (!selectedDependentDetails?.has_phi) {
      setPhiState('visible');
      setPhiEntry(null);
      return;
    }

    if (phiState === 'visible') {
      setPhiState('hidden');
      setPhiEntry(null);
      setPhiError(null);
      return;
    }

    setPhiState('loading');
    setPhiError(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/dependents/${selectedDependent}/phi`
      );
      const data = await parseJsonResponse<PhiVaultEntry>(response);
      setPhiEntry(data);
      setPhiState('visible');
    } catch (error) {
      console.error('Error revealing PHI:', error);
      setPhiError(error instanceof Error ? error.message : String(error));
      setPhiState('error');
    }
  };

  const handlePhiSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDependent) {
      setPhiModalError('Select a dependent before adding PHI.');
      return;
    }
    const trimmedValue = phiModalValue.trim();
    if (!trimmedValue) {
      setPhiModalError('Value is required.');
      return;
    }

    setPhiSaving(true);
    setPhiModalError(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/dependents/${selectedDependent}/phi`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: phiModalType, value: trimmedValue }),
        }
      );
      const updatedEntry = await parseJsonResponse<PhiVaultEntry>(response);

      if (!updatedEntry) {
        throw new Error('Failed to save PHI entry.');
      }

      setPhiEntry(updatedEntry);
      setPhiState('visible');
      setDependents(prev =>
        prev.map(dependent =>
          dependent._id === selectedDependent
            ? {
                ...dependent,
                has_phi: true,
                phi_vault_id: updatedEntry._id,
              }
            : dependent
        )
      );
      closePhiModal();
    } catch (error) {
      console.error('Error saving PHI entry:', error);
      setPhiModalError(error instanceof Error ? error.message : String(error));
    } finally {
      setPhiSaving(false);
    }
  };

  const renderPhiVaultSection = () => {
    if (!selectedDependentDetails) {
      return null;
    }

    const buttonLabel =
      phiState === 'visible' ? 'Hide PHI' : 'Reveal PHI';

    let body: React.ReactNode = (
      <p className="text-sm text-muted-foreground">
        PHI is stored securely and excluded from MCP responses. Select the Reveal PHI button to view it in this app.
      </p>
    );

    if (!selectedDependentDetails.has_phi) {
      body = (
        <p className="text-sm text-muted-foreground">
          No PHI has been captured for this profile yet.
        </p>
      );
    } else if (phiState === 'loading') {
      body = <p className="text-sm text-muted-foreground">Loading PHI…</p>;
    } else if (phiState === 'error') {
      body = (
        <p className="text-sm text-red-600">
          Failed to load PHI.{phiError ? ` ${phiError}` : ''}
        </p>
      );
    } else if (phiState === 'visible') {
      const fields = [
        {
          label: 'Legal Name',
          value: humanNameToString(phiEntry?.legal_name),
        },
        { label: 'Relationship Note', value: phiEntry?.relationship_note },
        {
          label: 'Full Date of Birth',
          value: formatDateValue(phiEntry?.full_dob) ?? phiEntry?.full_dob,
        },
        {
          label: 'Birth Year',
          value: phiEntry?.birth_year?.toString() ?? null,
        },
        { label: 'Sex', value: phiEntry?.sex },
        { label: 'Contact', value: formatContact(phiEntry?.contact) },
        { label: 'Address', value: formatAddress(phiEntry?.address) },
      ].filter(field => hasRenderableValue(field.value));

      body =
        fields.length > 0 ? (
          <div className="mt-4 space-y-3">
            {fields.map(field => (
              <div key={field.label} className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {field.label}
                </p>
                <p className="text-sm whitespace-pre-line">{field.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No PHI fields are populated for this profile.
          </p>
        );
    }

    return (
    <div className="rounded-lg border border-dashed border-slate-300 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" aria-hidden />
            <span>PHI Vault</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {selectedDependentDetails.has_phi
              ? 'Sensitive identifiers are vaulted separately.'
              : 'Vault entry empty'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={openPhiModal}
            disabled={phiSaving}
          >
            Update PHI
          </Button>
          <button
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
            onClick={handleRevealPhi}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
        <div className="mt-3">{body}</div>
      </div>
    );
  };

  const renderCreateProfileDialog = () => (
    <Dialog
      open={showProfileModal}
      onOpenChange={open => {
        if (!open) {
          closeProfileModal();
        }
      }}
    >
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Profile</DialogTitle>
          <DialogDescription>
            Create a relationship label that does not contain Personally Identifiable Health Information (PHI). This is how you will refer to this person's profile when you chat with the LLM. You can also add optional PHI. Sensitive fields are
            stored in the PHI vault and never shared with the LLM.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleProfileSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="record-identifier">Relationship Identifier</Label>
            <Input
              id="record-identifier"
              name="recordIdentifier"
              value={profileForm.recordIdentifier}
              onChange={handleProfileFieldChange}
              placeholder="e.g., Mom, Dad, Aunt"
              required
              disabled={profileSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              This is the label the LLM will see when looking up this person's profile.
            </p>
          </div>

          <div className="space-y-4 rounded-lg border border-dashed border-slate-300 p-4">
            <div>
              <p className="text-sm font-semibold">PHI Vault (optional)</p>
              <p className="text-xs text-muted-foreground">
                These identifiers are encrypted and only shown after an explicit reveal.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="legal-first">Legal First Name</Label>
                <Input
                  id="legal-first"
                  name="legalFirst"
                  value={profileForm.legalFirst}
                  onChange={handleProfileFieldChange}
                  placeholder="First name"
                  disabled={profileSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="legal-last">Legal Last Name</Label>
                <Input
                  id="legal-last"
                  name="legalLast"
                  value={profileForm.legalLast}
                  onChange={handleProfileFieldChange}
                  placeholder="Last name"
                  disabled={profileSubmitting}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phi-sex">Sex</Label>
                <Select
                  value={profileForm.sex || undefined}
                  onValueChange={value =>
                    setProfileForm(prev => ({ ...prev, sex: value }))
                  }
                >
                  <SelectTrigger id="phi-sex" disabled={profileSubmitting}>
                    <SelectValue placeholder="Select sex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phi-dob">Date of Birth</Label>
                <Input
                  type="date"
                  id="phi-dob"
                  name="fullDob"
                  value={profileForm.fullDob}
                  onChange={handleProfileFieldChange}
                  disabled={profileSubmitting}
                  max={maxDob}
                />
              </div>
            </div>
          </div>

          {profileError ? (
            <p className="text-sm text-red-600">{profileError}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeProfileModal}
              disabled={profileSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={profileSubmitting}>
              {profileSubmitting ? 'Creating...' : 'Create Profile'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  // CRUD functions
  const handleCreateRecord = async (data: Record<string, any>) => {
    setCrudLoading(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/dependents/${selectedDependent}/records/${selectedRecordType}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create record');
      }

      // Refresh records
      const recordsResponse = await fetch(
        `${apiBaseUrl}/api/dependents/${selectedDependent}/records/${selectedRecordType}`
      );
      const updatedRecords = await parseJsonResponse<any[]>(recordsResponse);
      setRecords(Array.isArray(updatedRecords) ? updatedRecords : []);

      // Refresh counts
      const countsResponse = await fetch(
        `${apiBaseUrl}/api/dependents/${selectedDependent}/counts`
      );
      const updatedCounts = await parseJsonResponse<RecordCount[]>(countsResponse);
      const normalized = normalizeRecordCounts(Array.isArray(updatedCounts) ? updatedCounts : []);
      setRecordCounts(normalized);
    } catch (error) {
      console.error('Error creating record:', error);
      throw error;
    } finally {
      setCrudLoading(false);
    }
  };

  const handleEditRecord = async (data: Record<string, any>) => {
    if (!selectedRecordForEdit) return;

    setCrudLoading(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/dependents/${selectedDependent}/records/${selectedRecordType}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: selectedRecordForEdit._id, ...data }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update record');
      }

      // Refresh records
      const recordsResponse = await fetch(
        `${apiBaseUrl}/api/dependents/${selectedDependent}/records/${selectedRecordType}`
      );
      const updatedRecords = await parseJsonResponse<any[]>(recordsResponse);
      setRecords(Array.isArray(updatedRecords) ? updatedRecords : []);
    } catch (error) {
      console.error('Error updating record:', error);
      throw error;
    } finally {
      setCrudLoading(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!selectedRecordForDelete) return;

    setCrudLoading(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/dependents/${selectedDependent}/records/${selectedRecordType}?id=${selectedRecordForDelete._id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        throw new Error('Failed to delete record');
      }

      // Refresh records
      const recordsResponse = await fetch(
        `${apiBaseUrl}/api/dependents/${selectedDependent}/records/${selectedRecordType}`
      );
      const updatedRecords = await parseJsonResponse<any[]>(recordsResponse);
      setRecords(Array.isArray(updatedRecords) ? updatedRecords : []);

      // Refresh counts
      const countsResponse = await fetch(
        `${apiBaseUrl}/api/dependents/${selectedDependent}/counts`
      );
      const updatedCounts = await parseJsonResponse<RecordCount[]>(countsResponse);
      const normalized = normalizeRecordCounts(Array.isArray(updatedCounts) ? updatedCounts : []);
      setRecordCounts(normalized);
    } catch (error) {
      console.error('Error deleting record:', error);
      throw error;
    } finally {
      setCrudLoading(false);
    }
  };

  const openCreateForm = () => setShowCreateForm(true);
  const closeCreateForm = () => setShowCreateForm(false);

  const openEditForm = (record: any) => {
    setSelectedRecordForEdit(record);
    setShowEditForm(true);
  };
  const closeEditForm = () => {
    setShowEditForm(false);
    setSelectedRecordForEdit(null);
  };

  const openDeleteConfirmation = (record: any) => {
    setSelectedRecordForDelete(record);
    setShowDeleteConfirmation(true);
  };
  const closeDeleteConfirmation = () => {
    setShowDeleteConfirmation(false);
    setSelectedRecordForDelete(null);
  };

  const handleDeleteProfileMenuClick = () => {
    setProfileMenuOpen(false);
    setDependentDeleteError(null);
    setShowDependentDeleteDialog(true);
  };

  const closeDependentDeleteDialog = () => {
    if (dependentDeleteLoading) {
      return;
    }
    setShowDependentDeleteDialog(false);
    setDependentDeleteError(null);
  };

  const handleDeleteDependent = async (): Promise<boolean> => {
    if (!selectedDependent) {
      setDependentDeleteError('Select a profile to delete.');
      return false;
    }

    setDependentDeleteLoading(true);
    setDependentDeleteError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/dependents/${selectedDependent}`, {
        method: 'DELETE',
      });

      const responseText = await response.text();
      let parsed: any = null;
      if (responseText) {
        try {
          parsed = JSON.parse(responseText);
        } catch {
          parsed = null;
        }
      }

      if (!response.ok) {
        const message =
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.error === 'string'
            ? parsed.error
            : 'Failed to delete profile.';
        setDependentDeleteError(message);
        return false;
      }

      let nextSelectedId = '';
      setDependents(prev => {
        const updated = prev.filter(dependent => dependent._id !== selectedDependent);
        nextSelectedId = updated[0]?._id ?? '';
        return updated;
      });

      setRecords([]);
      setRecordCounts([]);
      setSelectedRecordForEdit(null);
      setSelectedRecordForDelete(null);
      setProfileMenuOpen(false);
      handleSelectDependent(nextSelectedId);
      setShowDependentDeleteDialog(false);
      return true;
    } catch (error) {
      console.error('Error deleting dependent:', error);
      setDependentDeleteError(
        error instanceof Error ? error.message : 'Failed to delete profile.'
      );
      return false;
    } finally {
      setDependentDeleteLoading(false);
    }
  };

const renderProfile = () => {
    if (!selectedDependentDetails) {
      return (
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              Select a patient to view their information.
            </p>
          </CardContent>
        </Card>
      );
    }

    const baseFields = [
      {
        label: 'Relationship',
        value: selectedDependentDetails.record_identifier,
      },
    ].filter(field => hasRenderableValue(field.value));

    const latestSummary = records[0];

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profile</CardTitle>
          {latestSummary ? (
            <p className="text-sm text-muted-foreground">
              Health summary updated {formatDateValue(latestSummary.updated_at) ?? 'N/A'}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-6">
          {baseFields.length > 0 ? (
            <div className="space-y-4">
              {baseFields.map(field => (
                <div key={field.label} className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {field.label}
                  </p>
                  <p className="text-sm">{field.value}</p>
                </div>
              ))}
            </div>
          ) : null}
          {renderPhiVaultSection()}
          {records.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-900">Health Summary</p>
              {records.map((record, index) => (
                <div key={record._id || index} className="rounded-lg border border-slate-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Last updated {formatDateValue(record.updated_at) ?? 'N/A'}
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    <PhiTextRenderer text={record.summary_text} phiMap={record._phi_resolved} />
                  </pre>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No health summary has been recorded for this profile.
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-lg">Loading...</p>
        </div>
        {renderCreateProfileDialog()}
      </>
    );
  }

  if (dependents.length === 0) {
    return (
      <>
        <div className="flex min-h-screen items-center justify-center">
          <div className="max-w-md space-y-4 px-4 text-center">
            <p className="text-lg font-semibold">No profiles found yet.</p>
            <p className="text-sm text-muted-foreground">
              Create your first profile to start managing health records.
            </p>
            <Button onClick={openProfileModal}>
              <Plus className="h-4 w-4 mr-2" />
              Add Profile
            </Button>
          </div>
        </div>
        {renderCreateProfileDialog()}
      </>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b bg-card">
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Image
              src="/ac-130-logo.png"
              alt="AC130 Health"
              width={40}
              height={40}
              className="rounded-md border border-border bg-background"
              priority
            />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">AC130 Health</p>
              <span className="font-semibold text-foreground">Health Records</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push('/settings')}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>
      <header className="border-b bg-background">
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 sm:flex-1">
            <div className="space-y-1 flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Profile
              </p>
              <div className="w-full min-w-0 sm:w-64">
                <Select value={selectedDependent} onValueChange={handleSelectDependent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {dependents.map(dependent => (
                      <SelectItem key={dependent._id} value={dependent._id}>
                        {dependent.record_identifier}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="relative" ref={profileMenuRef}>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Profile actions"
                disabled={!selectedDependent}
                onClick={() => setProfileMenuOpen(open => !open)}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {profileMenuOpen ? (
                <div className="absolute right-0 z-50 mt-2 w-44 rounded-md border bg-background text-sm shadow-lg">
                  <button
                    className="w-full px-3 py-2 text-left text-red-600 hover:bg-muted"
                    onClick={handleDeleteProfileMenuClick}
                    disabled={!selectedDependent}
                  >
                    Delete profile
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <Button onClick={openProfileModal} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Profile
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 border-r bg-background">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-2">
              <h2 className="font-semibold mb-4">Record Types</h2>
              {recordCounts.map(({ type, label, count }) => (
                <button
                  key={type}
                  onClick={() => setSelectedRecordType(type)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                    selectedRecordType === type
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm">{label}</span>
                    {typeof count === 'number' ? (
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${
                          selectedRecordType === type
                            ? 'bg-primary-foreground text-primary'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </aside>

        <main className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">
                  {recordCounts.find(r => r.type === selectedRecordType)?.label || 'Summary'}
                </h2>
                {selectedRecordType && selectedRecordType !== 'active_summaries' && (
                  <Button onClick={openCreateForm} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Record
                  </Button>
                )}
              </div>

              {selectedRecordType === 'active_summaries' ? (
                renderProfile()
              ) : records.length === 0 ? (
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <div className="text-center space-y-2">
                      <p className="text-muted-foreground">
                        No records yet. Connect the AC130 MCP to an LLM assistant to add records.
                      </p>
                    </div>
                    <div className="rounded-lg border border-dashed border-slate-300 p-4 bg-muted/50">
                      <p className="text-sm font-medium mb-2">MCP Configuration:</p>
                      <pre className="text-xs font-mono bg-background p-3 rounded border overflow-x-auto">
{`{
  "mcpServers": {
    "health-record-mcp": {
      "url": "http://localhost:3002",
      "transport": {
        "type": "sse",
        "url": "http://localhost:3002"
      }
    }
  }
}`}
                      </pre>
                      <p className="text-xs text-muted-foreground mt-2">
                        Paste this into Cursor or Claude Desktop after starting your MCP server.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : isLabRecordType(selectedRecordType) ? (
                <div className="space-y-4">
                  {records.map((record, index) => (
                    <Card key={record._id || index}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">{record.test_name}</CardTitle>
                            <div className="flex gap-4 text-sm text-muted-foreground mt-1">
                          {record.result_date && (
                            <span>Date: {formatDateValue(record.result_date) ?? record.result_date}</span>
                          )}
                          {record.status && <span>Status: {record.status}</span>}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditForm(record)}
                              disabled={crudLoading}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteConfirmation(record)}
                              disabled={crudLoading}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {record.results && Array.isArray(record.results) && record.results.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-2 px-3 text-sm font-medium">Test</th>
                                  <th className="text-left py-2 px-3 text-sm font-medium">Value</th>
                                  <th className="text-left py-2 px-3 text-sm font-medium">Unit</th>
                                  <th className="text-left py-2 px-3 text-sm font-medium">Reference Range</th>
                                  <th className="text-left py-2 px-3 text-sm font-medium">Flag</th>
                                </tr>
                              </thead>
                              <tbody>
                                {record.results.map((result: any, idx: number) => (
                                  <tr key={idx} className="border-b last:border-0">
                                    <td className="py-2 px-3 text-sm">{result.test}</td>
                                    <td className="py-2 px-3 text-sm font-medium">{result.value ?? 'N/A'}</td>
                                    <td className="py-2 px-3 text-sm">{result.unit ?? ''}</td>
                                    <td className="py-2 px-3 text-sm text-muted-foreground">
                                      {result.reference_range ?? 'N/A'}
                                    </td>
                                    <td className="py-2 px-3 text-sm">
                                      {result.flag && (
                                        <span
                                          className={`px-2 py-1 rounded text-xs font-medium ${
                                            result.flag.toLowerCase() === 'high'
                                              ? 'bg-red-100 text-red-800'
                                              : result.flag.toLowerCase() === 'low'
                                              ? 'bg-blue-100 text-blue-800'
                                              : 'bg-yellow-100 text-yellow-800'
                                          }`}
                                        >
                                          {result.flag}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : record.components && Array.isArray(record.components) && record.components.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-2 px-3 text-sm font-medium">Component</th>
                                  <th className="text-left py-2 px-3 text-sm font-medium">Value</th>
                                  <th className="text-left py-2 px-3 text-sm font-medium">Unit</th>
                                  <th className="text-left py-2 px-3 text-sm font-medium">Reference Range</th>
                                </tr>
                              </thead>
                              <tbody>
                                {record.components.map((component: any, idx: number) => (
                                  <tr key={idx} className="border-b last:border-0">
                                    <td className="py-2 px-3 text-sm">{component.name}</td>
                                    <td className="py-2 px-3 text-sm font-medium">{component.value ?? 'N/A'}</td>
                                    <td className="py-2 px-3 text-sm">{component.unit ?? ''}</td>
                                    <td className="py-2 px-3 text-sm text-muted-foreground">
                                      {component.reference_range ?? 'N/A'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-muted-foreground">No results available</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {records.map((record, index) => {
                    const titleCandidate = getRecordTitle(selectedRecordType, record, index);

                    return (
                      <Card key={record._id || index}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-lg">{titleCandidate}</CardTitle>
                              <p className="text-sm text-muted-foreground">
                                Updated {formatDateValue(record.updated_at) ?? 'N/A'}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditForm(record)}
                                disabled={crudLoading}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDeleteConfirmation(record)}
                                disabled={crudLoading}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {Object.entries(record)
                            .filter(([key]) => !shouldHideField(key))
                            .map(([key, value]) => {
                              const label =
                                FIELD_LABEL_OVERRIDES[key] || key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                              const formattedValue = formatFieldValue(key, value);

                              if (!hasRenderableValue(formattedValue)) {
                                return null;
                              }

                              return (
                                <div key={key} className="space-y-1">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {label}
                                  </p>
                                  <p className="text-sm whitespace-pre-line">{formattedValue}</p>
                                </div>
                              );
                            })}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        </main>
      </div>

      {renderCreateProfileDialog()}
      {/* CRUD Dialogs */}
      <ResourceForm
        isOpen={showCreateForm}
        onClose={closeCreateForm}
        onSubmit={handleCreateRecord}
        resourceType={selectedRecordType}
        mode="create"
        dependentId={selectedDependent}
      />

      <ResourceForm
        isOpen={showEditForm}
        onClose={closeEditForm}
        onSubmit={handleEditRecord}
        resourceType={selectedRecordType}
        mode="edit"
        initialData={selectedRecordForEdit}
        dependentId={selectedDependent}
      />

      <DeleteConfirmation
        isOpen={showDeleteConfirmation}
        onClose={closeDeleteConfirmation}
        onConfirm={handleDeleteRecord}
        title="Delete Record"
        description={`Are you sure you want to delete this ${selectedRecordType.replace('_', ' ')} record? This action cannot be undone.`}
        loading={crudLoading}
      />
      <DeleteConfirmation
        isOpen={showDependentDeleteDialog}
        onClose={closeDependentDeleteDialog}
        onConfirm={handleDeleteDependent}
        title="Delete Profile"
        description="This will permanently delete the profile and every associated record. This action cannot be undone."
        loading={dependentDeleteLoading}
        errorMessage={dependentDeleteError}
      />

  <Dialog
    open={showPhiModal}
    onOpenChange={open => {
      if (!open) {
        closePhiModal();
      }
    }}
  >
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>Update PHI Entry</DialogTitle>
        <DialogDescription>
          Choose which piece of personal health information to store and provide the
          value you want to vault.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handlePhiSubmit}>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="phi-field" className="text-right">
              Field
            </Label>
            <div className="col-span-3">
              <Select
                value={phiModalType}
                onValueChange={(nextValue: PhiFieldType) => setPhiModalType(nextValue)}
              >
                <SelectTrigger id="phi-field">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {PHI_FIELD_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="phi-value" className="text-right">
              Value
            </Label>
            <div className="col-span-3 space-y-1">
              <Input
                id="phi-value"
                value={phiModalValue}
                onChange={event => setPhiModalValue(event.target.value)}
                placeholder="Enter field value"
                required
                disabled={phiSaving}
              />
              {phiModalError ? (
                <p className="text-xs text-red-600">{phiModalError}</p>
              ) : null}
            </div>
          </div>
        </div>
        <DialogFooter className="pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={closePhiModal}
            disabled={phiSaving}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={phiSaving}>
            {phiSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
    </div>
  );
}

