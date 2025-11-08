import { z } from 'zod';
import { Collection } from 'mongodb';
import { Database } from './db.js';
import type {
  Patient,
  Provider,
  Visit,
  Prescription,
  Lab,
  Treatment,
  Condition,
  Allergy,
  Immunization,
  VitalSigns,
  Procedure,
  Imaging,
  Insurance,
} from './types.js';
import {
  CreatePatientSchema,
  UpdatePatientSchema,
  GetPatientSchema,
  ListPatientsSchema,
  CreateProviderSchema,
  UpdateProviderSchema,
  GetProviderSchema,
  CreateVisitSchema,
  UpdateVisitSchema,
  GetVisitSchema,
  CreatePrescriptionSchema,
  UpdatePrescriptionSchema,
  GetPrescriptionSchema,
  CreateLabSchema,
  UpdateLabSchema,
  GetLabSchema,
  CreateTreatmentSchema,
  UpdateTreatmentSchema,
  GetTreatmentSchema,
  CreateConditionSchema,
  UpdateConditionSchema,
  GetConditionSchema,
  CreateAllergySchema,
  UpdateAllergySchema,
  GetAllergySchema,
  CreateImmunizationSchema,
  UpdateImmunizationSchema,
  GetImmunizationSchema,
  CreateVitalSignsSchema,
  UpdateVitalSignsSchema,
  GetVitalSignsSchema,
  CreateProcedureSchema,
  UpdateProcedureSchema,
  GetProcedureSchema,
  CreateImagingSchema,
  UpdateImagingSchema,
  GetImagingSchema,
  CreateInsuranceSchema,
  UpdateInsuranceSchema,
  GetInsuranceSchema,
} from './types.js';

export type ResourceType =
  | 'patient'
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
  idField: string; // e.g., 'patient_id', 'provider_id'
  createSchema: z.ZodType;
  updateSchema: z.ZodType;
  getSchema: z.ZodType;
  listSchema?: z.ZodType; // Optional list/filter schema
  getCollection: (db: Database) => Collection<any>;
  supportsBatch: boolean;
}

// Helper to get collection
function getCollection<T extends { _id: any }>(db: Database, name: keyof Database & string): Collection<T> {
  return (db as any)[name] as Collection<T>;
}

