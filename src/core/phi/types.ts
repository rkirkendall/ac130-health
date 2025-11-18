import { ObjectId } from 'mongodb';

/**
 * Represents a single piece of Protected Health Information (PHI).
 */
export interface PhiEntry {
  _id?: ObjectId;
  dependent_id: ObjectId;
  resource_type: string; // The resource type this PHI belongs to (e.g. 'condition')
  resource_id: ObjectId; // The ID of the resource instance
  field_path: string; // e.g., 'notes' or 'procedure.description'
  value: any;
  phi_type?: string | null; // e.g., 'FULL_NAME', 'DATE', 'PHONE_NUMBER'
  created_at: Date;
  updated_at: Date;
}

export interface DetectedPhi {
  field_path: string;
  value: any;
  phi_type?: string;
  redacted_value?: string;
}

/**
 * An adapter for storing and retrieving PHI from a secure vault.
 */
export interface PhiVaultAdapter {
  /**
   * Upserts a batch of PHI entries.
   * This should be an idempotent operation.
   *
   * @param entries The PHI entries to upsert.
   * @returns A promise that resolves when the operation is complete.
   */
  upsertPhiEntries(
    entries: Omit<PhiEntry, '_id' | 'created_at' | 'updated_at'>[]
  ): Promise<ObjectId[]>;
}
