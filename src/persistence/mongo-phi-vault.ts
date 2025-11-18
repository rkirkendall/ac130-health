import { Collection, Db, ObjectId } from 'mongodb';
import { PhiEntry, PhiVaultAdapter } from '../core/phi/types.js';

export class MongoPhiVaultAdapter implements PhiVaultAdapter {
  private readonly collection: Collection<PhiEntry>;

  constructor(db: Db) {
    this.collection = db.collection<PhiEntry>('phi_vault_entries');
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

        const result = await this.collection.findOneAndUpdate(
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

        const fallback = await this.collection.findOne(filter, { projection: { _id: 1 } });
        if (!fallback?._id) {
          throw new Error('Failed to upsert PHI entry');
        }

        return fallback._id;
      })
    );

    return ids;
  }
}
