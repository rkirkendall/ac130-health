import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import {
  CreateLabSchema,
  UpdateLabSchema,
  GetLabSchema,
} from '../types.js';

export async function createLab(db: Database, args: unknown) {
  const validated = CreateLabSchema.parse(args);
  
  const now = new Date();

  // Helper function to transform results to components and handle dates
  const transformLabData = (l: any) => {
    // Transform results to components if results provided but components not
    let components = l.components;
    if (l.results && !components) {
      components = l.results.map((r: any) => ({
        name: r.test,
        value: r.value,
        unit: r.unit,
        reference_range: r.reference_range,
      }));
    }

    // Determine collected_at from various date fields
    let collectedAt: Date | undefined;
    if (l.collected_at) {
      collectedAt = new Date(l.collected_at);
    } else if (l.result_date) {
      collectedAt = new Date(l.result_date);
    } else if (l.order_date) {
      collectedAt = new Date(l.order_date);
    }

    return {
      ...l,
      components,
      patient_id: new ObjectId(l.patient_id),
      ordered_by: l.ordered_by ? new ObjectId(l.ordered_by) : undefined,
      collected_at: collectedAt,
      created_at: now,
      updated_at: now,
      created_by: 'mcp',
      updated_by: 'mcp',
    };
  };

  // Handle bulk creation
  if (Array.isArray(validated)) {
    const labs = validated.map(l => {
      if (!ObjectId.isValid(l.patient_id)) {
        throw new Error(`Invalid patient_id: ${l.patient_id}`);
      }
      if (l.ordered_by && !ObjectId.isValid(l.ordered_by)) {
        throw new Error(`Invalid ordered_by provider_id: ${l.ordered_by}`);
      }

      return transformLabData(l);
    });

    const result = await db.labs.insertMany(labs as any);
    const insertedIds = Object.values(result.insertedIds);
    const inserted = await db.labs.find({ _id: { $in: insertedIds } }).toArray();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: inserted.length,
            labs: inserted.map(l => ({
              ...l,
              _id: l._id.toString(),
              lab_id: l._id.toString(),
              patient_id: l.patient_id.toString(),
              ordered_by: l.ordered_by?.toString(),
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
  
  if (validated.ordered_by && !ObjectId.isValid(validated.ordered_by)) {
    throw new Error('Invalid ordered_by provider_id');
  }
  
  const lab = transformLabData(validated);
  
  const result = await db.labs.insertOne(lab as any);
  const inserted = await db.labs.findOne({ _id: result.insertedId });
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          lab_id: result.insertedId.toString(),
          ...inserted,
          _id: inserted?._id.toString(),
          patient_id: inserted?.patient_id.toString(),
          ordered_by: inserted?.ordered_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function updateLab(db: Database, args: unknown) {
  const validated = UpdateLabSchema.parse(args);
  const { lab_id, ordered_by, collected_at, ...updates } = validated;
  
  if (!ObjectId.isValid(lab_id)) {
    throw new Error('Invalid lab_id');
  }
  
  if (ordered_by && !ObjectId.isValid(ordered_by)) {
    throw new Error('Invalid ordered_by provider_id');
  }
  
  const updateDoc: any = {
    ...updates,
    updated_at: new Date(),
    updated_by: 'mcp',
  };
  
  if (ordered_by) {
    updateDoc.ordered_by = new ObjectId(ordered_by);
  }
  
  if (collected_at) {
    updateDoc.collected_at = new Date(collected_at);
  }
  
  const result = await db.labs.findOneAndUpdate(
    { _id: new ObjectId(lab_id) },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    throw new Error('Lab not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...result,
          _id: result._id.toString(),
          lab_id: result._id.toString(),
          patient_id: result.patient_id.toString(),
          ordered_by: result.ordered_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function getLab(db: Database, args: unknown) {
  const validated = GetLabSchema.parse(args);
  
  if (!ObjectId.isValid(validated.lab_id)) {
    throw new Error('Invalid lab_id');
  }
  
  const lab = await db.labs.findOne({ _id: new ObjectId(validated.lab_id) });
  
  if (!lab) {
    throw new Error('Lab not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...lab,
          _id: lab._id.toString(),
          lab_id: lab._id.toString(),
          patient_id: lab.patient_id.toString(),
          ordered_by: lab.ordered_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

