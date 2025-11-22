import { ObjectId } from 'mongodb';
import { PhiVaultEntry } from '../types.js';

export { PhiVaultEntry };

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
 * This interface is persistence-agnostic (except for ObjectId which is currently used as a universal ID type in core).
 * Note: In a pure abstraction, ObjectId should be generic or string, but for now we maintain compat with core types.
 */
export interface PhiVaultAdapter {
  /**
   * Upserts a batch of PHI entries (unstructured PHI from resources).
   */
  upsertPhiEntries(
    entries: Omit<PhiEntry, '_id' | 'created_at' | 'updated_at'>[]
  ): Promise<ObjectId[]>;

  /**
   * Retrieves unstructured PHI entries for specific resources.
   * Used for de-identification.
   */
  getUnstructuredPhiVaultEntries(resourceIds: ObjectId[]): Promise<PhiEntry[]>;

  /**
   * Upserts a structured PHI vault entry (for a dependent profile).
   */
  upsertStructuredPhiVault(
    dependentId: ObjectId,
    phiPayload: Record<string, unknown>,
    existingVaultId?: ObjectId
  ): Promise<ObjectId>;

  /**
   * Retrieves a structured PHI vault entry by its Vault ID.
   */
  getStructuredPhiVault(vaultId: ObjectId): Promise<PhiVaultEntry | null>;

  /**
   * Retrieves multiple structured PHI vault entries by their Vault IDs.
   * Returns a Map keyed by Vault ID string.
   */
  getStructuredPhiVaults(vaultIds: ObjectId[]): Promise<Map<string, PhiVaultEntry>>;

  /**
   * Retrieves a structured PHI vault entry by the Dependent ID.
   */
  getStructuredPhiVaultByDependentId(dependentId: ObjectId): Promise<PhiVaultEntry | null>;
}
