import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import {
  CreateTreatmentSchema,
  UpdateTreatmentSchema,
  GetTreatmentSchema,
} from '../types.js';

export async function createTreatment(db: Database, args: unknown) {
  const validated = CreateTreatmentSchema.parse(args);
  
  if (!ObjectId.isValid(validated.dependent_id)) {
    throw new Error('Invalid dependent_id');
  }
  
  if (validated.provider_id && !ObjectId.isValid(validated.provider_id)) {
    throw new Error('Invalid provider_id');
  }
  
  const now = new Date();
  const treatment = {
    ...validated,
    dependent_id: new ObjectId(validated.dependent_id),
    provider_id: validated.provider_id ? new ObjectId(validated.provider_id) : undefined,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  };
  
  const result = await db.treatments.insertOne(treatment as any);
  const inserted = await db.treatments.findOne({ _id: result.insertedId });
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          treatment_id: result.insertedId.toString(),
          ...inserted,
          _id: inserted?._id.toString(),
          dependent_id: inserted?.dependent_id.toString(),
          provider_id: inserted?.provider_id?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function updateTreatment(db: Database, args: unknown) {
  const validated = UpdateTreatmentSchema.parse(args);
  const { treatment_id, provider_id, ...updates } = validated;
  
  if (!ObjectId.isValid(treatment_id)) {
    throw new Error('Invalid treatment_id');
  }
  
  if (provider_id && !ObjectId.isValid(provider_id)) {
    throw new Error('Invalid provider_id');
  }
  
  const updateDoc: any = {
    ...updates,
    updated_at: new Date(),
    updated_by: 'mcp',
  };
  
  if (provider_id) {
    updateDoc.provider_id = new ObjectId(provider_id);
  }
  
  const result = await db.treatments.findOneAndUpdate(
    { _id: new ObjectId(treatment_id) },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    throw new Error('Treatment not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...result,
          _id: result._id.toString(),
          treatment_id: result._id.toString(),
          dependent_id: result.dependent_id.toString(),
          provider_id: result.provider_id?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function getTreatment(db: Database, args: unknown) {
  const validated = GetTreatmentSchema.parse(args);
  
  if (!ObjectId.isValid(validated.treatment_id)) {
    throw new Error('Invalid treatment_id');
  }
  
  const treatment = await db.treatments.findOne({ _id: new ObjectId(validated.treatment_id) });
  
  if (!treatment) {
    throw new Error('Treatment not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...treatment,
          _id: treatment._id.toString(),
          treatment_id: treatment._id.toString(),
          dependent_id: treatment.dependent_id.toString(),
          provider_id: treatment.provider_id?.toString(),
        }, null, 2),
      },
    ],
  };
}

