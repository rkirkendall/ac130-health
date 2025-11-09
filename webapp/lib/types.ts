export interface Patient {
  _id: string;
  name?: { given?: string; family?: string };
  external_ref?: string;
  relationship?: string;
  dob?: string;
  sex?: string;
  contact?: { phone?: string; email?: string };
  created_at: string;
  updated_at: string;
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
  { type: 'active_summaries', label: 'Health Summary' },
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

