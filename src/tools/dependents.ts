import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import {
  CreateDependentSchema,
  UpdateDependentSchema,
  GetDependentSchema,
  ListDependentsSchema,
} from '../types.js';

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

function hasPhiPayload(phi: Record<string, unknown> | undefined): boolean {
  if (!phi || typeof phi !== 'object') {
    return false;
  }
  return hasAnyValue(phi);
}

function formatDependent(doc: any) {
  return {
    ...doc,
    _id: doc._id.toString(),
    dependent_id: doc._id.toString(),
    phi_vault_id: doc.phi_vault_id ? doc.phi_vault_id.toString() : undefined,
    has_phi: Boolean(doc.phi_vault_id),
  };
}

async function upsertPhiVault(
  db: Database,
  dependentId: ObjectId,
  phi: Record<string, unknown> | undefined,
  existingVaultId?: ObjectId
) {
  if (!hasPhiPayload(phi)) {
    return existingVaultId;
  }

  const now = new Date();
  if (existingVaultId) {
    await db.phiVault.updateOne(
      { _id: existingVaultId },
      {
        $set: {
          ...phi,
          updated_at: now,
          updated_by: 'mcp',
        },
      }
    );
    return existingVaultId;
  }

  const insertResult = await db.phiVault.insertOne({
    dependent_id: dependentId,
    ...phi,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  });

  const phiVaultId = insertResult.insertedId;
  await db.dependents.updateOne(
    { _id: dependentId },
    { $set: { phi_vault_id: phiVaultId } }
  );

  return phiVaultId;
}

function buildDependentDoc(input: Record<string, unknown>, now: Date) {
  const { phi, ...rest } = input;
  return {
    doc: {
      ...rest,
      record_identifier: String(rest.record_identifier).trim(),
      archived: rest.archived ?? false,
      created_at: now,
      updated_at: now,
      created_by: 'mcp',
      updated_by: 'mcp',
    },
    phi: phi as Record<string, unknown> | undefined,
  };
}

export async function createDependent(db: Database, args: unknown) {
  const validated = CreateDependentSchema.parse(args);
  const now = new Date();

  const payloads = Array.isArray(validated) ? validated : [validated];
  const materials = payloads.map((payload) => buildDependentDoc(payload, now));

  if (Array.isArray(validated)) {
    const toInsert = materials.map((item) => item.doc);
    const result = await db.dependents.insertMany(toInsert as any);
    const insertedIds = Object.values(result.insertedIds) as ObjectId[];

    await Promise.all(
      insertedIds.map((id, index) =>
        upsertPhiVault(db, id, materials[index]?.phi)
      )
    );

    const inserted = await db.dependents
      .find({ _id: { $in: insertedIds } })
      .toArray();

    const formatted = inserted.map(formatDependent);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              count: formatted.length,
              dependents: formatted,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const { doc, phi } = materials[0];
  const result = await db.dependents.insertOne(doc as any);
  const dependentId = result.insertedId;

  await upsertPhiVault(db, dependentId, phi);

  const inserted = await db.dependents.findOne({ _id: dependentId });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            ...formatDependent(inserted),
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function updateDependent(db: Database, args: unknown) {
  const validated = UpdateDependentSchema.parse(args);
  const { dependent_id, phi, ...updates } = validated;

  if (!ObjectId.isValid(dependent_id)) {
    throw new Error('Invalid dependent_id');
  }

  const dependentObjectId = new ObjectId(dependent_id);

  const result = await db.dependents.findOneAndUpdate(
    { _id: dependentObjectId },
    {
      $set: {
        ...updates,
        updated_at: new Date(),
        updated_by: 'mcp',
      },
    },
    { returnDocument: 'after' }
  );

  if (!result) {
    throw new Error('Dependent not found');
  }

  await upsertPhiVault(db, dependentObjectId, phi, result.phi_vault_id);

  const refreshed = await db.dependents.findOne({ _id: dependentObjectId });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            ...formatDependent(refreshed),
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function getDependent(db: Database, args: unknown) {
  const validated = GetDependentSchema.parse(args);

  if (!ObjectId.isValid(validated.dependent_id)) {
    throw new Error('Invalid dependent_id');
  }

  const dependent = await db.dependents.findOne({
    _id: new ObjectId(validated.dependent_id),
  });

  if (!dependent) {
    throw new Error('Dependent not found');
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            ...formatDependent(dependent),
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function listDependents(db: Database, args: unknown) {
  const validated = ListDependentsSchema.parse(args);

  const query: Record<string, unknown> = {};
  if (validated.record_identifier) {
    query.record_identifier = validated.record_identifier;
  }
  if (validated.external_ref) {
    query.external_ref = validated.external_ref;
  }
  if (typeof validated.archived === 'boolean') {
    query.archived = validated.archived;
  }

  const limit = validated.limit || 50;
  const dependents = await db.dependents.find(query).limit(limit).toArray();

  const formatted = dependents.map(formatDependent);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            count: dependents.length,
            dependents: formatted,
          },
          null,
          2
        ),
      },
    ],
  };
}

