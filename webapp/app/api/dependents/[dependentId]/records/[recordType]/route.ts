import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { selectDbNameFromHeaders } from '@/lib/db-config';

const RECORD_ID_FIELD_BY_COLLECTION: Record<string, string> = {
  visits: 'visit_id',
  prescriptions: 'prescription_id',
  labs: 'lab_id',
  treatments: 'treatment_id',
  conditions: 'condition_id',
  allergies: 'allergy_id',
  immunizations: 'immunization_id',
  vital_signs: 'vital_sign_id',
  procedures: 'procedure_id',
  imaging: 'imaging_id',
  insurance: 'insurance_id',
};

const IMMUTABLE_FIELDS = new Set([
  '_id',
  'id',
  'dependent_id',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  'phi_vault_id',
]);

function extractRecordId(
  payload: Record<string, unknown>,
  recordType: string
): string | undefined {
  const aliasField = RECORD_ID_FIELD_BY_COLLECTION[recordType];
  return (
    (payload['id'] as string | undefined) ??
    (payload['_id'] as string | undefined) ??
    (aliasField ? (payload[aliasField] as string | undefined) : undefined)
  );
}

function sanitizeUpdatePayload(
  payload: Record<string, unknown>,
  recordType: string
): Record<string, unknown> {
  const aliasField = RECORD_ID_FIELD_BY_COLLECTION[recordType];
  const forbidden = new Set(IMMUTABLE_FIELDS);
  if (aliasField) {
    forbidden.add(aliasField);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (forbidden.has(key)) {
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dependentId: string; recordType: string }> }
) {
  try {
    const { dependentId, recordType } = await params;
    const client = await clientPromise;
    const db = client.db(selectDbNameFromHeaders(request.headers));
    
    const dependentObjectId = new ObjectId(dependentId);
    
    const records = await db.collection(recordType)
      .find({ dependent_id: dependentObjectId })
      .sort({ created_at: -1 })
      .toArray();

    // Resolve PHI tokens for active_summaries
    const phiMap: Record<string, string> = {};
    if (recordType === 'active_summaries') {
      const vaultIds = new Set<string>();
      const tokenRegex = /phi:vault(?::[A-Z_]+)?:([0-9a-f]{24})/g;

      records.forEach(record => {
        if (record.summary_text && typeof record.summary_text === 'string') {
          const matches = record.summary_text.match(tokenRegex);
          if (matches) {
            matches.forEach((match: string) => {
              const parts = match.split(':');
              const id = parts[parts.length - 1];
              if (id) {
                vaultIds.add(id);
              }
            });
          }
        }
      });

      if (vaultIds.size > 0) {
        const vaultEntries = await db.collection('phi_vault_entries')
          .find({ _id: { $in: Array.from(vaultIds).map(id => new ObjectId(id)) } })
          .toArray();
        
        vaultEntries.forEach(entry => {
          phiMap[entry._id.toString()] = entry.value;
        });
      }
    }
    
    const recordsWithIds = records.map(record => ({
      ...record,
      _id: record._id.toString(),
      dependent_id: record.dependent_id?.toString ? record.dependent_id.toString() : record.dependent_id,
      provider_id: record.provider_id?.toString ? record.provider_id.toString() : record.provider_id,
      prescriber_id: record.prescriber_id?.toString ? record.prescriber_id.toString() : record.prescriber_id,
      ordered_by: record.ordered_by?.toString ? record.ordered_by.toString() : record.ordered_by,
      diagnosed_by: record.diagnosed_by?.toString ? record.diagnosed_by.toString() : record.diagnosed_by,
      verified_by: record.verified_by?.toString ? record.verified_by.toString() : record.verified_by,
      recorded_by: record.recorded_by?.toString ? record.recorded_by.toString() : record.recorded_by,
      performed_by: record.performed_by?.toString ? record.performed_by.toString() : record.performed_by,
      administered_by: record.administered_by?.toString ? record.administered_by.toString() : record.administered_by,
      _phi_resolved: recordType === 'active_summaries' ? phiMap : undefined,
    }));
    
    return NextResponse.json(recordsWithIds);
  } catch (error) {
    console.error('Error fetching records:', error);
    return NextResponse.json({ error: 'Failed to fetch records' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dependentId: string; recordType: string }> }
) {
  try {
    const { dependentId, recordType } = await params;
    const body = await request.json();

    const client = await clientPromise;
    const db = client.db(selectDbNameFromHeaders(request.headers));

    const dependentObjectId = new ObjectId(dependentId);

    // Handle both single record and array of records
    const recordsToInsert = Array.isArray(body) ? body : [body];

    const recordsWithIds = recordsToInsert.map(record => ({
      ...record,
      dependent_id: dependentObjectId,
      created_at: new Date(),
      updated_at: new Date(),
    }));

    const result = await db.collection(recordType).insertMany(recordsWithIds);

    return NextResponse.json({
      insertedCount: result.insertedCount,
      insertedIds: Object.values(result.insertedIds).map(id => id.toString())
    });
  } catch (error) {
    console.error('Error creating records:', error);
    return NextResponse.json({ error: 'Failed to create records' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ dependentId: string; recordType: string }> }
) {
  try {
    const { dependentId, recordType } = await params;
    const rawBody = await request.json();

    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      return NextResponse.json(
        { error: 'Request body must be an object' },
        { status: 400 }
      );
    }

    const body = rawBody as Record<string, unknown>;
    const recordId = extractRecordId(body, recordType);

    if (!recordId) {
      return NextResponse.json({ error: 'Record ID is required' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(selectDbNameFromHeaders(request.headers));

    const recordObjectId = new ObjectId(recordId);
    const dependentObjectId = new ObjectId(dependentId);
    const updateData = sanitizeUpdatePayload(body, recordType);

    const result = await db.collection(recordType).updateOne(
      { _id: recordObjectId, dependent_id: dependentObjectId },
      {
        $set: {
          ...updateData,
          updated_at: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json({ modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error('Error updating record:', error);
    return NextResponse.json({ error: 'Failed to update record' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ dependentId: string; recordType: string }> }
) {
  try {
    const { dependentId, recordType } = await params;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Record ID is required' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(selectDbNameFromHeaders(request.headers));

    const recordObjectId = new ObjectId(id);
    const dependentObjectId = new ObjectId(dependentId);

    const result = await db.collection(recordType).deleteOne({
      _id: recordObjectId,
      dependent_id: dependentObjectId
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json({ deletedCount: result.deletedCount });
  } catch (error) {
    console.error('Error deleting record:', error);
    return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 });
  }
}

