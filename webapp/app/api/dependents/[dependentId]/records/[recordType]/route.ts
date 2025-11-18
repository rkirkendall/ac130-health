import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dependentId: string; recordType: string }> }
) {
  try {
    const { dependentId, recordType } = await params;
    const client = await clientPromise;
    const db = client.db('health_record');
    
    const dependentObjectId = new ObjectId(dependentId);
    
    const records = await db.collection(recordType)
      .find({ dependent_id: dependentObjectId })
      .sort({ created_at: -1 })
      .toArray();

    // Resolve PHI tokens for active_summaries
    let phiMap: Record<string, string> = {};
    if (recordType === 'active_summaries') {
      const vaultIds = new Set<string>();
      records.forEach(record => {
        if (record.summary_text && typeof record.summary_text === 'string') {
          const matches = record.summary_text.match(/phi:vault:[0-9a-f]{24}/g);
          if (matches) {
            matches.forEach((m: string) => vaultIds.add(m.split(':')[2]));
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
    const db = client.db('health_record');

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
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: 'Record ID is required' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('health_record');

    const recordObjectId = new ObjectId(id);
    const dependentObjectId = new ObjectId(dependentId);

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
    const db = client.db('health_record');

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

