import { ObjectId } from 'mongodb';
import { z } from 'zod';

// MongoDB Document Types
export interface Patient {
  _id: ObjectId;
  name?: { given?: string; family?: string };
  external_ref?: string;
  relationship?: string;
  dob?: string;
  sex?: string;
  contact?: { phone?: string; email?: string };
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface ActiveSummary {
  _id: ObjectId;
  patient_id: ObjectId;
  summary_text: string;
  updated_at: Date;
  version?: number;
}

export interface Provider {
  _id: ObjectId;
  name: string;
  organization?: string;
  specialty?: string;
  contact?: { phone?: string; email?: string };
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface Visit {
  _id: ObjectId;
  patient_id: ObjectId;
  date?: string;
  provider_id?: ObjectId;
  type?: 'office' | 'er' | 'telehealth' | 'inpatient' | 'other';
  reason?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface Prescription {
  _id: ObjectId;
  patient_id: ObjectId;
  medication_name: string;
  dose?: string;
  frequency?: string;
  start_date?: string;
  stop_date?: string;
  status?: 'active' | 'stopped' | 'completed';
  prescriber_id?: ObjectId;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface Lab {
  _id: ObjectId;
  patient_id: ObjectId;
  test_name: string;
  components?: Array<{
    name: string;
    value?: string | number;
    unit?: string;
    reference_range?: string;
  }>;
  results?: Array<{
    test: string;
    flag?: string;
    value?: string | number;
    unit?: string;
    reference_range?: string;
  }>;
  collected_at?: Date;
  order_date?: string;
  result_date?: string;
  ordered_by?: ObjectId;
  status?: 'pending' | 'final' | 'corrected';
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface Condition {
  _id: ObjectId;
  patient_id: ObjectId;
  name: string;
  diagnosed_date?: string;
  resolved_date?: string;
  status?: 'active' | 'resolved' | 'chronic';
  severity?: 'mild' | 'moderate' | 'severe';
  notes?: string;
  diagnosed_by?: ObjectId;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface Treatment {
  _id: ObjectId;
  patient_id: ObjectId;
  title?: string;
  description?: string;
  start_date?: string;
  provider_id?: ObjectId;
  tasks?: Array<{ description: string; status?: string }>;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface Allergy {
  _id: ObjectId;
  patient_id: ObjectId;
  allergen: string;
  type?: 'drug' | 'food' | 'environmental' | 'other';
  reaction?: string;
  severity?: 'mild' | 'moderate' | 'severe' | 'life-threatening';
  onset_date?: string;
  notes?: string;
  verified_by?: ObjectId;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface Immunization {
  _id: ObjectId;
  patient_id: ObjectId;
  vaccine_name: string;
  date_administered?: string;
  dose_number?: number;
  lot_number?: string;
  administered_by?: ObjectId;
  site?: string;
  route?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface VitalSigns {
  _id: ObjectId;
  patient_id: ObjectId;
  recorded_at: Date;
  recorded_by?: ObjectId;
  blood_pressure?: {
    systolic?: number;
    diastolic?: number;
    unit?: string;
  };
  heart_rate?: {
    value?: number;
    unit?: string;
  };
  temperature?: {
    value?: number;
    unit?: string;
  };
  respiratory_rate?: {
    value?: number;
    unit?: string;
  };
  oxygen_saturation?: {
    value?: number;
    unit?: string;
  };
  weight?: {
    value?: number;
    unit?: string;
  };
  height?: {
    value?: number;
    unit?: string;
  };
  bmi?: number;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface Procedure {
  _id: ObjectId;
  patient_id: ObjectId;
  procedure_name: string;
  procedure_type?: 'surgery' | 'diagnostic' | 'therapeutic' | 'other';
  date_performed?: string;
  performed_by?: ObjectId;
  location?: string;
  indication?: string;
  outcome?: string;
  complications?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface Imaging {
  _id: ObjectId;
  patient_id: ObjectId;
  study_type: string;
  modality?: 'X-Ray' | 'CT' | 'MRI' | 'Ultrasound' | 'PET' | 'Nuclear' | 'Other';
  body_site?: string;
  study_date?: string;
  ordered_by?: ObjectId;
  performed_at?: string;
  findings?: string;
  impression?: string;
  report_url?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

export interface Insurance {
  _id: ObjectId;
  patient_id: ObjectId;
  provider_name: string;
  plan_name?: string;
  policy_number?: string;
  group_number?: string;
  subscriber_name?: string;
  subscriber_relationship?: string;
  coverage_type?: 'primary' | 'secondary' | 'tertiary';
  effective_date?: string;
  termination_date?: string;
  phone?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  updated_by?: string;
}

// Zod Schemas for Input Validation
const PatientDataSchema = z.object({
  name: z.object({
    given: z.string().optional(),
    family: z.string().optional(),
  }).optional(),
  external_ref: z.string().optional(),
  relationship: z.string().optional(),
  dob: z.string().optional(),
  sex: z.string().optional(),
  contact: z.object({
    phone: z.string().optional(),
    email: z.string().optional(),
  }).optional(),
});

export const CreatePatientSchema = z.union([
  PatientDataSchema,
  z.array(PatientDataSchema),
]);

export const UpdatePatientSchema = z.object({
  patient_id: z.string(),
  name: z.object({
    given: z.string().optional(),
    family: z.string().optional(),
  }).optional(),
  external_ref: z.string().optional(),
  relationship: z.string().optional(),
  dob: z.string().optional(),
  sex: z.string().optional(),
  contact: z.object({
    phone: z.string().optional(),
    email: z.string().optional(),
  }).optional(),
});

export const GetPatientSchema = z.object({
  patient_id: z.string(),
});

export const ListPatientsSchema = z.object({
  relationship: z.string().optional(),
  limit: z.number().optional(),
});

export const CreateProviderSchema = z.object({
  name: z.string(),
  organization: z.string().optional(),
  specialty: z.string().optional(),
  contact: z.object({
    phone: z.string().optional(),
    email: z.string().optional(),
  }).optional(),
});

export const UpdateProviderSchema = z.object({
  provider_id: z.string(),
  name: z.string().optional(),
  organization: z.string().optional(),
  specialty: z.string().optional(),
  contact: z.object({
    phone: z.string().optional(),
    email: z.string().optional(),
  }).optional(),
});

export const GetProviderSchema = z.object({
  provider_id: z.string(),
});

const VisitDataSchema = z.object({
  patient_id: z.string(),
  date: z.string().optional(),
  provider_id: z.string().optional(),
  type: z.enum(['office', 'er', 'telehealth', 'inpatient', 'other']).optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

export const CreateVisitSchema = z.union([
  VisitDataSchema,
  z.array(VisitDataSchema),
]);

export const UpdateVisitSchema = z.object({
  visit_id: z.string(),
  date: z.string().optional(),
  provider_id: z.string().optional(),
  type: z.enum(['office', 'er', 'telehealth', 'inpatient', 'other']).optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

export const GetVisitSchema = z.object({
  visit_id: z.string(),
});

export const ListVisitsSchema = z.object({
  patient_id: z.string().optional(),
  provider_id: z.string().optional(),
  type: z.enum(['office', 'er', 'telehealth', 'inpatient', 'other']).optional(),
  limit: z.number().optional(),
});

const PrescriptionDataSchema = z.object({
  patient_id: z.string(),
  medication_name: z.string(),
  dose: z.string().optional(),
  frequency: z.string().optional(),
  start_date: z.string().optional(),
  stop_date: z.string().optional(),
  status: z.enum(['active', 'stopped', 'completed']).optional(),
  prescriber_id: z.string().optional(),
});

export const CreatePrescriptionSchema = z.union([
  PrescriptionDataSchema,
  z.array(PrescriptionDataSchema),
]);

export const UpdatePrescriptionSchema = z.object({
  prescription_id: z.string(),
  medication_name: z.string().optional(),
  dose: z.string().optional(),
  frequency: z.string().optional(),
  start_date: z.string().optional(),
  stop_date: z.string().optional(),
  status: z.enum(['active', 'stopped', 'completed']).optional(),
  prescriber_id: z.string().optional(),
});

export const GetPrescriptionSchema = z.object({
  prescription_id: z.string(),
});

export const ListPrescriptionsSchema = z.object({
  patient_id: z.string().optional(),
  prescriber_id: z.string().optional(),
  status: z.enum(['active', 'stopped', 'completed']).optional(),
  medication_name: z.string().optional(),
  limit: z.number().optional(),
});

const LabDataSchema = z.object({
  patient_id: z.string(),
  test_name: z.string(),
  components: z.array(z.object({
    name: z.string(),
    value: z.union([z.string(), z.number()]).optional(),
    unit: z.string().optional(),
    reference_range: z.string().optional(),
  })).optional(),
  results: z.array(z.object({
    test: z.string(),
    flag: z.string().optional(),
    value: z.union([z.string(), z.number()]).optional(),
    unit: z.string().optional(),
    reference_range: z.string().optional(),
  })).optional(),
  collected_at: z.string().optional(),
  order_date: z.string().optional(),
  result_date: z.string().optional(),
  ordered_by: z.string().optional(),
  status: z.enum(['pending', 'final', 'corrected']).optional(),
});

export const CreateLabSchema = z.union([
  LabDataSchema,
  z.array(LabDataSchema),
]);

export const UpdateLabSchema = z.object({
  lab_id: z.string(),
  test_name: z.string().optional(),
  components: z.array(z.object({
    name: z.string(),
    value: z.union([z.string(), z.number()]).optional(),
    unit: z.string().optional(),
    reference_range: z.string().optional(),
  })).optional(),
  results: z.array(z.object({
    test: z.string(),
    flag: z.string().optional(),
    value: z.union([z.string(), z.number()]).optional(),
    unit: z.string().optional(),
    reference_range: z.string().optional(),
  })).optional(),
  collected_at: z.string().optional(),
  order_date: z.string().optional(),
  result_date: z.string().optional(),
  ordered_by: z.string().optional(),
  status: z.enum(['pending', 'final', 'corrected']).optional(),
});

export const GetLabSchema = z.object({
  lab_id: z.string(),
});

export const ListLabsSchema = z.object({
  patient_id: z.string().optional(),
  test_name: z.string().optional(),
  status: z.enum(['pending', 'final', 'corrected']).optional(),
  ordered_by: z.string().optional(),
  limit: z.number().optional(),
});

export const CreateTreatmentSchema = z.object({
  patient_id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  start_date: z.string().optional(),
  provider_id: z.string().optional(),
  tasks: z.array(z.object({
    description: z.string(),
    status: z.string().optional(),
  })).optional(),
});

export const UpdateTreatmentSchema = z.object({
  treatment_id: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  start_date: z.string().optional(),
  provider_id: z.string().optional(),
  tasks: z.array(z.object({
    description: z.string(),
    status: z.string().optional(),
  })).optional(),
});

export const GetTreatmentSchema = z.object({
  treatment_id: z.string(),
});

export const ListTreatmentsSchema = z.object({
  patient_id: z.string().optional(),
  provider_id: z.string().optional(),
  title: z.string().optional(),
  limit: z.number().optional(),
});

const ConditionDataSchema = z.object({
  patient_id: z.string(),
  name: z.string(),
  diagnosed_date: z.string().optional(),
  resolved_date: z.string().optional(),
  status: z.enum(['active', 'resolved', 'chronic']).optional(),
  severity: z.enum(['mild', 'moderate', 'severe']).optional(),
  notes: z.string().optional(),
  diagnosed_by: z.string().optional(),
});

export const CreateConditionSchema = z.union([
  ConditionDataSchema,
  z.array(ConditionDataSchema),
]);

export const UpdateConditionSchema = z.object({
  condition_id: z.string(),
  name: z.string().optional(),
  diagnosed_date: z.string().optional(),
  resolved_date: z.string().optional(),
  status: z.enum(['active', 'resolved', 'chronic']).optional(),
  severity: z.enum(['mild', 'moderate', 'severe']).optional(),
  notes: z.string().optional(),
  diagnosed_by: z.string().optional(),
});

export const GetConditionSchema = z.object({
  condition_id: z.string(),
});

export const ListConditionsSchema = z.object({
  patient_id: z.string().optional(),
  diagnosed_by: z.string().optional(),
  status: z.enum(['active', 'resolved', 'chronic']).optional(),
  severity: z.enum(['mild', 'moderate', 'severe']).optional(),
  limit: z.number().optional(),
});

// Allergy Schemas
const AllergyDataSchema = z.object({
  patient_id: z.string(),
  allergen: z.string(),
  type: z.enum(['drug', 'food', 'environmental', 'other']).optional(),
  reaction: z.string().optional(),
  severity: z.enum(['mild', 'moderate', 'severe', 'life-threatening']).optional(),
  onset_date: z.string().optional(),
  notes: z.string().optional(),
  verified_by: z.string().optional(),
});

export const CreateAllergySchema = z.union([
  AllergyDataSchema,
  z.array(AllergyDataSchema),
]);

export const UpdateAllergySchema = z.object({
  allergy_id: z.string(),
  allergen: z.string().optional(),
  type: z.enum(['drug', 'food', 'environmental', 'other']).optional(),
  reaction: z.string().optional(),
  severity: z.enum(['mild', 'moderate', 'severe', 'life-threatening']).optional(),
  onset_date: z.string().optional(),
  notes: z.string().optional(),
  verified_by: z.string().optional(),
});

export const GetAllergySchema = z.object({
  allergy_id: z.string(),
});

export const ListAllergiesSchema = z.object({
  patient_id: z.string().optional(),
  type: z.enum(['drug', 'food', 'environmental', 'other']).optional(),
  severity: z.enum(['mild', 'moderate', 'severe', 'life-threatening']).optional(),
  limit: z.number().optional(),
});

// Immunization Schemas
const ImmunizationDataSchema = z.object({
  patient_id: z.string(),
  vaccine_name: z.string(),
  date_administered: z.string().optional(),
  dose_number: z.number().optional(),
  lot_number: z.string().optional(),
  administered_by: z.string().optional(),
  site: z.string().optional(),
  route: z.string().optional(),
  notes: z.string().optional(),
});

export const CreateImmunizationSchema = z.union([
  ImmunizationDataSchema,
  z.array(ImmunizationDataSchema),
]);

export const UpdateImmunizationSchema = z.object({
  immunization_id: z.string(),
  vaccine_name: z.string().optional(),
  date_administered: z.string().optional(),
  dose_number: z.number().optional(),
  lot_number: z.string().optional(),
  administered_by: z.string().optional(),
  site: z.string().optional(),
  route: z.string().optional(),
  notes: z.string().optional(),
});

export const GetImmunizationSchema = z.object({
  immunization_id: z.string(),
});

export const ListImmunizationsSchema = z.object({
  patient_id: z.string().optional(),
  vaccine_name: z.string().optional(),
  administered_by: z.string().optional(),
  limit: z.number().optional(),
});

// Vital Signs Schemas
const VitalSignsDataSchema = z.object({
  patient_id: z.string(),
  recorded_at: z.string().optional(),
  recorded_by: z.string().optional(),
  blood_pressure: z.object({
    systolic: z.number().optional(),
    diastolic: z.number().optional(),
    unit: z.string().optional(),
  }).optional(),
  heart_rate: z.object({
    value: z.number().optional(),
    unit: z.string().optional(),
  }).optional(),
  temperature: z.object({
    value: z.number().optional(),
    unit: z.string().optional(),
  }).optional(),
  respiratory_rate: z.object({
    value: z.number().optional(),
    unit: z.string().optional(),
  }).optional(),
  oxygen_saturation: z.object({
    value: z.number().optional(),
    unit: z.string().optional(),
  }).optional(),
  weight: z.object({
    value: z.number().optional(),
    unit: z.string().optional(),
  }).optional(),
  height: z.object({
    value: z.number().optional(),
    unit: z.string().optional(),
  }).optional(),
  bmi: z.number().optional(),
  notes: z.string().optional(),
});

export const CreateVitalSignsSchema = z.union([
  VitalSignsDataSchema,
  z.array(VitalSignsDataSchema),
]);

export const UpdateVitalSignsSchema = z.object({
  vitals_id: z.string(),
  recorded_at: z.string().optional(),
  recorded_by: z.string().optional(),
  blood_pressure: z.object({
    systolic: z.number().optional(),
    diastolic: z.number().optional(),
    unit: z.string().optional(),
  }).optional(),
  heart_rate: z.object({
    value: z.number().optional(),
    unit: z.string().optional(),
  }).optional(),
  temperature: z.object({
    value: z.number().optional(),
    unit: z.string().optional(),
  }).optional(),
  respiratory_rate: z.object({
    value: z.number().optional(),
    unit: z.string().optional(),
  }).optional(),
  oxygen_saturation: z.object({
    value: z.number().optional(),
    unit: z.string().optional(),
  }).optional(),
  weight: z.object({
    value: z.number().optional(),
    unit: z.string().optional(),
  }).optional(),
  height: z.object({
    value: z.number().optional(),
    unit: z.string().optional(),
  }).optional(),
  bmi: z.number().optional(),
  notes: z.string().optional(),
});

export const GetVitalSignsSchema = z.object({
  vitals_id: z.string(),
});

export const ListVitalSignsSchema = z.object({
  patient_id: z.string().optional(),
  recorded_by: z.string().optional(),
  limit: z.number().optional(),
});

// Procedure Schemas
const ProcedureDataSchema = z.object({
  patient_id: z.string(),
  procedure_name: z.string(),
  procedure_type: z.enum(['surgery', 'diagnostic', 'therapeutic', 'other']).optional(),
  date_performed: z.string().optional(),
  performed_by: z.string().optional(),
  location: z.string().optional(),
  indication: z.string().optional(),
  outcome: z.string().optional(),
  complications: z.string().optional(),
  notes: z.string().optional(),
});

export const CreateProcedureSchema = z.union([
  ProcedureDataSchema,
  z.array(ProcedureDataSchema),
]);

export const UpdateProcedureSchema = z.object({
  procedure_id: z.string(),
  procedure_name: z.string().optional(),
  procedure_type: z.enum(['surgery', 'diagnostic', 'therapeutic', 'other']).optional(),
  date_performed: z.string().optional(),
  performed_by: z.string().optional(),
  location: z.string().optional(),
  indication: z.string().optional(),
  outcome: z.string().optional(),
  complications: z.string().optional(),
  notes: z.string().optional(),
});

export const GetProcedureSchema = z.object({
  procedure_id: z.string(),
});

export const ListProceduresSchema = z.object({
  patient_id: z.string().optional(),
  procedure_type: z.enum(['surgery', 'diagnostic', 'therapeutic', 'other']).optional(),
  performed_by: z.string().optional(),
  limit: z.number().optional(),
});

// Imaging Schemas
const ImagingDataSchema = z.object({
  patient_id: z.string(),
  study_type: z.string(),
  modality: z.enum(['X-Ray', 'CT', 'MRI', 'Ultrasound', 'PET', 'Nuclear', 'Other']).optional(),
  body_site: z.string().optional(),
  study_date: z.string().optional(),
  ordered_by: z.string().optional(),
  performed_at: z.string().optional(),
  findings: z.string().optional(),
  impression: z.string().optional(),
  report_url: z.string().optional(),
  notes: z.string().optional(),
});

export const CreateImagingSchema = z.union([
  ImagingDataSchema,
  z.array(ImagingDataSchema),
]);

export const UpdateImagingSchema = z.object({
  imaging_id: z.string(),
  study_type: z.string().optional(),
  modality: z.enum(['X-Ray', 'CT', 'MRI', 'Ultrasound', 'PET', 'Nuclear', 'Other']).optional(),
  body_site: z.string().optional(),
  study_date: z.string().optional(),
  ordered_by: z.string().optional(),
  performed_at: z.string().optional(),
  findings: z.string().optional(),
  impression: z.string().optional(),
  report_url: z.string().optional(),
  notes: z.string().optional(),
});

export const GetImagingSchema = z.object({
  imaging_id: z.string(),
});

export const ListImagingSchema = z.object({
  patient_id: z.string().optional(),
  modality: z.enum(['X-Ray', 'CT', 'MRI', 'Ultrasound', 'PET', 'Nuclear', 'Other']).optional(),
  ordered_by: z.string().optional(),
  limit: z.number().optional(),
});

// Insurance Schemas
const InsuranceDataSchema = z.object({
  patient_id: z.string(),
  provider_name: z.string(),
  plan_name: z.string().optional(),
  policy_number: z.string().optional(),
  group_number: z.string().optional(),
  subscriber_name: z.string().optional(),
  subscriber_relationship: z.string().optional(),
  coverage_type: z.enum(['primary', 'secondary', 'tertiary']).optional(),
  effective_date: z.string().optional(),
  termination_date: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export const CreateInsuranceSchema = z.union([
  InsuranceDataSchema,
  z.array(InsuranceDataSchema),
]);

export const UpdateInsuranceSchema = z.object({
  insurance_id: z.string(),
  provider_name: z.string().optional(),
  plan_name: z.string().optional(),
  policy_number: z.string().optional(),
  group_number: z.string().optional(),
  subscriber_name: z.string().optional(),
  subscriber_relationship: z.string().optional(),
  coverage_type: z.enum(['primary', 'secondary', 'tertiary']).optional(),
  effective_date: z.string().optional(),
  termination_date: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export const GetInsuranceSchema = z.object({
  insurance_id: z.string(),
});

export const ListInsuranceSchema = z.object({
  patient_id: z.string().optional(),
  coverage_type: z.enum(['primary', 'secondary', 'tertiary']).optional(),
  provider_name: z.string().optional(),
  limit: z.number().optional(),
});

export const UpdateHealthSummarySchema = z.object({
  patient_id: z.string(),
  summary_text: z.string(),
});

