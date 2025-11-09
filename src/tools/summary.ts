import { Database } from '../db.js';
import { UpdateHealthSummarySchema } from '../types.js';

export async function updateHealthSummary(db: Database, args: unknown) {
  const validated = UpdateHealthSummarySchema.parse(args);
  const persistence = db.getResourcePersistence('active_summaries');

  if (!persistence.validateId(validated.patient_id)) {
    throw new Error('Invalid patient_id');
  }
  
  const result = await persistence.updateOne(
    { patient_id: validated.patient_id },
    {
      set: {
        summary_text: validated.summary_text,
        updated_at: new Date(),
      },
      setOnInsert: {
        patient_id: validated.patient_id,
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
  const persistence = db.getResourcePersistence('active_summaries');

  if (!persistence.validateId(patientId)) {
    return 'Invalid patient_id provided.';
  }
  
  const summary = await persistence.findOne({
    patient_id: patientId,
  });
  
  if (!summary) {
    return 'No active health summary available yet. Use update_health_summary to create one.';
  }
  
  const summaryText = summary.summary_text;
  if (typeof summaryText !== 'string') {
    return 'Active health summary exists but the stored summary_text is not a string.';
  }

  return summaryText;
}

