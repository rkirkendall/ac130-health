import { UpdateHealthSummarySchema } from './types.js';
import type { PersistenceAdapter } from './persistence.js';

export async function updateHealthSummary(adapter: PersistenceAdapter, args: unknown) {
  const validated = UpdateHealthSummarySchema.parse(args);
  const persistence = adapter.forCollection('active_summaries');

  if (!persistence.validateId(validated.dependent_id)) {
    throw new Error('Invalid dependent_id');
  }
  
  const result = await persistence.updateOne(
    { dependent_id: validated.dependent_id },
    {
      set: {
        summary_text: validated.summary_text,
        updated_at: new Date(),
      },
      setOnInsert: {
        dependent_id: validated.dependent_id,
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
          dependent_id: validated.dependent_id,
          updated_at: result?.updated_at,
        }, null, 2),
      },
    ],
  };
}

export async function getHealthSummary(adapter: PersistenceAdapter, dependentId: string): Promise<string> {
  const persistence = adapter.forCollection('active_summaries');

  if (!persistence.validateId(dependentId)) {
    return 'Invalid dependent_id provided.';
  }
  
  const summary = await persistence.findOne({
    dependent_id: dependentId,
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

