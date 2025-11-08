import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import {
  CreateInsuranceSchema,
  UpdateInsuranceSchema,
  GetInsuranceSchema,
} from '../types.js';

export async function createInsurance(db: Database, args: unknown) {
  const validated = CreateInsuranceSchema.parse(args);
  
  const now = new Date();

  // Handle bulk creation
  if (Array.isArray(validated)) {
    const insurance = validated.map(i => {
      if (!ObjectId.isValid(i.patient_id)) {
        throw new Error(`Invalid patient_id: ${i.patient_id}`);
      }

      return {
        ...i,
        patient_id: new ObjectId(i.patient_id),
        created_at: now,
        updated_at: now,
        created_by: 'mcp',
        updated_by: 'mcp',
      };
    });

    const result = await db.insurance.insertMany(insurance as any);
    const insertedIds = Object.values(result.insertedIds);
    const inserted = await db.insurance.find({ _id: { $in: insertedIds } }).toArray();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: inserted.length,
            insurance: inserted.map(i => ({
              ...i,
              _id: i._id.toString(),
              insurance_id: i._id.toString(),
              patient_id: i.patient_id.toString(),
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
  
  const insuranceRecord = {
    ...validated,
    patient_id: new ObjectId(validated.patient_id),
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  };
  
  const result = await db.insurance.insertOne(insuranceRecord as any);
  const inserted = await db.insurance.findOne({ _id: result.insertedId });
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          insurance_id: result.insertedId.toString(),
          ...inserted,
          _id: inserted?._id.toString(),
          patient_id: inserted?.patient_id.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function updateInsurance(db: Database, args: unknown) {
  const validated = UpdateInsuranceSchema.parse(args);
  const { insurance_id, ...updates } = validated;
  
  if (!ObjectId.isValid(insurance_id)) {
    throw new Error('Invalid insurance_id');
  }
  
  const updateDoc: any = {
    ...updates,
    updated_at: new Date(),
    updated_by: 'mcp',
  };
  
  const result = await db.insurance.findOneAndUpdate(
    { _id: new ObjectId(insurance_id) },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    throw new Error('Insurance not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...result,
          _id: result._id.toString(),
          insurance_id: result._id.toString(),
          patient_id: result.patient_id.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function getInsurance(db: Database, args: unknown) {
  const validated = GetInsuranceSchema.parse(args);
  
  if (!ObjectId.isValid(validated.insurance_id)) {
    throw new Error('Invalid insurance_id');
  }
  
  const insurance = await db.insurance.findOne({ _id: new ObjectId(validated.insurance_id) });
  
  if (!insurance) {
    throw new Error('Insurance not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...insurance,
          _id: insurance._id.toString(),
          insurance_id: insurance._id.toString(),
          patient_id: insurance.patient_id.toString(),
        }, null, 2),
      },
    ],
  };
}

