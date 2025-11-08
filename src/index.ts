#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { Database } from './db.js';
import { CARE_MANAGER_BASE_PROMPT } from './prompts.js';

// Tool imports
import { createPatient, updatePatient, getPatient, listPatients } from './tools/patients.js';
import { createProvider, updateProvider, getProvider } from './tools/providers.js';
import { createVisit, updateVisit, getVisit } from './tools/visits.js';
import { createPrescription, updatePrescription, getPrescription } from './tools/prescriptions.js';
import { createLab, updateLab, getLab } from './tools/labs.js';
import { createTreatment, updateTreatment, getTreatment } from './tools/treatments.js';
import { createCondition, updateCondition, getCondition } from './tools/conditions.js';
import { createAllergy, updateAllergy, getAllergy } from './tools/allergies.js';
import { createImmunization, updateImmunization, getImmunization } from './tools/immunizations.js';
import { createVitalSigns, updateVitalSigns, getVitalSigns } from './tools/vitals.js';
import { createProcedure, updateProcedure, getProcedure } from './tools/procedures.js';
import { createImaging, updateImaging, getImaging } from './tools/imaging.js';
import { createInsurance, updateInsurance, getInsurance } from './tools/insurance.js';
import { updateHealthSummary, getHealthSummary } from './tools/summary.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.HEALTH_RECORD_DB_NAME || 'health_record';

const server = new Server(
  {
    name: 'health-record-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
    },
  }
);

