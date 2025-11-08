import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import {
  CreateConditionSchema,
  UpdateConditionSchema,
  GetConditionSchema,
} from '../types.js';

export async function createCondition(db: Database, args: unknown) {
  const validated = CreateConditionSchema.parse(args);
  
  const now = new Date();

  // Handle bulk creation
  if (Array.isArray(validated)) {
    const conditions = validated.map(c => {
      if (!ObjectId.isValid(c.patient_id)) {
        throw new Error(`Invalid patient_id: ${c.patient_id}`);
      }
      if (c.diagnosed_by && !ObjectId.isValid(c.diagnosed_by)) {
        throw new Error(`Invalid diagnosed_by provider_id: ${c.diagnosed_by}`);
      }

      return {
        ...c,
        patient_id: new ObjectId(c.patient_id),
        diagnosed_by: c.diagnosed_by ? new ObjectId(c.diagnosed_by) : undefined,
        created_at: now,
        updated_at: now,
        created_by: 'mcp',
        updated_by: 'mcp',
      };
    });

    const result = await db.conditions.insertMany(conditions as any);
    const insertedIds = Object.values(result.insertedIds);
    const inserted = await db.conditions.find({ _id: { $in: insertedIds } }).toArray();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: inserted.length,
            conditions: inserted.map(c => ({
              ...c,
              _id: c._id.toString(),
              condition_id: c._id.toString(),
              patient_id: c.patient_id.toString(),
              diagnosed_by: c.diagnosed_by?.toString(),
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
  
  if (validated.diagnosed_by && !ObjectId.isValid(validated.diagnosed_by)) {
    throw new Error('Invalid diagnosed_by provider_id');
  }
  
  const condition = {
    ...validated,
    patient_id: new ObjectId(validated.patient_id),
    diagnosed_by: validated.diagnosed_by ? new ObjectId(validated.diagnosed_by) : undefined,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  };
  
  const result = await db.conditions.insertOne(condition as any);
  const inserted = await db.conditions.findOne({ _id: result.insertedId });
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          condition_id: result.insertedId.toString(),
          ...inserted,
          _id: inserted?._id.toString(),
          patient_id: inserted?.patient_id.toString(),
          diagnosed_by: inserted?.diagnosed_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function updateCondition(db: Database, args: unknown) {
  const validated = UpdateConditionSchema.parse(args);
  const { condition_id, diagnosed_by, ...updates } = validated;
  
  if (!ObjectId.isValid(condition_id)) {
    throw new Error('Invalid condition_id');
  }
  
  if (diagnosed_by && !ObjectId.isValid(diagnosed_by)) {
    throw new Error('Invalid diagnosed_by provider_id');
  }
  
  const updateDoc: any = {
    ...updates,
    updated_at: new Date(),
    updated_by: 'mcp',
  };
  
  if (diagnosed_by) {
    updateDoc.diagnosed_by = new ObjectId(diagnosed_by);
  }
  
  const result = await db.conditions.findOneAndUpdate(
    { _id: new ObjectId(condition_id) },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    throw new Error('Condition not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...result,
          _id: result._id.toString(),
          condition_id: result._id.toString(),
          patient_id: result.patient_id.toString(),
          diagnosed_by: result.diagnosed_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function getCondition(db: Database, args: unknown) {
  const validated = GetConditionSchema.parse(args);
  
  if (!ObjectId.isValid(validated.condition_id)) {
    throw new Error('Invalid condition_id');
  }
  
  const condition = await db.conditions.findOne({ _id: new ObjectId(validated.condition_id) });
  
  if (!condition) {
    throw new Error('Condition not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...condition,
          _id: condition._id.toString(),
          condition_id: condition._id.toString(),
          patient_id: condition.patient_id.toString(),
          diagnosed_by: condition.diagnosed_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

