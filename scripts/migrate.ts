#!/usr/bin/env ts-node
import { MongoClient } from 'mongodb';
import type { Db } from 'mongodb';

const MIGRATION_ID = '2024-phi-vault-v1';
const MIGRATIONS_COLLECTION = 'schema_migrations';
const DEPENDENT_COLLECTION = 'dependents';
const PHI_COLLECTION = 'phi_vault';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.HEALTH_RECORD_DB_NAME || 'health_record';

const PHI_SOURCE_FIELDS = ['name', 'relationship', 'dob', 'sex', 'contact'] as const;
const PATIENT_REFERENCE_COLLECTIONS = [
  'visits',
  'prescriptions',
  'labs',
  'treatments',
  'conditions',
  'allergies',
  'immunizations',
  'vital_signs',
  'procedures',
  'imaging',
  'insurance',
  'active_summaries',
] as const;

type DependentDoc = Record<string, any>;

function deriveRecordIdentifier(doc: DependentDoc): string {
  const existing = typeof doc.record_identifier === 'string' ? doc.record_identifier.trim() : '';
  if (existing) return existing;

  const relationship = typeof doc.relationship === 'string' ? doc.relationship.trim() : '';
  if (relationship) return relationship;

  const externalRef = typeof doc.external_ref === 'string' ? doc.external_ref.trim() : '';
  if (externalRef) return externalRef;

  return `Dependent-${doc._id?.toString().slice(-6).toUpperCase() ?? cryptoSafeSuffix()}`;
}

function cryptoSafeSuffix(): string {
  return Math.random().toString(36).slice(-6).toUpperCase();
}

function buildPhiPayload(doc: DependentDoc): Record<string, unknown> | undefined {
  const payload: Record<string, unknown> = {};

  if (doc.name) {
    payload.legal_name = doc.name;
  }
  if (doc.relationship) {
    payload.relationship_note = doc.relationship;
  }
  if (doc.dob) {
    payload.full_dob = doc.dob;
  }
  if (doc.sex) {
    payload.sex = doc.sex;
  }
  if (doc.contact) {
    payload.contact = doc.contact;
  }

  return Object.keys(payload).length > 0 ? payload : undefined;
}

async function applyMigration() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();

  const db = client.db(DB_NAME);
  const migrations = db.collection(MIGRATIONS_COLLECTION);
  const alreadyApplied = await migrations.findOne({ _id: MIGRATION_ID });
  if (alreadyApplied) {
    console.info(`[migrate] Migration ${MIGRATION_ID} already applied at ${alreadyApplied.applied_at}`);
    await client.close();
    return;
  }

  try {
    await ensureDependentsCollection(db);
    await migrateDependentDocuments(db);
    await renamePatientReferences(db);

    await migrations.insertOne({
      _id: MIGRATION_ID,
      applied_at: new Date().toISOString(),
    });

    console.info(`[migrate] Migration ${MIGRATION_ID} complete.`);
  } catch (error) {
    console.error('[migrate] Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

async function ensureDependentsCollection(db: Db) {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const hasPatients = collections.some((c: any) => c.name === 'patients');
  const hasDependents = collections.some((c: any) => c.name === DEPENDENT_COLLECTION);

  if (hasPatients && !hasDependents) {
    console.info('[migrate] Renaming patients -> dependents');
    await db.collection('patients').rename(DEPENDENT_COLLECTION);
  } else if (!hasPatients && !hasDependents) {
    console.info('[migrate] No patients collection found. Creating dependents collection.');
    await db.createCollection(DEPENDENT_COLLECTION);
  } else {
    console.info('[migrate] Dependents collection already in place.');
  }
}

async function migrateDependentDocuments(db: Db) {
  const dependents = db.collection(DEPENDENT_COLLECTION);
  const phiVault = db.collection(PHI_COLLECTION);
  await phiVault.createIndex({ dependent_id: 1 }, { unique: true });

  const cursor = dependents.find({});
  let updatedCount = 0;
  let vaultedCount = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next() as DependentDoc;
    const updates: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};

    const recordIdentifier = deriveRecordIdentifier(doc);
    if (doc.record_identifier !== recordIdentifier) {
      updates.record_identifier = recordIdentifier;
    }

    if (typeof doc.archived !== 'boolean') {
      updates.archived = false;
    }

    const hasExistingVault = Boolean(doc.phi_vault_id);
    const phiPayload = hasExistingVault ? undefined : buildPhiPayload(doc);

    if (!hasExistingVault && phiPayload) {
      const now = new Date();
      const result = await phiVault.insertOne({
        dependent_id: doc._id,
        ...phiPayload,
        created_at: doc.created_at ?? now,
        updated_at: now,
      });
      updates.phi_vault_id = result.insertedId;
      vaultedCount += 1;
    }

    for (const field of PHI_SOURCE_FIELDS) {
      if (doc[field] !== undefined) {
        unset[field] = '';
      }
    }

    const hasUnset = Object.keys(unset).length > 0;
    if (Object.keys(updates).length === 0 && !hasUnset) {
      continue;
    }

    updates.updated_at = new Date();

    const updateDoc: Record<string, unknown> = {
      $set: updates,
    };
    if (hasUnset) {
      updateDoc.$unset = unset;
    }

    await dependents.updateOne({ _id: doc._id }, updateDoc);
    updatedCount += 1;
  }

  console.info(`[migrate] Updated ${updatedCount} dependents; created ${vaultedCount} PHI vault entries.`);
}

async function renamePatientReferences(db: Db) {
  for (const collectionName of PATIENT_REFERENCE_COLLECTIONS) {
    const collection = db.collection(collectionName);
    const needsUpdate = await collection.findOne({ patient_id: { $exists: true } });
    if (!needsUpdate) {
      continue;
    }

    console.info(`[migrate] Converting patient_id -> dependent_id in ${collectionName}`);

    const needsUniqueIndex = collectionName === 'active_summaries';
    if (needsUniqueIndex) {
      try {
        await collection.dropIndex('patient_id_1');
        console.info('[migrate] Dropped patient_id_1 index on active_summaries');
      } catch (error: any) {
        if (error?.codeName !== 'IndexNotFound') {
          console.warn('[migrate] Failed to drop patient_id_1 index:', error);
        }
      }
    }
    await collection.updateMany(
      { patient_id: { $exists: true }, dependent_id: { $exists: false } },
      { $rename: { patient_id: 'dependent_id' } }
    );

    // Clean up remaining patient_id fields if both existed
    await collection.updateMany(
      { patient_id: { $exists: true } },
      { $unset: { patient_id: '' } }
    );

    if (needsUniqueIndex) {
      await collection.createIndex({ dependent_id: 1 }, { unique: true });
      console.info('[migrate] Created unique dependent_id index on active_summaries');
    }
  }
}

await applyMigration();

