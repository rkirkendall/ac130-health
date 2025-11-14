import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import {
  CreateProcedureSchema,
  UpdateProcedureSchema,
  GetProcedureSchema,
} from '../types.js';

export async function createProcedure(db: Database, args: unknown) {
  const validated = CreateProcedureSchema.parse(args);
  
  const now = new Date();

  // Handle bulk creation
  if (Array.isArray(validated)) {
    const procedures = validated.map(p => {
      if (!ObjectId.isValid(p.dependent_id)) {
        throw new Error(`Invalid dependent_id: ${p.dependent_id}`);
      }
      if (p.performed_by && !ObjectId.isValid(p.performed_by)) {
        throw new Error(`Invalid performed_by provider_id: ${p.performed_by}`);
      }

      return {
        ...p,
        dependent_id: new ObjectId(p.dependent_id),
        performed_by: p.performed_by ? new ObjectId(p.performed_by) : undefined,
        created_at: now,
        updated_at: now,
        created_by: 'mcp',
        updated_by: 'mcp',
      };
    });

    const result = await db.procedures.insertMany(procedures as any);
    const insertedIds = Object.values(result.insertedIds);
    const inserted = await db.procedures.find({ _id: { $in: insertedIds } }).toArray();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: inserted.length,
            procedures: inserted.map(p => ({
              ...p,
              _id: p._id.toString(),
              procedure_id: p._id.toString(),
              dependent_id: p.dependent_id.toString(),
              performed_by: p.performed_by?.toString(),
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
  
  if (validated.performed_by && !ObjectId.isValid(validated.performed_by)) {
    throw new Error('Invalid performed_by provider_id');
  }
  
  const procedure = {
    ...validated,
    dependent_id: new ObjectId(validated.dependent_id),
    performed_by: validated.performed_by ? new ObjectId(validated.performed_by) : undefined,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  };
  
  const result = await db.procedures.insertOne(procedure as any);
  const inserted = await db.procedures.findOne({ _id: result.insertedId });
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          procedure_id: result.insertedId.toString(),
          ...inserted,
          _id: inserted?._id.toString(),
          dependent_id: inserted?.dependent_id.toString(),
          performed_by: inserted?.performed_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function updateProcedure(db: Database, args: unknown) {
  const validated = UpdateProcedureSchema.parse(args);
  const { procedure_id, performed_by, ...updates } = validated;
  
  if (!ObjectId.isValid(procedure_id)) {
    throw new Error('Invalid procedure_id');
  }
  
  if (performed_by && !ObjectId.isValid(performed_by)) {
    throw new Error('Invalid performed_by provider_id');
  }
  
  const updateDoc: any = {
    ...updates,
    updated_at: new Date(),
    updated_by: 'mcp',
  };
  
  if (performed_by) {
    updateDoc.performed_by = new ObjectId(performed_by);
  }
  
  const result = await db.procedures.findOneAndUpdate(
    { _id: new ObjectId(procedure_id) },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    throw new Error('Procedure not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...result,
          _id: result._id.toString(),
          procedure_id: result._id.toString(),
          dependent_id: result.dependent_id.toString(),
          performed_by: result.performed_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function getProcedure(db: Database, args: unknown) {
  const validated = GetProcedureSchema.parse(args);
  
  if (!ObjectId.isValid(validated.procedure_id)) {
    throw new Error('Invalid procedure_id');
  }
  
  const procedure = await db.procedures.findOne({ _id: new ObjectId(validated.procedure_id) });
  
  if (!procedure) {
    throw new Error('Procedure not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...procedure,
          _id: procedure._id.toString(),
          procedure_id: procedure._id.toString(),
          dependent_id: procedure.dependent_id.toString(),
          performed_by: procedure.performed_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

