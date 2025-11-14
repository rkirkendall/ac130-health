import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import {
  CreateVisitSchema,
  UpdateVisitSchema,
  GetVisitSchema,
} from '../types.js';

export async function createVisit(db: Database, args: unknown) {
  const validated = CreateVisitSchema.parse(args);
  
  const now = new Date();

  // Handle bulk creation
  if (Array.isArray(validated)) {
    const visits = validated.map(v => {
      if (!ObjectId.isValid(v.dependent_id)) {
        throw new Error(`Invalid dependent_id: ${v.dependent_id}`);
      }
      if (v.provider_id && !ObjectId.isValid(v.provider_id)) {
        throw new Error(`Invalid provider_id: ${v.provider_id}`);
      }

      return {
        ...v,
        dependent_id: new ObjectId(v.dependent_id),
        provider_id: v.provider_id ? new ObjectId(v.provider_id) : undefined,
        created_at: now,
        updated_at: now,
        created_by: 'mcp',
        updated_by: 'mcp',
      };
    });

    const result = await db.visits.insertMany(visits as any);
    const insertedIds = Object.values(result.insertedIds);
    const inserted = await db.visits.find({ _id: { $in: insertedIds } }).toArray();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: inserted.length,
            visits: inserted.map(v => ({
              ...v,
              _id: v._id.toString(),
              visit_id: v._id.toString(),
              dependent_id: v.dependent_id.toString(),
              provider_id: v.provider_id?.toString(),
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
  
  if (validated.provider_id && !ObjectId.isValid(validated.provider_id)) {
    throw new Error('Invalid provider_id');
  }
  
  const visit = {
    ...validated,
    dependent_id: new ObjectId(validated.dependent_id),
    provider_id: validated.provider_id ? new ObjectId(validated.provider_id) : undefined,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  };
  
  const result = await db.visits.insertOne(visit as any);
  const inserted = await db.visits.findOne({ _id: result.insertedId });
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          visit_id: result.insertedId.toString(),
          ...inserted,
          _id: inserted?._id.toString(),
          dependent_id: inserted?.dependent_id.toString(),
          provider_id: inserted?.provider_id?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function updateVisit(db: Database, args: unknown) {
  const validated = UpdateVisitSchema.parse(args);
  const { visit_id, provider_id, ...updates } = validated;
  
  if (!ObjectId.isValid(visit_id)) {
    throw new Error('Invalid visit_id');
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
  
  const result = await db.visits.findOneAndUpdate(
    { _id: new ObjectId(visit_id) },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    throw new Error('Visit not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...result,
          _id: result._id.toString(),
          visit_id: result._id.toString(),
          dependent_id: result.dependent_id.toString(),
          provider_id: result.provider_id?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function getVisit(db: Database, args: unknown) {
  const validated = GetVisitSchema.parse(args);
  
  if (!ObjectId.isValid(validated.visit_id)) {
    throw new Error('Invalid visit_id');
  }
  
  const visit = await db.visits.findOne({ _id: new ObjectId(validated.visit_id) });
  
  if (!visit) {
    throw new Error('Visit not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...visit,
          _id: visit._id.toString(),
          visit_id: visit._id.toString(),
          dependent_id: visit.dependent_id.toString(),
          provider_id: visit.provider_id?.toString(),
        }, null, 2),
      },
    ],
  };
}

