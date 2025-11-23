import { ObjectId } from 'mongodb';
import { PhiVaultEntry } from '../types.js';

export { PhiVaultEntry };

/**
 * Represents a single piece of Protected Health Information (PHI).
 */
export interface PhiEntry {
  _id?: string;
  dependent_id: string;
  resource_type: string; // The resource type this PHI belongs to (e.g. 'condition')
  resource_id: string; // The ID of the resource instance
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
 * This interface is persistence-agnostic. IDs are passed as strings at the boundary.
 * Persistence implementations handle conversion to native ID types (e.g. ObjectId) if needed.
 */
export interface PhiVaultAdapter {
  /**
   * Upserts a batch of PHI entries (unstructured PHI from resources).
   */
  upsertPhiEntries(
    entries: Omit<PhiEntry, '_id' | 'created_at' | 'updated_at'>[]
  ): Promise<string[]>;

  /**
   * Retrieves unstructured PHI entries for specific resources.
   * Used for de-identification.
   */
  getUnstructuredPhiVaultEntries(resourceIds: string[]): Promise<PhiEntry[]>;

  /**
   * Upserts a structured PHI vault entry (for a dependent profile).
   */
  upsertStructuredPhiVault(
    dependentId: string,
    phiPayload: Record<string, unknown>,
    existingVaultId?: string
  ): Promise<string>;

  /**
   * Retrieves a structured PHI vault entry by its Vault ID.
   */
  getStructuredPhiVault(vaultId: string): Promise<PhiVaultEntry | null>;

  /**
   * Retrieves multiple structured PHI vault entries by their Vault IDs.
   * Returns a Map keyed by Vault ID string.
   */
  getStructuredPhiVaults(vaultIds: string[]): Promise<Map<string, PhiVaultEntry>>;

  /**
   * Retrieves a structured PHI vault entry by the Dependent ID.
   */
  getStructuredPhiVaultByDependentId(dependentId: string): Promise<PhiVaultEntry | null>;
}
