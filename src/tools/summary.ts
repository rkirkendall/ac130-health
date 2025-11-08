import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import { UpdateHealthSummarySchema } from '../types.js';

export async function updateHealthSummary(db: Database, args: unknown) {
  const validated = UpdateHealthSummarySchema.parse(args);
  
  if (!ObjectId.isValid(validated.patient_id)) {
    throw new Error('Invalid patient_id');
  }
  
  const result = await db.activeSummaries.findOneAndUpdate(
    { patient_id: new ObjectId(validated.patient_id) },
    {
      $set: {
        summary_text: validated.summary_text,
        updated_at: new Date(),
      },
      $setOnInsert: {
        patient_id: new ObjectId(validated.patient_id),
      },
    },
    {
      upsert: true,
      returnDocument: 'after',
    }
  );
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          patient_id: validated.patient_id,
          updated_at: result?.updated_at,
        }, null, 2),
      },
    ],
  };
}

export async function getHealthSummary(db: Database, patientId: string): Promise<string> {
  if (!ObjectId.isValid(patientId)) {
    return 'Invalid patient_id provided.';
  }
  
  const summary = await db.activeSummaries.findOne({
    patient_id: new ObjectId(patientId),
  });
  
  if (!summary) {
    return 'No active health summary available yet. Use update_health_summary to create one.';
  }
  
  return summary.summary_text;
}