const db = new Database(MONGO_URI, DB_NAME);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'create_patient',
        description: 'Create one or more patient records. Accepts a single patient object or an array of patient objects for bulk creation. Each patient can have an optional relationship field (e.g., "dad", "mom", "spouse").',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'object',
              properties: {
                given: { type: 'string', description: 'Given/first name' },
                family: { type: 'string', description: 'Family/last name' },
              },
            },
            external_ref: { type: 'string', description: 'External reference ID' },
            relationship: { type: 'string', description: 'Relationship to user (e.g., "dad", "mom", "spouse", "self")' },
            dob: { type: 'string', description: 'Date of birth (YYYY-MM-DD)' },
            sex: { type: 'string', description: 'Sex' },
            contact: {
              type: 'object',
              properties: {
                phone: { type: 'string' },
                email: { type: 'string' },
              },
            },
          },
        },
      },
      {
        name: 'update_patient',
        description: 'Update an existing patient record',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
            name: {
              type: 'object',
              properties: {
                given: { type: 'string' },
                family: { type: 'string' },
              },
            },
            external_ref: { type: 'string' },
            relationship: { type: 'string' },
            dob: { type: 'string' },
            sex: { type: 'string' },
            contact: {
              type: 'object',
              properties: {
                phone: { type: 'string' },
                email: { type: 'string' },
              },
            },
          },
          required: ['patient_id'],
        },
      },
      {
        name: 'get_patient',
        description: 'Get a patient record by ID',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
          },
          required: ['patient_id'],
        },
      },
      {
        name: 'list_patients',
        description: 'List patients, optionally filtered by relationship (e.g., "dad", "mom"). Use this to find a patient when you know their relationship but not their ID.',
        inputSchema: {
          type: 'object',
          properties: {
            relationship: { type: 'string', description: 'Filter by relationship (e.g., "dad", "mom", "spouse")' },
            limit: { type: 'number', description: 'Maximum number of results (default 50)' },
          },
        },
      },
      {
        name: 'create_provider',
        description: 'Create a new healthcare provider record',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Provider name' },
            organization: { type: 'string', description: 'Organization/practice name' },
            specialty: { type: 'string', description: 'Medical specialty' },
            contact: {
              type: 'object',
              properties: {
                phone: { type: 'string' },
                email: { type: 'string' },
              },
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'update_provider',
        description: 'Update an existing provider record',
        inputSchema: {
          type: 'object',
          properties: {
            provider_id: { type: 'string', description: 'Provider ID' },
            name: { type: 'string' },
            organization: { type: 'string' },
            specialty: { type: 'string' },
            contact: {
              type: 'object',
              properties: {
                phone: { type: 'string' },
                email: { type: 'string' },
              },
            },
          },
          required: ['provider_id'],
        },
      },
      {
        name: 'get_provider',
        description: 'Get a provider record by ID',
        inputSchema: {
          type: 'object',
          properties: {
            provider_id: { type: 'string', description: 'Provider ID' },
          },
          required: ['provider_id'],
        },
      },
      {
        name: 'create_visit',
        description: 'Create one or more visit/encounter records. Accepts a single visit object or an array of visit objects for bulk creation.',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
            date: { type: 'string', description: 'Visit date (YYYY-MM-DD)' },
            provider_id: { type: 'string', description: 'Provider ID' },
            type: { 
              type: 'string', 
              enum: ['office', 'er', 'telehealth', 'inpatient', 'other'],
              description: 'Type of visit',
            },
            reason: { type: 'string', description: 'Reason for visit' },
            notes: { type: 'string', description: 'Visit notes' },
          },
          required: ['patient_id'],
        },
      },
      {
        name: 'update_visit',
        description: 'Update an existing visit record',
        inputSchema: {
          type: 'object',
          properties: {
            visit_id: { type: 'string', description: 'Visit ID' },
            date: { type: 'string' },
            provider_id: { type: 'string' },
            type: { 
              type: 'string', 
              enum: ['office', 'er', 'telehealth', 'inpatient', 'other'],
            },
            reason: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['visit_id'],
        },
      },
      {
        name: 'get_visit',
        description: 'Get a visit record by ID',
        inputSchema: {
          type: 'object',
          properties: {
            visit_id: { type: 'string', description: 'Visit ID' },
          },
          required: ['visit_id'],
        },
      },
      {
        name: 'create_prescription',
        description: 'Create one or more prescription records. Accepts a single prescription object or an array of prescription objects for bulk creation.',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
            medication_name: { type: 'string', description: 'Medication name' },
            dose: { type: 'string', description: 'Dose (e.g., "10 mg")' },
            frequency: { type: 'string', description: 'Frequency (e.g., "once daily")' },
            start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
            stop_date: { type: 'string', description: 'Stop date (YYYY-MM-DD)' },
            status: { 
              type: 'string', 
              enum: ['active', 'stopped', 'completed'],
              description: 'Status',
            },
            prescriber_id: { type: 'string', description: 'Prescriber provider ID' },
          },
          required: ['patient_id', 'medication_name'],
        },
      },
      {
        name: 'update_prescription',
        description: 'Update an existing prescription record',
        inputSchema: {
          type: 'object',
          properties: {
            prescription_id: { type: 'string', description: 'Prescription ID' },
            medication_name: { type: 'string' },
            dose: { type: 'string' },
            frequency: { type: 'string' },
            start_date: { type: 'string' },
            stop_date: { type: 'string' },
            status: { 
              type: 'string', 
              enum: ['active', 'stopped', 'completed'],
            },
            prescriber_id: { type: 'string' },
          },
          required: ['prescription_id'],
        },
      },
      {
        name: 'get_prescription',
        description: 'Get a prescription record by ID',
        inputSchema: {
          type: 'object',
          properties: {
            prescription_id: { type: 'string', description: 'Prescription ID' },
          },
          required: ['prescription_id'],
        },
      },
      {
        name: 'create_lab',
        description: 'Create one or more lab order/result records. Accepts a single lab object or an array of lab objects for bulk creation.',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
            test_name: { type: 'string', description: 'Test name (e.g., "CBC", "A1C")' },
            components: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Component name' },
                  value: { type: ['string', 'number'], description: 'Result value' },
                  unit: { type: 'string', description: 'Unit of measurement' },
                  reference_range: { type: 'string', description: 'Reference range' },
                },
                required: ['name'],
              },
            },
            collected_at: { type: 'string', description: 'Collection date/time (ISO 8601)' },
            ordered_by: { type: 'string', description: 'Ordering provider ID' },
            status: { 
              type: 'string', 
              enum: ['pending', 'final', 'corrected'],
              description: 'Status',
            },
          },
          required: ['patient_id', 'test_name'],
        },
      },
      {
        name: 'update_lab',
        description: 'Update an existing lab record',
        inputSchema: {
          type: 'object',
          properties: {
            lab_id: { type: 'string', description: 'Lab ID' },
            test_name: { type: 'string' },
            components: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  value: { type: ['string', 'number'] },
                  unit: { type: 'string' },
                  reference_range: { type: 'string' },
                },
                required: ['name'],
              },
            },
            collected_at: { type: 'string' },
            ordered_by: { type: 'string' },
            status: { 
              type: 'string', 
              enum: ['pending', 'final', 'corrected'],
            },
          },
          required: ['lab_id'],
        },
      },
      {
        name: 'get_lab',
        description: 'Get a lab record by ID',
        inputSchema: {
          type: 'object',
          properties: {
            lab_id: { type: 'string', description: 'Lab ID' },
          },
          required: ['lab_id'],
        },
      },
      {
        name: 'create_treatment',
        description: 'Create a new treatment plan record',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
            title: { type: 'string', description: 'Treatment title' },
            description: { type: 'string', description: 'Treatment description' },
            start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
            provider_id: { type: 'string', description: 'Provider ID' },
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  status: { type: 'string' },
                },
                required: ['description'],
              },
            },
          },
          required: ['patient_id'],
        },
      },
      {
        name: 'update_treatment',
        description: 'Update an existing treatment plan record',
        inputSchema: {
          type: 'object',
          properties: {
            treatment_id: { type: 'string', description: 'Treatment ID' },
            title: { type: 'string' },
            description: { type: 'string' },
            start_date: { type: 'string' },
            provider_id: { type: 'string' },
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  status: { type: 'string' },
                },
                required: ['description'],
              },
            },
          },
          required: ['treatment_id'],
        },
      },
      {
        name: 'get_treatment',
        description: 'Get a treatment plan record by ID',
        inputSchema: {
          type: 'object',
          properties: {
            treatment_id: { type: 'string', description: 'Treatment ID' },
          },
          required: ['treatment_id'],
        },
      },
      {
        name: 'create_condition',
        description: 'Create one or more condition/diagnosis records. Accepts a single condition object or an array of condition objects for bulk creation.',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
            name: { type: 'string', description: 'Condition/diagnosis name (e.g., "Type 2 Diabetes", "Hypertension")' },
            diagnosed_date: { type: 'string', description: 'Date diagnosed (YYYY-MM-DD)' },
            resolved_date: { type: 'string', description: 'Date resolved (YYYY-MM-DD)' },
            status: { 
              type: 'string', 
              enum: ['active', 'resolved', 'chronic'],
              description: 'Status',
            },
            severity: { 
              type: 'string', 
              enum: ['mild', 'moderate', 'severe'],
              description: 'Severity',
            },
            notes: { type: 'string', description: 'Additional notes' },
            diagnosed_by: { type: 'string', description: 'Diagnosing provider ID' },
          },
          required: ['patient_id', 'name'],
        },
      },
      {
        name: 'update_condition',
        description: 'Update an existing condition record',
        inputSchema: {
          type: 'object',
          properties: {
            condition_id: { type: 'string', description: 'Condition ID' },
            name: { type: 'string' },
            diagnosed_date: { type: 'string' },
            resolved_date: { type: 'string' },
            status: { 
              type: 'string', 
              enum: ['active', 'resolved', 'chronic'],
            },
            severity: { 
              type: 'string', 
              enum: ['mild', 'moderate', 'severe'],
            },
            notes: { type: 'string' },
            diagnosed_by: { type: 'string' },
          },
          required: ['condition_id'],
        },
      },
      {
        name: 'get_condition',
        description: 'Get a condition record by ID',
        inputSchema: {
          type: 'object',
          properties: {
            condition_id: { type: 'string', description: 'Condition ID' },
          },
          required: ['condition_id'],
        },
      },
      {
        name: 'create_allergy',
        description: 'Create one or more allergy records. Accepts a single allergy object or an array of allergy objects for bulk creation.',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
            allergen: { type: 'string', description: 'Allergen name (e.g., "Penicillin", "Peanuts")' },
            type: { type: 'string', enum: ['drug', 'food', 'environmental', 'other'], description: 'Allergy type' },
            reaction: { type: 'string', description: 'Reaction description (e.g., "hives", "anaphylaxis")' },
            severity: { type: 'string', enum: ['mild', 'moderate', 'severe', 'life-threatening'], description: 'Severity level' },
            onset_date: { type: 'string', description: 'Date when allergy was first identified (YYYY-MM-DD)' },
            notes: { type: 'string', description: 'Additional notes' },
            verified_by: { type: 'string', description: 'Provider ID who verified the allergy' },
          },
          required: ['patient_id', 'allergen'],
        },
      },
      {
        name: 'update_allergy',
        description: 'Update an existing allergy record',
        inputSchema: {
          type: 'object',
          properties: {
            allergy_id: { type: 'string', description: 'Allergy ID' },
            allergen: { type: 'string', description: 'Allergen name' },
            type: { type: 'string', enum: ['drug', 'food', 'environmental', 'other'] },
            reaction: { type: 'string', description: 'Reaction description' },
            severity: { type: 'string', enum: ['mild', 'moderate', 'severe', 'life-threatening'] },
            onset_date: { type: 'string', description: 'Onset date (YYYY-MM-DD)' },
            notes: { type: 'string' },
            verified_by: { type: 'string', description: 'Provider ID' },
          },
          required: ['allergy_id'],
        },
      },
      {
        name: 'get_allergy',
        description: 'Get an allergy record by ID',
        inputSchema: {
          type: 'object',
          properties: {
            allergy_id: { type: 'string', description: 'Allergy ID' },
          },
          required: ['allergy_id'],
        },
      },
      {
        name: 'create_immunization',
        description: 'Create one or more immunization/vaccination records. Accepts a single immunization object or an array for bulk creation.',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
            vaccine_name: { type: 'string', description: 'Vaccine name (e.g., "COVID-19", "Influenza", "Tdap")' },
            date_administered: { type: 'string', description: 'Date administered (YYYY-MM-DD)' },
            dose_number: { type: 'number', description: 'Dose number (e.g., 1, 2, 3)' },
            lot_number: { type: 'string', description: 'Vaccine lot number' },
            administered_by: { type: 'string', description: 'Provider ID who administered' },
            site: { type: 'string', description: 'Administration site (e.g., "left deltoid")' },
            route: { type: 'string', description: 'Route (e.g., "intramuscular", "subcutaneous")' },
            notes: { type: 'string', description: 'Additional notes' },
          },
          required: ['patient_id', 'vaccine_name'],
        },
      },
      {
        name: 'update_immunization',
        description: 'Update an existing immunization record',
        inputSchema: {
          type: 'object',
          properties: {
            immunization_id: { type: 'string', description: 'Immunization ID' },
            vaccine_name: { type: 'string' },
            date_administered: { type: 'string' },
            dose_number: { type: 'number' },
            lot_number: { type: 'string' },
            administered_by: { type: 'string' },
            site: { type: 'string' },
            route: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['immunization_id'],
        },
      },
      {
        name: 'get_immunization',
        description: 'Get an immunization record by ID',
        inputSchema: {
          type: 'object',
          properties: {
            immunization_id: { type: 'string', description: 'Immunization ID' },
          },
          required: ['immunization_id'],
        },
      },
      {
        name: 'create_vital_signs',
        description: 'Create one or more vital signs records. Accepts a single vital signs object or an array for bulk creation.',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
            recorded_at: { type: 'string', description: 'When vitals were recorded (ISO 8601 timestamp)' },
            recorded_by: { type: 'string', description: 'Provider ID who recorded' },
            blood_pressure: { 
              type: 'object',
              properties: {
                systolic: { type: 'number', description: 'Systolic pressure' },
                diastolic: { type: 'number', description: 'Diastolic pressure' },
                unit: { type: 'string', description: 'Unit (default: mmHg)' },
              },
            },
            heart_rate: {
              type: 'object',
              properties: {
                value: { type: 'number', description: 'Heart rate' },
                unit: { type: 'string', description: 'Unit (default: bpm)' },
              },
            },
            temperature: {
              type: 'object',
              properties: {
                value: { type: 'number', description: 'Temperature' },
                unit: { type: 'string', description: 'Unit (default: °F)' },
              },
            },
            respiratory_rate: {
              type: 'object',
              properties: {
                value: { type: 'number', description: 'Respiratory rate' },
                unit: { type: 'string', description: 'Unit (default: breaths/min)' },
              },
            },
            oxygen_saturation: {
              type: 'object',
              properties: {
                value: { type: 'number', description: 'O2 saturation' },
                unit: { type: 'string', description: 'Unit (default: %)' },
              },
            },
            weight: {
              type: 'object',
              properties: {
                value: { type: 'number', description: 'Weight' },
                unit: { type: 'string', description: 'Unit (e.g., "kg", "lbs")' },
              },
            },
            height: {
              type: 'object',
              properties: {
                value: { type: 'number', description: 'Height' },
                unit: { type: 'string', description: 'Unit (e.g., "cm", "in")' },
              },
            },
            bmi: { type: 'number', description: 'Body Mass Index' },
            notes: { type: 'string', description: 'Additional notes' },
          },
          required: ['patient_id'],
        },
      },
      {
        name: 'update_vital_signs',
        description: 'Update an existing vital signs record',
        inputSchema: {
          type: 'object',
          properties: {
            vitals_id: { type: 'string', description: 'Vital signs ID' },
            recorded_at: { type: 'string' },
            recorded_by: { type: 'string' },
            blood_pressure: { type: 'object' },
            heart_rate: { type: 'object' },
            temperature: { type: 'object' },
            respiratory_rate: { type: 'object' },
            oxygen_saturation: { type: 'object' },
            weight: { type: 'object' },
            height: { type: 'object' },
            bmi: { type: 'number' },
            notes: { type: 'string' },
          },
          required: ['vitals_id'],
        },
      },
      {
        name: 'get_vital_signs',
        description: 'Get a vital signs record by ID',
        inputSchema: {
          type: 'object',
          properties: {
            vitals_id: { type: 'string', description: 'Vital signs ID' },
          },
          required: ['vitals_id'],
        },
      },
      {
        name: 'create_procedure',
        description: 'Create one or more procedure/surgery records. Accepts a single procedure object or an array for bulk creation.',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
            procedure_name: { type: 'string', description: 'Procedure name (e.g., "Appendectomy", "Knee Arthroscopy")' },
            procedure_type: { type: 'string', enum: ['surgery', 'diagnostic', 'therapeutic', 'other'], description: 'Type of procedure' },
            date_performed: { type: 'string', description: 'Date performed (YYYY-MM-DD)' },
            performed_by: { type: 'string', description: 'Provider ID who performed the procedure' },
            location: { type: 'string', description: 'Location/facility where performed' },
            indication: { type: 'string', description: 'Medical indication/reason' },
            outcome: { type: 'string', description: 'Outcome description' },
            complications: { type: 'string', description: 'Any complications' },
            notes: { type: 'string', description: 'Additional notes' },
          },
          required: ['patient_id', 'procedure_name'],
        },
      },
      {
        name: 'update_procedure',
        description: 'Update an existing procedure record',
        inputSchema: {
          type: 'object',
          properties: {
            procedure_id: { type: 'string', description: 'Procedure ID' },
            procedure_name: { type: 'string' },
            procedure_type: { type: 'string', enum: ['surgery', 'diagnostic', 'therapeutic', 'other'] },
            date_performed: { type: 'string' },
            performed_by: { type: 'string' },
            location: { type: 'string' },
            indication: { type: 'string' },
            outcome: { type: 'string' },
            complications: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['procedure_id'],
        },
      },
      {
        name: 'get_procedure',
        description: 'Get a procedure record by ID',
        inputSchema: {
          type: 'object',
          properties: {
            procedure_id: { type: 'string', description: 'Procedure ID' },
          },
          required: ['procedure_id'],
        },
      },
      {
        name: 'create_imaging',
        description: 'Create one or more imaging/radiology records. Accepts a single imaging object or an array for bulk creation.',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
            study_type: { type: 'string', description: 'Study type (e.g., "Chest X-Ray", "Brain MRI")' },
            modality: { type: 'string', enum: ['X-Ray', 'CT', 'MRI', 'Ultrasound', 'PET', 'Nuclear', 'Other'], description: 'Imaging modality' },
            body_site: { type: 'string', description: 'Body site/region imaged' },
            study_date: { type: 'string', description: 'Study date (YYYY-MM-DD)' },
            ordered_by: { type: 'string', description: 'Provider ID who ordered the study' },
            performed_at: { type: 'string', description: 'Facility where performed' },
            findings: { type: 'string', description: 'Radiologist findings' },
            impression: { type: 'string', description: 'Clinical impression/summary' },
            report_url: { type: 'string', description: 'URL to full report (if available)' },
            notes: { type: 'string', description: 'Additional notes' },
          },
          required: ['patient_id', 'study_type'],
        },
      },
      {
        name: 'update_imaging',
        description: 'Update an existing imaging record',
        inputSchema: {
          type: 'object',
          properties: {
            imaging_id: { type: 'string', description: 'Imaging ID' },
            study_type: { type: 'string' },
            modality: { type: 'string', enum: ['X-Ray', 'CT', 'MRI', 'Ultrasound', 'PET', 'Nuclear', 'Other'] },
            body_site: { type: 'string' },
            study_date: { type: 'string' },
            ordered_by: { type: 'string' },
            performed_at: { type: 'string' },
            findings: { type: 'string' },
            impression: { type: 'string' },
            report_url: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['imaging_id'],
        },
      },
      {
        name: 'get_imaging',
        description: 'Get an imaging record by ID',
        inputSchema: {
          type: 'object',
          properties: {
            imaging_id: { type: 'string', description: 'Imaging ID' },
          },
          required: ['imaging_id'],
        },
      },
      {
        name: 'create_insurance',
        description: 'Create one or more insurance coverage records. Accepts a single insurance object or an array for bulk creation.',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
            provider_name: { type: 'string', description: 'Insurance provider name (e.g., "Blue Cross", "Medicare")' },
            plan_name: { type: 'string', description: 'Plan name (e.g., "PPO", "HMO")' },
            policy_number: { type: 'string', description: 'Policy/member ID number' },
            group_number: { type: 'string', description: 'Group number' },
            subscriber_name: { type: 'string', description: 'Subscriber name (if different from patient)' },
            subscriber_relationship: { type: 'string', description: 'Relationship to subscriber (e.g., "self", "spouse", "child")' },
            coverage_type: { type: 'string', enum: ['primary', 'secondary', 'tertiary'], description: 'Coverage type' },
            effective_date: { type: 'string', description: 'Coverage effective date (YYYY-MM-DD)' },
            termination_date: { type: 'string', description: 'Coverage termination date (YYYY-MM-DD)' },
            phone: { type: 'string', description: 'Insurance provider phone' },
            notes: { type: 'string', description: 'Additional notes' },
          },
          required: ['patient_id', 'provider_name'],
        },
      },
      {
        name: 'update_insurance',
        description: 'Update an existing insurance record',
        inputSchema: {
          type: 'object',
          properties: {
            insurance_id: { type: 'string', description: 'Insurance ID' },
            provider_name: { type: 'string' },
            plan_name: { type: 'string' },
            policy_number: { type: 'string' },
            group_number: { type: 'string' },
            subscriber_name: { type: 'string' },
            subscriber_relationship: { type: 'string' },
            coverage_type: { type: 'string', enum: ['primary', 'secondary', 'tertiary'] },
            effective_date: { type: 'string' },
            termination_date: { type: 'string' },
            phone: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['insurance_id'],
        },
      },
      {
        name: 'get_insurance',
        description: 'Get an insurance record by ID',
        inputSchema: {
          type: 'object',
          properties: {
            insurance_id: { type: 'string', description: 'Insurance ID' },
          },
          required: ['insurance_id'],
        },
      },
      {
        name: 'update_health_summary',
        description: 'Update the active health summary for a patient. This should be a concise summary of current conditions, active medications, recent visits, pending labs, and upcoming follow-ups.',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
            summary_text: { type: 'string', description: 'Updated health summary text' },
          },
          required: ['patient_id', 'summary_text'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case 'create_patient':
        return await createPatient(db, request.params.arguments);
      case 'update_patient':
        return await updatePatient(db, request.params.arguments);
      case 'get_patient':
        return await getPatient(db, request.params.arguments);
      case 'list_patients':
        return await listPatients(db, request.params.arguments);
      case 'create_provider':
        return await createProvider(db, request.params.arguments);
      case 'update_provider':
        return await updateProvider(db, request.params.arguments);
      case 'get_provider':
        return await getProvider(db, request.params.arguments);
      case 'create_visit':
        return await createVisit(db, request.params.arguments);
      case 'update_visit':
        return await updateVisit(db, request.params.arguments);
      case 'get_visit':
        return await getVisit(db, request.params.arguments);
      case 'create_prescription':
        return await createPrescription(db, request.params.arguments);
      case 'update_prescription':
        return await updatePrescription(db, request.params.arguments);
      case 'get_prescription':
        return await getPrescription(db, request.params.arguments);
      case 'create_lab':
        return await createLab(db, request.params.arguments);
      case 'update_lab':
        return await updateLab(db, request.params.arguments);
      case 'get_lab':
        return await getLab(db, request.params.arguments);
      case 'create_treatment':
        return await createTreatment(db, request.params.arguments);
      case 'update_treatment':
        return await updateTreatment(db, request.params.arguments);
      case 'get_treatment':
        return await getTreatment(db, request.params.arguments);
      case 'create_condition':
        return await createCondition(db, request.params.arguments);
      case 'update_condition':
        return await updateCondition(db, request.params.arguments);
      case 'get_condition':
        return await getCondition(db, request.params.arguments);
      case 'create_allergy':
        return await createAllergy(db, request.params.arguments);
      case 'update_allergy':
        return await updateAllergy(db, request.params.arguments);
      case 'get_allergy':
        return await getAllergy(db, request.params.arguments);
      case 'create_immunization':
        return await createImmunization(db, request.params.arguments);
      case 'update_immunization':
        return await updateImmunization(db, request.params.arguments);
      case 'get_immunization':
        return await getImmunization(db, request.params.arguments);
      case 'create_vital_signs':
        return await createVitalSigns(db, request.params.arguments);
      case 'update_vital_signs':
        return await updateVitalSigns(db, request.params.arguments);
      case 'get_vital_signs':
        return await getVitalSigns(db, request.params.arguments);
      case 'create_procedure':
        return await createProcedure(db, request.params.arguments);
      case 'update_procedure':
        return await updateProcedure(db, request.params.arguments);
      case 'get_procedure':
        return await getProcedure(db, request.params.arguments);
      case 'create_imaging':
        return await createImaging(db, request.params.arguments);
      case 'update_imaging':
        return await updateImaging(db, request.params.arguments);
      case 'get_imaging':
        return await getImaging(db, request.params.arguments);
      case 'create_insurance':
        return await createInsurance(db, request.params.arguments);
      case 'update_insurance':
        return await updateInsurance(db, request.params.arguments);
      case 'get_insurance':
        return await getInsurance(db, request.params.arguments);
      case 'update_health_summary':
        return await updateHealthSummary(db, request.params.arguments);
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// List available prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'care_manager_base',
        description: 'Base prompt for care manager assistant role',
      },
    ],
  };
});

// Get prompt content
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === 'care_manager_base') {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: CARE_MANAGER_BASE_PROMPT,
          },
        },
      ],
    };
  }
  throw new Error(`Unknown prompt: ${request.params.name}`);
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'summary://patient/{patient_id}',
        name: 'Active Health Summary',
        description: 'Current health summary for a patient',
        mimeType: 'text/plain',
      },
    ],
  };
});

// Read resource content
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  
  if (uri.startsWith('summary://patient/')) {
    const patientId = uri.replace('summary://patient/', '');
    const summaryText = await getHealthSummary(db, patientId);
    
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: summaryText,
        },
      ],
    };
  }
  
  throw new Error(`Unknown resource: ${uri}`);
});

async function main() {
  try {
    await db.connect();
    await db.createIndexes();
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('Health Record MCP Server running on stdio');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

