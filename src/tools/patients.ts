import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import {
  CreatePatientSchema,
  UpdatePatientSchema,
  GetPatientSchema,
  ListPatientsSchema,
} from '../types.js';

export async function createPatient(db: Database, args: unknown) {
  const validated = CreatePatientSchema.parse(args);
  
  const now = new Date();

  // Handle bulk creation
  if (Array.isArray(validated)) {
    const patients = validated.map(p => ({
      ...p,
      created_at: now,
      updated_at: now,
      created_by: 'mcp',
      updated_by: 'mcp',
    }));

    const result = await db.patients.insertMany(patients as any);
    const insertedIds = Object.values(result.insertedIds);
    const inserted = await db.patients.find({ _id: { $in: insertedIds } }).toArray();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: inserted.length,
            patients: inserted.map(p => ({
              ...p,
              _id: p._id.toString(),
              patient_id: p._id.toString(),
            })),
          }, null, 2),
        },
      ],
    };
  }

  // Handle single creation
  const patient = {
    ...validated,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  };
  
  const result = await db.patients.insertOne(patient as any);
  const inserted = await db.patients.findOne({ _id: result.insertedId });
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          patient_id: result.insertedId.toString(),
          ...inserted,
          _id: inserted?._id.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function updatePatient(db: Database, args: unknown) {
  const validated = UpdatePatientSchema.parse(args);
  const { patient_id, ...updates } = validated;
  
  if (!ObjectId.isValid(patient_id)) {
    throw new Error('Invalid patient_id');
  }
  
  const result = await db.patients.findOneAndUpdate(
    { _id: new ObjectId(patient_id) },
    { 
      $set: {
        ...updates,
        updated_at: new Date(),
        updated_by: 'mcp',
      },
    },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    throw new Error('Patient not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...result,
          _id: result._id.toString(),
          patient_id: result._id.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function getPatient(db: Database, args: unknown) {
  const validated = GetPatientSchema.parse(args);
  
  if (!ObjectId.isValid(validated.patient_id)) {
    throw new Error('Invalid patient_id');
  }
  
  const patient = await db.patients.findOne({ _id: new ObjectId(validated.patient_id) });
  
  if (!patient) {
    throw new Error('Patient not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...patient,
          _id: patient._id.toString(),
          patient_id: patient._id.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function listPatients(db: Database, args: unknown) {
  const validated = ListPatientsSchema.parse(args);
  
  const query: any = {};
  if (validated.relationship) {
    query.relationship = validated.relationship;
  }
  
  const limit = validated.limit || 50;
  const patients = await db.patients.find(query).limit(limit).toArray();
  
  const formattedPatients = patients.map(patient => ({
    ...patient,
    _id: patient._id.toString(),
    patient_id: patient._id.toString(),
  }));
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          count: patients.length,
          patients: formattedPatients,
        }, null, 2),
      },
    ],
  };
}

