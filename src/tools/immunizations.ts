import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import {
  CreateImmunizationSchema,
  UpdateImmunizationSchema,
  GetImmunizationSchema,
} from '../types.js';

export async function createImmunization(db: Database, args: unknown) {
  const validated = CreateImmunizationSchema.parse(args);
  
  const now = new Date();

  // Handle bulk creation
  if (Array.isArray(validated)) {
    const immunizations = validated.map(i => {
      if (!ObjectId.isValid(i.dependent_id)) {
        throw new Error(`Invalid dependent_id: ${i.dependent_id}`);
      }
      if (i.administered_by && !ObjectId.isValid(i.administered_by)) {
        throw new Error(`Invalid administered_by provider_id: ${i.administered_by}`);
      }

      return {
        ...i,
        dependent_id: new ObjectId(i.dependent_id),
        administered_by: i.administered_by ? new ObjectId(i.administered_by) : undefined,
        created_at: now,
        updated_at: now,
        created_by: 'mcp',
        updated_by: 'mcp',
      };
    });

    const result = await db.immunizations.insertMany(immunizations as any);
    const insertedIds = Object.values(result.insertedIds);
    const inserted = await db.immunizations.find({ _id: { $in: insertedIds } }).toArray();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: inserted.length,
            immunizations: inserted.map(i => ({
              ...i,
              _id: i._id.toString(),
              immunization_id: i._id.toString(),
              dependent_id: i.dependent_id.toString(),
              administered_by: i.administered_by?.toString(),
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
  
  if (validated.administered_by && !ObjectId.isValid(validated.administered_by)) {
    throw new Error('Invalid administered_by provider_id');
  }
  
  const immunization = {
    ...validated,
    dependent_id: new ObjectId(validated.dependent_id),
    administered_by: validated.administered_by ? new ObjectId(validated.administered_by) : undefined,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  };
  
  const result = await db.immunizations.insertOne(immunization as any);
  const inserted = await db.immunizations.findOne({ _id: result.insertedId });
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          immunization_id: result.insertedId.toString(),
          ...inserted,
          _id: inserted?._id.toString(),
          dependent_id: inserted?.dependent_id.toString(),
          administered_by: inserted?.administered_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function updateImmunization(db: Database, args: unknown) {
  const validated = UpdateImmunizationSchema.parse(args);
  const { immunization_id, administered_by, ...updates } = validated;
  
  if (!ObjectId.isValid(immunization_id)) {
    throw new Error('Invalid immunization_id');
  }
  
  if (administered_by && !ObjectId.isValid(administered_by)) {
    throw new Error('Invalid administered_by provider_id');
  }
  
  const updateDoc: any = {
    ...updates,
    updated_at: new Date(),
    updated_by: 'mcp',
  };
  
  if (administered_by) {
    updateDoc.administered_by = new ObjectId(administered_by);
  }
  
  const result = await db.immunizations.findOneAndUpdate(
    { _id: new ObjectId(immunization_id) },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    throw new Error('Immunization not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...result,
          _id: result._id.toString(),
          immunization_id: result._id.toString(),
          dependent_id: result.dependent_id.toString(),
          administered_by: result.administered_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function getImmunization(db: Database, args: unknown) {
  const validated = GetImmunizationSchema.parse(args);
  
  if (!ObjectId.isValid(validated.immunization_id)) {
    throw new Error('Invalid immunization_id');
  }
  
  const immunization = await db.immunizations.findOne({ _id: new ObjectId(validated.immunization_id) });
  
  if (!immunization) {
    throw new Error('Immunization not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...immunization,
          _id: immunization._id.toString(),
          immunization_id: immunization._id.toString(),
          dependent_id: immunization.dependent_id.toString(),
          administered_by: immunization.administered_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