export const RESOURCE_REGISTRY: Record<ResourceType, ResourceDefinition> = {
  patient: {
    name: 'patient',
    description: 'Patient records',
    collectionName: 'patients',
    idField: 'patient_id',
    createSchema: CreatePatientSchema,
    updateSchema: UpdatePatientSchema,
    getSchema: GetPatientSchema,
    listSchema: ListPatientsSchema,
    getCollection: (db) => getCollection<Patient>(db, 'patients'),
    supportsBatch: true,
  },
  provider: {
    name: 'provider',
    description: 'Healthcare provider records',
    collectionName: 'providers',
    idField: 'provider_id',
    createSchema: CreateProviderSchema,
    updateSchema: UpdateProviderSchema,
    getSchema: GetProviderSchema,
    getCollection: (db) => getCollection<Provider>(db, 'providers'),
    supportsBatch: false,
  },
  visit: {
    name: 'visit',
    description: 'Visit/encounter records',
    collectionName: 'visits',
    idField: 'visit_id',
    createSchema: CreateVisitSchema,
    updateSchema: UpdateVisitSchema,
    getSchema: GetVisitSchema,
    getCollection: (db) => getCollection<Visit>(db, 'visits'),
    supportsBatch: true,
  },
  prescription: {
    name: 'prescription',
    description: 'Prescription records',
    collectionName: 'prescriptions',
    idField: 'prescription_id',
    createSchema: CreatePrescriptionSchema,
    updateSchema: UpdatePrescriptionSchema,
    getSchema: GetPrescriptionSchema,
    getCollection: (db) => getCollection<Prescription>(db, 'prescriptions'),
    supportsBatch: true,
  },
  lab: {
    name: 'lab',
    description: 'Lab order/result records',
    collectionName: 'labs',
    idField: 'lab_id',
    createSchema: CreateLabSchema,
    updateSchema: UpdateLabSchema,
    getSchema: GetLabSchema,
    getCollection: (db) => getCollection<Lab>(db, 'labs'),
    supportsBatch: true,
  },
  treatment: {
    name: 'treatment',
    description: 'Treatment plan records',
    collectionName: 'treatments',
    idField: 'treatment_id',
    createSchema: CreateTreatmentSchema,
    updateSchema: UpdateTreatmentSchema,
    getSchema: GetTreatmentSchema,
    getCollection: (db) => getCollection<Treatment>(db, 'treatments'),
    supportsBatch: false,
  },
  condition: {
    name: 'condition',
    description: 'Condition/diagnosis records',
    collectionName: 'conditions',
    idField: 'condition_id',
    createSchema: CreateConditionSchema,
    updateSchema: UpdateConditionSchema,
    getSchema: GetConditionSchema,
    getCollection: (db) => getCollection<Condition>(db, 'conditions'),
    supportsBatch: true,
  },
  allergy: {
    name: 'allergy',
    description: 'Allergy records',
    collectionName: 'allergies',
    idField: 'allergy_id',
    createSchema: CreateAllergySchema,
    updateSchema: UpdateAllergySchema,
    getSchema: GetAllergySchema,
    getCollection: (db) => getCollection<Allergy>(db, 'allergies'),
    supportsBatch: true,
  },
  immunization: {
    name: 'immunization',
    description: 'Immunization/vaccination records',
    collectionName: 'immunizations',
    idField: 'immunization_id',
    createSchema: CreateImmunizationSchema,
    updateSchema: UpdateImmunizationSchema,
    getSchema: GetImmunizationSchema,
    getCollection: (db) => getCollection<Immunization>(db, 'immunizations'),
    supportsBatch: true,
  },
  vital_signs: {
    name: 'vital_signs',
    description: 'Vital signs records',
    collectionName: 'vital_signs',
    idField: 'vitals_id',
    createSchema: CreateVitalSignsSchema,
    updateSchema: UpdateVitalSignsSchema,
    getSchema: GetVitalSignsSchema,
    getCollection: (db) => getCollection<VitalSigns>(db, 'vitalSigns'),
    supportsBatch: true,
  },
  procedure: {
    name: 'procedure',
    description: 'Procedure/surgery records',
    collectionName: 'procedures',
    idField: 'procedure_id',
    createSchema: CreateProcedureSchema,
    updateSchema: UpdateProcedureSchema,
    getSchema: GetProcedureSchema,
    getCollection: (db) => getCollection<Procedure>(db, 'procedures'),
    supportsBatch: true,
  },
  imaging: {
    name: 'imaging',
    description: 'Imaging/radiology records',
    collectionName: 'imaging',
    idField: 'imaging_id',
    createSchema: CreateImagingSchema,
    updateSchema: UpdateImagingSchema,
    getSchema: GetImagingSchema,
    getCollection: (db) => getCollection<Imaging>(db, 'imaging'),
    supportsBatch: true,
  },
  insurance: {
    name: 'insurance',
    description: 'Insurance coverage records',
    collectionName: 'insurance',
    idField: 'insurance_id',
    createSchema: CreateInsuranceSchema,
    updateSchema: UpdateInsuranceSchema,
    getSchema: GetInsuranceSchema,
    getCollection: (db) => getCollection<Insurance>(db, 'insurance'),
    supportsBatch: true,
  },
};

export function getResourceDefinition(resourceType: string): ResourceDefinition | null {
  return RESOURCE_REGISTRY[resourceType as ResourceType] || null;
}

export function getAllResourceTypes(): ResourceType[] {
  return Object.keys(RESOURCE_REGISTRY) as ResourceType[];
}

