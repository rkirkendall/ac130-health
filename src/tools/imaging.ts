import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import {
  CreateImagingSchema,
  UpdateImagingSchema,
  GetImagingSchema,
} from '../types.js';

export async function createImaging(db: Database, args: unknown) {
  const validated = CreateImagingSchema.parse(args);
  
  const now = new Date();

  // Handle bulk creation
  if (Array.isArray(validated)) {
    const imaging = validated.map(i => {
      if (!ObjectId.isValid(i.patient_id)) {
        throw new Error(`Invalid patient_id: ${i.patient_id}`);
      }
      if (i.ordered_by && !ObjectId.isValid(i.ordered_by)) {
        throw new Error(`Invalid ordered_by provider_id: ${i.ordered_by}`);
      }

      return {
        ...i,
        patient_id: new ObjectId(i.patient_id),
        ordered_by: i.ordered_by ? new ObjectId(i.ordered_by) : undefined,
        created_at: now,
        updated_at: now,
        created_by: 'mcp',
        updated_by: 'mcp',
      };
    });

    const result = await db.imaging.insertMany(imaging as any);
    const insertedIds = Object.values(result.insertedIds);
    const inserted = await db.imaging.find({ _id: { $in: insertedIds } }).toArray();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: inserted.length,
            imaging: inserted.map(i => ({
              ...i,
              _id: i._id.toString(),
              imaging_id: i._id.toString(),
              patient_id: i.patient_id.toString(),
              ordered_by: i.ordered_by?.toString(),
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
  
  const imagingRecord = {
    ...validated,
    patient_id: new ObjectId(validated.patient_id),
    ordered_by: validated.ordered_by ? new ObjectId(validated.ordered_by) : undefined,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  };
  
  const result = await db.imaging.insertOne(imagingRecord as any);
  const inserted = await db.imaging.findOne({ _id: result.insertedId });
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          imaging_id: result.insertedId.toString(),
          ...inserted,
          _id: inserted?._id.toString(),
          patient_id: inserted?.patient_id.toString(),
          ordered_by: inserted?.ordered_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function updateImaging(db: Database, args: unknown) {
  const validated = UpdateImagingSchema.parse(args);
  const { imaging_id, ordered_by, ...updates } = validated;
  
  if (!ObjectId.isValid(imaging_id)) {
    throw new Error('Invalid imaging_id');
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
  
  const result = await db.imaging.findOneAndUpdate(
    { _id: new ObjectId(imaging_id) },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    throw new Error('Imaging not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...result,
          _id: result._id.toString(),
          imaging_id: result._id.toString(),
          patient_id: result.patient_id.toString(),
          ordered_by: result.ordered_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function getImaging(db: Database, args: unknown) {
  const validated = GetImagingSchema.parse(args);
  
  if (!ObjectId.isValid(validated.imaging_id)) {
    throw new Error('Invalid imaging_id');
  }
  
  const imaging = await db.imaging.findOne({ _id: new ObjectId(validated.imaging_id) });
  
  if (!imaging) {
    throw new Error('Imaging not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...imaging,
          _id: imaging._id.toString(),
          imaging_id: imaging._id.toString(),
          patient_id: imaging.patient_id.toString(),
          ordered_by: imaging.ordered_by?.toString(),
        }, null, 2),
      },
    ],
  };
}

