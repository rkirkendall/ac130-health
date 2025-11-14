import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import {
  CreateAllergySchema,
  UpdateAllergySchema,
  GetAllergySchema,
} from '../types.js';

export async function createAllergy(db: Database, args: unknown) {
  const validated = CreateAllergySchema.parse(args);
  
  const now = new Date();

  // Handle bulk creation
  if (Array.isArray(validated)) {
    const allergies = validated.map(a => {
      if (!ObjectId.isValid(a.dependent_id)) {
        throw new Error(`Invalid dependent_id: ${a.dependent_id}`);
      }
      if (a.verified_by && !ObjectId.isValid(a.verified_by)) {
        throw new Error(`Invalid verified_by provider_id: ${a.verified_by}`);
      }

      return {
        ...a,
        dependent_id: new ObjectId(a.dependent_id),
        verified_by: a.verified_by ? new ObjectId(a.verified_by) : undefined,
        created_at: now,
        updated_at: now,
        created_by: 'mcp',
        updated_by: 'mcp',
      };
    });

    const result = await db.allergies.insertMany(allergies as any);
    const insertedIds = Object.values(result.insertedIds);
    const inserted = await db.allergies.find({ _id: { $in: insertedIds } }).toArray();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: inserted.length,
            allergies: inserted.map(a => ({
              ...a,
              _id: a._id.toString(),
              allergy_id: a._id.toString(),
              dependent_id: a.dependent_id.toString(),
              verified_by: a.verified_by?.toString(),
            })),
          }, null, 2),
        },
      ],
    };
  }

  // Handle single creation
  if (!ObjectId.isValid(validated.dependent_id)) {
    throw new Error('Invalid dependent_id');
  }
  
  if (validated.verified_by && !ObjectId.isValid(validated.verified_by)) {
    throw new Error('Invalid verified_by provider_id');
  }
  
  const allergy = {
    ...validated,
    dependent_id: new ObjectId(validated.dependent_id),
    verified_by: validated.verified_by ? new ObjectId(validated.verified_by) : undefined,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  };
  
  const result = await db.allergies.insertOne(allergy as any);
  const inserted = await db.allergies.findOne({ _id: result.insertedId });
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          allergy_id: result.insertedId.toString(),
          ...inserted,
          _id: inserted?._id.toString(),
          dependent_id: inserted?.dependent_id.toString(),
          verified_by: inserted?.verified_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function updateAllergy(db: Database, args: unknown) {
  const validated = UpdateAllergySchema.parse(args);
  const { allergy_id, verified_by, ...updates } = validated;
  
  if (!ObjectId.isValid(allergy_id)) {
    throw new Error('Invalid allergy_id');
  }
  
  if (verified_by && !ObjectId.isValid(verified_by)) {
    throw new Error('Invalid verified_by provider_id');
  }
  
  const updateDoc: any = {
    ...updates,
    updated_at: new Date(),
    updated_by: 'mcp',
  };
  
  if (verified_by) {
    updateDoc.verified_by = new ObjectId(verified_by);
  }
  
  const result = await db.allergies.findOneAndUpdate(
    { _id: new ObjectId(allergy_id) },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    throw new Error('Allergy not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...result,
          _id: result._id.toString(),
          allergy_id: result._id.toString(),
          dependent_id: result.dependent_id.toString(),
          verified_by: result.verified_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function getAllergy(db: Database, args: unknown) {
  const validated = GetAllergySchema.parse(args);
  
  if (!ObjectId.isValid(validated.allergy_id)) {
    throw new Error('Invalid allergy_id');
  }
  
  const allergy = await db.allergies.findOne({ _id: new ObjectId(validated.allergy_id) });
  
  if (!allergy) {
    throw new Error('Allergy not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...allergy,
          _id: allergy._id.toString(),
          allergy_id: allergy._id.toString(),
          dependent_id: allergy.dependent_id.toString(),
          verified_by: allergy.verified_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

