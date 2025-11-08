import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import {
  CreatePrescriptionSchema,
  UpdatePrescriptionSchema,
  GetPrescriptionSchema,
} from '../types.js';

export async function createPrescription(db: Database, args: unknown) {
  const validated = CreatePrescriptionSchema.parse(args);
  
  const now = new Date();

  // Handle bulk creation
  if (Array.isArray(validated)) {
    const prescriptions = validated.map(p => {
      if (!ObjectId.isValid(p.patient_id)) {
        throw new Error(`Invalid patient_id: ${p.patient_id}`);
      }
      if (p.prescriber_id && !ObjectId.isValid(p.prescriber_id)) {
        throw new Error(`Invalid prescriber_id: ${p.prescriber_id}`);
      }

      return {
        ...p,
        patient_id: new ObjectId(p.patient_id),
        prescriber_id: p.prescriber_id ? new ObjectId(p.prescriber_id) : undefined,
        created_at: now,
        updated_at: now,
        created_by: 'mcp',
        updated_by: 'mcp',
      };
    });

    const result = await db.prescriptions.insertMany(prescriptions as any);
    const insertedIds = Object.values(result.insertedIds);
    const inserted = await db.prescriptions.find({ _id: { $in: insertedIds } }).toArray();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: inserted.length,
            prescriptions: inserted.map(p => ({
              ...p,
              _id: p._id.toString(),
              prescription_id: p._id.toString(),
              patient_id: p.patient_id.toString(),
              prescriber_id: p.prescriber_id?.toString(),
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
  
  if (validated.prescriber_id && !ObjectId.isValid(validated.prescriber_id)) {
    throw new Error('Invalid prescriber_id');
  }
  
  const prescription = {
    ...validated,
    patient_id: new ObjectId(validated.patient_id),
    prescriber_id: validated.prescriber_id ? new ObjectId(validated.prescriber_id) : undefined,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  };
  
  const result = await db.prescriptions.insertOne(prescription as any);
  const inserted = await db.prescriptions.findOne({ _id: result.insertedId });
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          prescription_id: result.insertedId.toString(),
          ...inserted,
          _id: inserted?._id.toString(),
          patient_id: inserted?.patient_id.toString(),
          prescriber_id: inserted?.prescriber_id?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function updatePrescription(db: Database, args: unknown) {
  const validated = UpdatePrescriptionSchema.parse(args);
  const { prescription_id, prescriber_id, ...updates } = validated;
  
  if (!ObjectId.isValid(prescription_id)) {
    throw new Error('Invalid prescription_id');
  }
  
  if (prescriber_id && !ObjectId.isValid(prescriber_id)) {
    throw new Error('Invalid prescriber_id');
  }
  
  const updateDoc: any = {
    ...updates,
    updated_at: new Date(),
    updated_by: 'mcp',
  };
  
  if (prescriber_id) {
    updateDoc.prescriber_id = new ObjectId(prescriber_id);
  }
  
  const result = await db.prescriptions.findOneAndUpdate(
    { _id: new ObjectId(prescription_id) },
    { $set: updateDoc },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    throw new Error('Prescription not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...result,
          _id: result._id.toString(),
          prescription_id: result._id.toString(),
          patient_id: result.patient_id.toString(),
          prescriber_id: result.prescriber_id?.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function getPrescription(db: Database, args: unknown) {
  const validated = GetPrescriptionSchema.parse(args);
  
  if (!ObjectId.isValid(validated.prescription_id)) {
    throw new Error('Invalid prescription_id');
  }
  
  const prescription = await db.prescriptions.findOne({ _id: new ObjectId(validated.prescription_id) });
  
  if (!prescription) {
    throw new Error('Prescription not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...prescription,
          _id: prescription._id.toString(),
          prescription_id: prescription._id.toString(),
          patient_id: prescription.patient_id.toString(),
          prescriber_id: prescription.prescriber_id?.toString(),
        }, null, 2),
      },
    ],
  };
}

