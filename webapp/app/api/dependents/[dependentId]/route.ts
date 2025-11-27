import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';

import clientPromise from '@/lib/mongodb';
import { RECORD_TYPES } from '@/lib/types';
import { selectDbNameFromHeaders } from '@/lib/db-config';

const CASCADE_COLLECTIONS = Array.from(new Set(RECORD_TYPES.map(({ type }) => type)));

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ dependentId: string }> }
) {
  try {
    const { dependentId } = await params;

    if (!dependentId) {
      return NextResponse.json({ error: 'Dependent ID is required' }, { status: 400 });
    }

    if (!ObjectId.isValid(dependentId)) {
      return NextResponse.json({ error: 'Invalid dependent ID' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db(selectDbNameFromHeaders(request.headers));
    const dependentObjectId = new ObjectId(dependentId);

    const deletedDependent = await db
      .collection('dependents')
      .findOneAndDelete({ _id: dependentObjectId });

    const dependentFilter = {
      dependent_id: { $in: [dependentObjectId, dependentId] },
    };

    const cascadeResults = await Promise.all(
      CASCADE_COLLECTIONS.map(collection =>
        db.collection(collection).deleteMany(dependentFilter)
      )
    );

    const phiResult = await db.collection('phi_vault').deleteMany(dependentFilter);

    const deletedCounts = CASCADE_COLLECTIONS.reduce<Record<string, number>>(
      (acc, collection, index) => {
        acc[collection] = cascadeResults[index]?.deletedCount ?? 0;
        return acc;
      },
      {}
    );

    const responsePayload = {
      dependent_id: dependentId,
      record_identifier: deletedDependent?.value?.record_identifier,
      status: deletedDependent?.value ? 'deleted' : 'already_deleted',
      deleted: {
        dependents: deletedDependent?.value ? 1 : 0,
        phi_vault: phiResult.deletedCount ?? 0,
        records: deletedCounts,
      },
    };

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error('Error deleting dependent:', error);
    return NextResponse.json({ error: 'Failed to delete profile' }, { status: 500 });
  }
}

