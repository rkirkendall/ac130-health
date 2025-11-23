import { Collection, Db, ObjectId } from 'mongodb';
import { PhiEntry, PhiVaultAdapter, PhiVaultEntry } from '../core/phi/types.js';

export class MongoPhiVaultAdapter implements PhiVaultAdapter {
  private readonly entriesCollection: Collection<any>; // Using any for internal collection to handle ObjectId mismatch
  private readonly vaultCollection: Collection<any>; // Using any for internal collection to handle ObjectId mismatch

  constructor(db: Db) {
    this.entriesCollection = db.collection('phi_vault_entries');
    this.vaultCollection = db.collection('phi_vault');
  }

  async upsertPhiEntries(
    entries: Omit<PhiEntry, '_id' | 'created_at' | 'updated_at'>[]
  ): Promise<string[]> {
    if (entries.length === 0) {
      return [];
    }

    const now = new Date();

    const ids = await Promise.all(
      entries.map(async (entry) => {
        const filter = {
          dependent_id: new ObjectId(entry.dependent_id),
          resource_id: new ObjectId(entry.resource_id),
          field_path: entry.field_path,
          value: entry.value,
          phi_type: entry.phi_type ?? null,
        };

        const result = await this.entriesCollection.findOneAndUpdate(
          filter,
          {
            $set: {
              dependent_id: new ObjectId(entry.dependent_id),
              resource_type: entry.resource_type,
              resource_id: new ObjectId(entry.resource_id),
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
          return updatedDoc._id.toHexString();
        }

        const fallback = await this.entriesCollection.findOne(filter, { projection: { _id: 1 } });
        if (!fallback?._id) {
          throw new Error('Failed to upsert PHI entry');
        }

        return (fallback._id as ObjectId).toHexString();
      })
    );

    return ids;
  }

  async getUnstructuredPhiVaultEntries(resourceIds: string[]): Promise<PhiEntry[]> {
    if (resourceIds.length === 0) {
      return [];
    }
    const objectIds = resourceIds.map(id => new ObjectId(id));
    const entries = await this.entriesCollection.find({ resource_id: { $in: objectIds } }).toArray();
    return entries.map(entry => ({
      ...entry,
      _id: entry._id ? (entry._id as ObjectId).toHexString() : undefined,
      dependent_id: (entry.dependent_id as any).toHexString(),
      resource_id: (entry.resource_id as any).toHexString(),
    }));
  }

  async upsertStructuredPhiVault(
    dependentId: string,
    phiPayload: Record<string, unknown>,
    existingVaultId?: string
  ): Promise<string> {
    const now = new Date();

    if (existingVaultId) {
      const vaultObjectId = new ObjectId(existingVaultId);
      await this.vaultCollection.updateOne(
        { _id: vaultObjectId },
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

    const depObjectId = new ObjectId(dependentId);
    const existing = await this.vaultCollection.findOne(
      { dependent_id: depObjectId },
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
      return (existing._id as ObjectId).toHexString();
    }

    const insertResult = await this.vaultCollection.insertOne({
      dependent_id: depObjectId,
      ...phiPayload,
      created_at: now,
      updated_at: now,
      created_by: 'mcp',
      updated_by: 'mcp',
    });

    return insertResult.insertedId.toHexString();
  }

  async getStructuredPhiVault(vaultId: string): Promise<PhiVaultEntry | null> {
    const entry = await this.vaultCollection.findOne({ _id: new ObjectId(vaultId) });
    if (!entry) return null;
    return {
      ...entry,
      _id: entry._id ? (entry._id as ObjectId).toHexString() : undefined,
      dependent_id: (entry.dependent_id as any).toHexString(),
    } as any;
  }

  async getStructuredPhiVaults(vaultIds: string[]): Promise<Map<string, PhiVaultEntry>> {
    if (vaultIds.length === 0) {
      return new Map();
    }
    const objectIds = vaultIds.map(id => new ObjectId(id));
    const entries = await this.vaultCollection.find({ _id: { $in: objectIds } }).toArray();
    
    const map = new Map<string, PhiVaultEntry>();
    for (const entry of entries) {
      if (entry._id) {
        const entryId = entry._id.toHexString();
        map.set(entryId, {
          ...entry,
          _id: entryId,
          dependent_id: (entry.dependent_id as any).toHexString(),
        } as any);
      }
    }
    return map;
  }

  async getStructuredPhiVaultByDependentId(dependentId: string): Promise<PhiVaultEntry | null> {
    const entry = await this.vaultCollection.findOne({ dependent_id: new ObjectId(dependentId) });
    if (!entry) return null;
    return {
      ...entry,
      _id: entry._id ? (entry._id as ObjectId).toHexString() : undefined,
      dependent_id: (entry.dependent_id as any).toHexString(),
    } as any;
  }
}
