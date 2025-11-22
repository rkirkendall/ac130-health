import { Collection, Db, ObjectId } from 'mongodb';
import { PhiEntry, PhiVaultAdapter, PhiVaultEntry } from '../core/phi/types.js';

export class MongoPhiVaultAdapter implements PhiVaultAdapter {
  private readonly entriesCollection: Collection<PhiEntry>;
  private readonly vaultCollection: Collection<PhiVaultEntry>;

  constructor(db: Db) {
    this.entriesCollection = db.collection<PhiEntry>('phi_vault_entries');
    this.vaultCollection = db.collection<PhiVaultEntry>('phi_vault');
  }

  async upsertPhiEntries(
    entries: Omit<PhiEntry, '_id' | 'created_at' | 'updated_at'>[]
  ): Promise<ObjectId[]> {
    if (entries.length === 0) {
      return [];
    }

    const now = new Date();

    const ids = await Promise.all(
      entries.map(async (entry) => {
        const filter = {
          dependent_id: entry.dependent_id,
          resource_id: entry.resource_id,
          field_path: entry.field_path,
          value: entry.value,
          phi_type: entry.phi_type ?? null,
        };

        const result = await this.entriesCollection.findOneAndUpdate(
          filter,
          {
            $set: {
              dependent_id: entry.dependent_id,
              resource_type: entry.resource_type,
              resource_id: entry.resource_id,
              field_path: entry.field_path,
              value: entry.value,
              phi_type: entry.phi_type ?? null,
              updated_at: now,
            },
            $setOnInsert: {
              created_at: now,
            },
          },
          {
            upsert: true,
            returnDocument: 'after',
          }
        );

        const updatedDoc = result?.value;
        if (updatedDoc?._id) {
          return updatedDoc._id;
        }

        const fallback = await this.entriesCollection.findOne(filter, { projection: { _id: 1 } });
        if (!fallback?._id) {
          throw new Error('Failed to upsert PHI entry');
        }

        return fallback._id;
      })
    );

    return ids;
  }

  async getUnstructuredPhiVaultEntries(resourceIds: ObjectId[]): Promise<PhiEntry[]> {
    if (resourceIds.length === 0) {
      return [];
    }
    return this.entriesCollection.find({ resource_id: { $in: resourceIds } }).toArray();
  }

  async upsertStructuredPhiVault(
    dependentId: ObjectId,
    phiPayload: Record<string, unknown>,
    existingVaultId?: ObjectId
  ): Promise<ObjectId> {
    const now = new Date();

    if (existingVaultId) {
      await this.vaultCollection.updateOne(
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

    const existing = await this.vaultCollection.findOne(
      { dependent_id: dependentId },
      { projection: { _id: 1 } }
    );

    if (existing?._id) {
      await this.vaultCollection.updateOne(
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

    const insertResult = await this.vaultCollection.insertOne({
      dependent_id: dependentId,
      ...phiPayload,
      created_at: now,
      updated_at: now,
      created_by: 'mcp',
      updated_by: 'mcp',
    });

    return insertResult.insertedId;
  }

  async getStructuredPhiVault(vaultId: ObjectId): Promise<PhiVaultEntry | null> {
    return this.vaultCollection.findOne({ _id: vaultId });
  }

  async getStructuredPhiVaults(vaultIds: ObjectId[]): Promise<Map<string, PhiVaultEntry>> {
    if (vaultIds.length === 0) {
      return new Map();
    }
    const entries = await this.vaultCollection.find({ _id: { $in: vaultIds } }).toArray();
    
    const map = new Map<string, PhiVaultEntry>();
    for (const entry of entries) {
      if (entry._id) {
        map.set(entry._id.toHexString(), entry);
      }
    }
    return map;
  }

  async getStructuredPhiVaultByDependentId(dependentId: ObjectId): Promise<PhiVaultEntry | null> {
    return this.vaultCollection.findOne({ dependent_id: dependentId });
  }
}
