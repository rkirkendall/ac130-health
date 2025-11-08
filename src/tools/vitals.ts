import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import {
  CreateVitalSignsSchema,
  UpdateVitalSignsSchema,
  GetVitalSignsSchema,
} from '../types.js';

export async function createVitalSigns(db: Database, args: unknown) {
  const validated = CreateVitalSignsSchema.parse(args);
  
  const now = new Date();

  // Handle bulk creation
  if (Array.isArray(validated)) {
    const vitals = validated.map(v => {
      if (!ObjectId.isValid(v.patient_id)) {
        throw new Error(`Invalid patient_id: ${v.patient_id}`);
      }
      if (v.recorded_by && !ObjectId.isValid(v.recorded_by)) {
        throw new Error(`Invalid recorded_by provider_id: ${v.recorded_by}`);
      }

      return {
        ...v,
        patient_id: new ObjectId(v.patient_id),
        recorded_by: v.recorded_by ? new ObjectId(v.recorded_by) : undefined,
        recorded_at: v.recorded_at ? new Date(v.recorded_at) : now,
        created_at: now,
        updated_at: now,
        created_by: 'mcp',
        updated_by: 'mcp',
      };
    });

    const result = await db.vitalSigns.insertMany(vitals as any);
    const insertedIds = Object.values(result.insertedIds);
    const inserted = await db.vitalSigns.find({ _id: { $in: insertedIds } }).toArray();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: inserted.length,
            vital_signs: inserted.map(v => ({
              ...v,
              _id: v._id.toString(),
              vitals_id: v._id.toString(),
              patient_id: v.patient_id.toString(),
              recorded_by: v.recorded_by?.toString(),
            })),
          }, null, 2),
        },
      ],
    };
  }

  // Handle single creation
  if (!ObjectId.isValid(validated.patient_id)) {
    throw new Error('Invalid patient_id');
  }
  
  if (validated.recorded_by && !ObjectId.isValid(validated.recorded_by)) {
    throw new Error('Invalid recorded_by provider_id');
  }
  
  const vitals = {
    ...validated,
    patient_id: new ObjectId(validated.patient_id),
    recorded_by: validated.recorded_by ? new ObjectId(validated.recorded_by) : undefined,
    recorded_at: validated.recorded_at ? new Date(validated.recorded_at) : now,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  };
  
  const result = await db.vitalSigns.insertOne(vitals as any);
  const inserted = await db.vitalSigns.findOne({ _id: result.insertedId });
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          vitals_id: result.insertedId.toString(),
          ...inserted,
          _id: inserted?._id.toString(),
          patient_id: inserted?.patient_id.toString(),
          recorded_by: inserted?.recorded_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function updateVitalSigns(db: Database, args: unknown) {
  const validated = UpdateVitalSignsSchema.parse(args);
  const { vitals_id, recorded_by, recorded_at, ...updates } = validated;
  
  if (!ObjectId.isValid(vitals_id)) {
    throw new Error('Invalid vitals_id');
  }
  
  if (recorded_by && !ObjectId.isValid(recorded_by)) {
    throw new Error('Invalid recorded_by provider_id');
  }
  
  const updateDoc: any = {
    ...updates,
    updated_at: new Date(),
    updated_by: 'mcp',
  };
  
  if (recorded_by) {
    updateDoc.recorded_by = new ObjectId(recorded_by);
  }
  
  if (recorded_at) {
    updateDoc.recorded_at = new Date(recorded_at);
  }
  
  const result = await db.vitalSigns.findOneAndUpdate(
    { _id: new ObjectId(vitals_id) },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    throw new Error('Vital signs not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...result,
          _id: result._id.toString(),
          vitals_id: result._id.toString(),
          patient_id: result.patient_id.toString(),
          recorded_by: result.recorded_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function getVitalSigns(db: Database, args: unknown) {
  const validated = GetVitalSignsSchema.parse(args);
  
  if (!ObjectId.isValid(validated.vitals_id)) {
    throw new Error('Invalid vitals_id');
  }
  
  const vitals = await db.vitalSigns.findOne({ _id: new ObjectId(validated.vitals_id) });
  
  if (!vitals) {
    throw new Error('Vital signs not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...vitals,
          _id: vitals._id.toString(),
          vitals_id: vitals._id.toString(),
          patient_id: vitals.patient_id.toString(),
          recorded_by: vitals.recorded_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

