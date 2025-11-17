export interface Dependent {
  _id: string;
  dependent_id: string;
  record_identifier: string;
  archived?: boolean;
  phi_vault_id?: string;
  has_phi?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PhiVaultEntry {
  _id?: string;
  dependent_id?: string;
  legal_name?: { given?: string; family?: string };
  relationship_note?: string;
  full_dob?: string;
  birth_year?: number;
  sex?: string;
  contact?: { phone?: string; email?: string };
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  created_at?: string;
  updated_at?: string;
}

export interface RecordCount {
  type: string;
  label: string;
  count: number;
}

export interface RecordData {
  [key: string]: any;
}

export const RECORD_TYPES = [
  { type: 'active_summaries', label: 'Summary' },
  { type: 'visits', label: 'Visits' },
  { type: 'prescriptions', label: 'Prescriptions' },
  { type: 'labs', label: 'Labs' },
  { type: 'conditions', label: 'Conditions' },
  { type: 'allergies', label: 'Allergies' },
  { type: 'immunizations', label: 'Immunizations' },
  { type: 'vital_signs', label: 'Vital Signs' },
  { type: 'procedures', label: 'Procedures' },
  { type: 'imaging', label: 'Imaging' },
  { type: 'insurance', label: 'Insurance' },
  { type: 'treatments', label: 'Treatments' },
];
