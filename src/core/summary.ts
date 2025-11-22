import { UpdateHealthSummarySchema } from './types.js';
import type { PersistenceAdapter } from './persistence.js';
import type { PhiVaultAdapter } from './phi/types.js';
import { vaultAndSanitizeFields } from './phi/vault.js';
import { ObjectId } from 'mongodb';

export async function updateHealthSummary(
  adapter: PersistenceAdapter,
  vaultAdapter: PhiVaultAdapter,
  args: unknown
) {
  const validated = UpdateHealthSummarySchema.parse(args);
  const persistence = adapter.forCollection('active_summaries');

  if (!persistence.validateId(validated.dependent_id)) {
    throw new Error('Invalid dependent_id');
  }

  const dependentId = new ObjectId(validated.dependent_id);

  // Find existing summary to get ID, or generate new one
  const existingSummary = await persistence.findOne({ dependent_id: validated.dependent_id });
  const summaryId = existingSummary?._id
    ? new ObjectId(existingSummary._id as string)
    : new ObjectId();

  // Helper to safely collect identifiers
  const identifierSet = new Set<string>();
  const addIdentifier = (value: unknown) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        identifierSet.add(trimmed);
      }
    }
  };

  // Fetch dependent to get known identifiers
  const dependentPersistence = adapter.forCollection('dependents');
  const dependent = await dependentPersistence.findById(validated.dependent_id);
  
  if (dependent) {
    addIdentifier(dependent.record_identifier);
    addIdentifier(dependent.external_ref);
    if (dependent.phi?.legal_name?.given) addIdentifier(dependent.phi.legal_name.given);
    if (dependent.phi?.legal_name?.family) addIdentifier(dependent.phi.legal_name.family);
    if (dependent.phi?.preferred_name) addIdentifier(dependent.phi.preferred_name);
    if (
      dependent.phi?.legal_name?.given &&
      dependent.phi?.legal_name?.family
    ) {
      addIdentifier(`${dependent.phi.legal_name.given} ${dependent.phi.legal_name.family}`);
    }
  }

  // Augment identifiers with structured PHI (legal name, preferred name, etc.)
  const resolveObjectId = (value: unknown): ObjectId | null => {
    if (value instanceof ObjectId) return value;
    if (typeof value === 'string' && ObjectId.isValid(value)) {
      return new ObjectId(value);
    }
    return null;
  };

  let vaultEntry = null;
  // Resolve vault ID to string if possible
  const dependentPhiVaultIdString = typeof (dependent as any)?.phi_vault_id === 'string' 
    ? (dependent as any).phi_vault_id 
    : (dependent as any)?.phi_vault_id?.toHexString?.();

  if (dependentPhiVaultIdString) {
    vaultEntry = await vaultAdapter.getStructuredPhiVault(dependentPhiVaultIdString);
  } else {
    vaultEntry = await vaultAdapter.getStructuredPhiVaultByDependentId(validated.dependent_id);
  }

  if (vaultEntry) {
    if (vaultEntry.legal_name?.given) addIdentifier(vaultEntry.legal_name.given);
    if (vaultEntry.legal_name?.family) addIdentifier(vaultEntry.legal_name.family);
    if (vaultEntry.preferred_name) addIdentifier(vaultEntry.preferred_name);
    if (
      vaultEntry.legal_name?.given &&
      vaultEntry.legal_name?.family
    ) {
      addIdentifier(`${vaultEntry.legal_name.given} ${vaultEntry.legal_name.family}`);
    }
  }

  const knownIdentifiers = Array.from(identifierSet);

  // Sanitize payload
  const payload = { summary_text: validated.summary_text };
  const sanitizedPayload = await vaultAndSanitizeFields(
    vaultAdapter,
    'health_summary',
    summaryId.toHexString(),
    validated.dependent_id,
    payload,
    [{ path: 'summary_text', strategy: 'substring' }],
    knownIdentifiers
  );

  const result = await persistence.updateOne(
    { dependent_id: validated.dependent_id },
    {
      set: {
        summary_text: sanitizedPayload.summary_text,
        updated_at: new Date(),
        archived: false,
      },
      setOnInsert: {
        _id: summaryId,
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
  
  if (!summary || summary.archived === true) {
    return 'No active health summary available yet. Use update_health_summary to create one.';
  }
  
  const summaryText = summary.summary_text;
  if (typeof summaryText !== 'string') {
    return 'Active health summary exists but the stored summary_text is not a string.';
  }

  return summaryText;
}
