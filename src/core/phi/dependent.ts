import { Db, ObjectId } from 'mongodb';
import { PhiVaultEntry } from '../types.js';
import { PhiEntry } from './types.js';

function hasAnyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some(hasAnyValue);
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasAnyValue);
  }

  return true;
}

export function hasPhiPayload(phi: Record<string, unknown> | undefined): boolean {
  if (!phi || typeof phi !== 'object') {
    return false;
  }

  return hasAnyValue(phi);
}

export function separatePhiPayload(
  record: Record<string, unknown>
): {
  sanitized: Record<string, unknown>;
  phiPayload?: Record<string, unknown>;
} {
  if (!record || typeof record !== 'object' || !Object.prototype.hasOwnProperty.call(record, 'phi')) {
    return { sanitized: record };
  }

  const { phi, ...rest } = record as Record<string, unknown> & {
    phi?: Record<string, unknown>;
  };

  if (phi && hasPhiPayload(phi)) {
    return {
      sanitized: rest,
      phiPayload: phi,
    };
  }

  return { sanitized: rest };
}

export async function upsertStructuredPhiVault(
  db: Db,
  dependentId: ObjectId,
  phiPayload: Record<string, unknown>,
  existingVaultId?: ObjectId
): Promise<ObjectId> {
  const collection = db.collection('phi_vault');
  const now = new Date();

  if (existingVaultId) {
    await collection.updateOne(
      { _id: existingVaultId },
      {
        $set: {
          ...phiPayload,
          updated_at: now,
          updated_by: 'mcp',
        },
      }
    );
    return existingVaultId;
  }

  const existing = await collection.findOne(
    { dependent_id: dependentId },
    { projection: { _id: 1 } }
  );

  if (existing?._id) {
    await collection.updateOne(
      { _id: existing._id },
      {
        $set: {
          ...phiPayload,
          updated_at: now,
          updated_by: 'mcp',
        },
      }
    );
    return existing._id as ObjectId;
  }

  const insertResult = await collection.insertOne({
    dependent_id: dependentId,
    ...phiPayload,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  });

  return insertResult.insertedId;
}

export async function getStructuredPhiVault(
  db: Db,
  vaultId: ObjectId
): Promise<PhiVaultEntry | null> {
  const collection = db.collection<PhiVaultEntry>('phi_vault');
  return collection.findOne({ _id: vaultId });
}

export async function getStructuredPhiVaults(
  db: Db,
  vaultIds: ObjectId[]
): Promise<Map<string, PhiVaultEntry>> {
  const collection = db.collection<PhiVaultEntry>('phi_vault');
  const entries = await collection.find({ _id: { $in: vaultIds } }).toArray();
  
  const map = new Map<string, PhiVaultEntry>();
  for (const entry of entries) {
    if (entry._id) {
      map.set(entry._id.toHexString(), entry);
    }
  }
  return map;
}

export async function getUnstructuredPhiVaultEntries(
  db: Db,
  resourceIds: ObjectId[]
): Promise<PhiEntry[]> {
  if (resourceIds.length === 0) {
    return [];
  }
  const collection = db.collection<PhiEntry>('phi_vault_entries');
  return collection.find({ resource_id: { $in: resourceIds } }).toArray();
}
