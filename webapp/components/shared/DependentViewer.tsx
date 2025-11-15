'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { ScrollArea } from './ui/scroll-area';
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

const FIELD_LABEL_OVERRIDES: Record<string, string> = {
  record_identifier: 'Identifier',
  full_name: 'Name',
  patient_name: 'Name',
  provider_name: 'Provider Name',
  external_ref: 'External Reference',
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
]);

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

export function DependentViewer({ apiBaseUrl = '' }: DependentViewerProps) {
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [selectedDependent, setSelectedDependent] = useState<string>('');
  const [recordCounts, setRecordCounts] = useState<RecordCount[]>([]);
  const [selectedRecordType, setSelectedRecordType] = useState<string>('');
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [phiState, setPhiState] = useState<PhiState>('hidden');
  const [phiEntry, setPhiEntry] = useState<PhiVaultEntry | null>(null);
  const [phiError, setPhiError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/dependents`)
      .then(parseJsonResponse<Dependent[]>)
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setDependents(list);
        if (list.length > 0) {
          setSelectedDependent(list[0]._id);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching dependents:', err);
        setLoading(false);
      });
  }, [apiBaseUrl]);

  useEffect(() => {
    if (selectedDependent) {
      fetch(`${apiBaseUrl}/api/dependents/${selectedDependent}/counts`)
        .then(parseJsonResponse<RecordCount[]>)
        .then(data => {
          const counts = Array.isArray(data) ? data : [];
          setRecordCounts(counts);
          setSelectedRecordType(counts[0]?.type ?? '');
        })
        .catch(err => console.error('Error fetching counts:', err));
    }
  }, [selectedDependent, apiBaseUrl]);

  useEffect(() => {
    if (selectedDependent && selectedRecordType) {
      fetch(`${apiBaseUrl}/api/dependents/${selectedDependent}/records/${selectedRecordType}`)
        .then(parseJsonResponse<any[]>)
        .then(data => setRecords(Array.isArray(data) ? data : []))
        .catch(err => console.error('Error fetching records:', err));
    }
  }, [selectedDependent, selectedRecordType, apiBaseUrl]);

  useEffect(() => {
    setPhiState('hidden');
    setPhiEntry(null);
    setPhiError(null);
  }, [selectedDependent]);

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

  const renderPhiVaultSection = () => {
    if (!selectedDependentDetails) {
      return null;
    }

    const buttonLabel =
      phiState === 'visible' ? 'Hide PHI' : 'Reveal PHI';

    let body: React.ReactNode = (
      <p className="text-sm text-muted-foreground">
        PHI is stored securely and excluded from MCP responses. Select "Reveal PHI" to view it in this app.
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
        { label: 'Preferred Name', value: phiEntry?.preferred_name },
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
            <p className="text-sm font-semibold">PHI Vault</p>
            <p className="text-xs text-muted-foreground">
              {selectedDependentDetails.has_phi
                ? 'Sensitive identifiers are vaulted separately.'
                : 'Vault entry empty'}
            </p>
          </div>
          <button
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
            onClick={handleRevealPhi}
          >
            {buttonLabel}
          </button>
        </div>
        <div className="mt-3">{body}</div>
      </div>
    );
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
        label: 'Identifier',
        value: selectedDependentDetails.record_identifier,
      },
      { label: 'External Reference', value: selectedDependentDetails.external_ref },
      {
        label: 'Archived',
        value: selectedDependentDetails.archived ? 'Yes' : 'No',
      },
      {
        label: 'Created',
        value: formatDateValue(selectedDependentDetails.created_at),
      },
      {
        label: 'Updated',
        value: formatDateValue(selectedDependentDetails.updated_at),
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
                    {record.summary_text}
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
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg">Loading…</p>
      </div>
    );
  }

  if (dependents.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg">No profiles found in database.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b bg-background">
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Profile
            </p>
            <div className="w-full min-w-0 sm:w-64">
              <Select value={selectedDependent} onValueChange={setSelectedDependent}>
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
              <h2 className="text-2xl font-bold mb-6">
                {recordCounts.find(r => r.type === selectedRecordType)?.label || 'Records'}
              </h2>

              {selectedRecordType === 'active_summaries' ? (
                renderProfile()
              ) : records.length === 0 ? (
                <Card>
                  <CardContent className="p-6">
                    <p className="text-muted-foreground">No records found.</p>
                  </CardContent>
                </Card>
              ) : selectedRecordType === 'labs' ? (
                <div className="space-y-4">
                  {records.map((record, index) => (
                    <Card key={record._id || index}>
                      <CardHeader>
                        <CardTitle className="text-lg">{record.test_name}</CardTitle>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          {record.result_date && (
                            <span>Date: {formatDateValue(record.result_date) ?? record.result_date}</span>
                          )}
                          {record.status && <span>Status: {record.status}</span>}
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
                          <CardTitle className="text-lg">{titleCandidate}</CardTitle>
                          <p className="text-sm text-muted-foreground">
                            Updated {formatDateValue(record.updated_at) ?? 'N/A'}
                          </p>
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
    </div>
  );
}

