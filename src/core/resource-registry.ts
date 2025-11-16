import { z } from 'zod';
import {
  CreateDependentSchema,
  UpdateDependentSchema,
  GetDependentSchema,
  ListDependentsSchema,
  CreateProviderSchema,
  UpdateProviderSchema,
  GetProviderSchema,
  CreateVisitSchema,
  UpdateVisitSchema,
  GetVisitSchema,
  ListVisitsSchema,
  CreatePrescriptionSchema,
  UpdatePrescriptionSchema,
  GetPrescriptionSchema,
  ListPrescriptionsSchema,
  CreateLabSchema,
  UpdateLabSchema,
  GetLabSchema,
  ListLabsSchema,
  CreateTreatmentSchema,
  UpdateTreatmentSchema,
  GetTreatmentSchema,
  ListTreatmentsSchema,
  CreateConditionSchema,
  UpdateConditionSchema,
  GetConditionSchema,
  ListConditionsSchema,
  CreateAllergySchema,
  UpdateAllergySchema,
  GetAllergySchema,
  ListAllergiesSchema,
  CreateImmunizationSchema,
  UpdateImmunizationSchema,
  GetImmunizationSchema,
  ListImmunizationsSchema,
  CreateVitalSignsSchema,
  UpdateVitalSignsSchema,
  GetVitalSignsSchema,
  ListVitalSignsSchema,
  CreateProcedureSchema,
  UpdateProcedureSchema,
  GetProcedureSchema,
  ListProceduresSchema,
  CreateImagingSchema,
  UpdateImagingSchema,
  GetImagingSchema,
  ListImagingSchema,
  CreateInsuranceSchema,
  UpdateInsuranceSchema,
  GetInsuranceSchema,
  ListInsuranceSchema,
} from './types.js';

export type ResourceType =
  | 'dependent'
  | 'provider'
  | 'visit'
  | 'prescription'
  | 'lab'
  | 'treatment'
  | 'condition'
  | 'allergy'
  | 'immunization'
  | 'vital_signs'
  | 'procedure'
  | 'imaging'
  | 'insurance';

export interface ResourceDefinition {
  name: string;
  description: string;
  collectionName: string;
  idField: string; // e.g., 'dependent_id', 'provider_id'
  createSchema: z.ZodType;
  updateSchema: z.ZodType;
  getSchema: z.ZodType;
  listSchema?: z.ZodType; // Optional list/filter schema
  supportsBatch: boolean;
}

export const RESOURCE_REGISTRY: Record<ResourceType, ResourceDefinition> = {
  dependent: {
    name: 'dependent',
    description: 'Profiles',
    collectionName: 'dependents',
    idField: 'dependent_id',
    createSchema: CreateDependentSchema,
    updateSchema: UpdateDependentSchema,
    getSchema: GetDependentSchema,
    listSchema: ListDependentsSchema,
    supportsBatch: true,
  },
  provider: {
    name: 'provider',
    description: 'Healthcare providers',
    collectionName: 'providers',
    idField: 'provider_id',
    createSchema: CreateProviderSchema,
    updateSchema: UpdateProviderSchema,
    getSchema: GetProviderSchema,
    supportsBatch: false,
  },
  visit: {
    name: 'visit',
    description: 'Visits & encounters',
    collectionName: 'visits',
    idField: 'visit_id',
    createSchema: CreateVisitSchema,
    updateSchema: UpdateVisitSchema,
    getSchema: GetVisitSchema,
    listSchema: ListVisitsSchema,
    supportsBatch: true,
  },
  prescription: {
    name: 'prescription',
    description: 'Prescriptions',
    collectionName: 'prescriptions',
    idField: 'prescription_id',
    createSchema: CreatePrescriptionSchema,
    updateSchema: UpdatePrescriptionSchema,
    getSchema: GetPrescriptionSchema,
    listSchema: ListPrescriptionsSchema,
    supportsBatch: true,
  },
  lab: {
    name: 'lab',
    description: 'Lab orders & results',
    collectionName: 'labs',
    idField: 'lab_id',
    createSchema: CreateLabSchema,
    updateSchema: UpdateLabSchema,
    getSchema: GetLabSchema,
    listSchema: ListLabsSchema,
    supportsBatch: true,
  },
  treatment: {
    name: 'treatment',
    description: 'Treatment plans',
    collectionName: 'treatments',
    idField: 'treatment_id',
    createSchema: CreateTreatmentSchema,
    updateSchema: UpdateTreatmentSchema,
    getSchema: GetTreatmentSchema,
    listSchema: ListTreatmentsSchema,
    supportsBatch: false,
  },
  condition: {
    name: 'condition',
    description: 'Conditions & diagnoses',
    collectionName: 'conditions',
    idField: 'condition_id',
    createSchema: CreateConditionSchema,
    updateSchema: UpdateConditionSchema,
    getSchema: GetConditionSchema,
    listSchema: ListConditionsSchema,
    supportsBatch: true,
  },
  allergy: {
    name: 'allergy',
    description: 'Allergies',
    collectionName: 'allergies',
    idField: 'allergy_id',
    createSchema: CreateAllergySchema,
    updateSchema: UpdateAllergySchema,
    getSchema: GetAllergySchema,
    listSchema: ListAllergiesSchema,
    supportsBatch: true,
  },
  immunization: {
    name: 'immunization',
    description: 'Immunizations & vaccinations',
    collectionName: 'immunizations',
    idField: 'immunization_id',
    createSchema: CreateImmunizationSchema,
    updateSchema: UpdateImmunizationSchema,
    getSchema: GetImmunizationSchema,
    listSchema: ListImmunizationsSchema,
    supportsBatch: true,
  },
  vital_signs: {
    name: 'vital_signs',
    description: 'Vital signs',
    collectionName: 'vital_signs',
    idField: 'vitals_id',
    createSchema: CreateVitalSignsSchema,
    updateSchema: UpdateVitalSignsSchema,
    getSchema: GetVitalSignsSchema,
    listSchema: ListVitalSignsSchema,
    supportsBatch: true,
  },
  procedure: {
    name: 'procedure',
    description: 'Procedures & surgeries',
    collectionName: 'procedures',
    idField: 'procedure_id',
    createSchema: CreateProcedureSchema,
    updateSchema: UpdateProcedureSchema,
    getSchema: GetProcedureSchema,
    listSchema: ListProceduresSchema,
    supportsBatch: true,
  },
  imaging: {
    name: 'imaging',
    description: 'Imaging & radiology',
    collectionName: 'imaging',
    idField: 'imaging_id',
    createSchema: CreateImagingSchema,
    updateSchema: UpdateImagingSchema,
    getSchema: GetImagingSchema,
    listSchema: ListImagingSchema,
    supportsBatch: true,
  },
  insurance: {
    name: 'insurance',
    description: 'Insurance coverage',
    collectionName: 'insurance',
    idField: 'insurance_id',
    createSchema: CreateInsuranceSchema,
    updateSchema: UpdateInsuranceSchema,
    getSchema: GetInsuranceSchema,
    listSchema: ListInsuranceSchema,
    supportsBatch: true,
  },
};

export function getResourceDefinition(resourceType: string): ResourceDefinition | null {
  return RESOURCE_REGISTRY[resourceType as ResourceType] || null;
}

export function getAllResourceTypes(): ResourceType[] {
  return Object.keys(RESOURCE_REGISTRY) as ResourceType[];
}

