import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dependentId: string }> }
) {
  try {
    const { dependentId } = await params;
    const client = await clientPromise;
    const db = client.db('health_record');

    const dependentObjectId = new ObjectId(dependentId);
    const phiEntry = await db.collection('phi_vault').findOne({
      dependent_id: dependentObjectId,
    });

    if (!phiEntry) {
      return NextResponse.json({ has_phi: false });
    }

    return NextResponse.json({
      ...phiEntry,
      _id: phiEntry._id.toString(),
      dependent_id: phiEntry.dependent_id?.toString
        ? phiEntry.dependent_id.toString()
        : phiEntry.dependent_id,
    });
  } catch (error) {
    console.error('Error fetching PHI vault entry:', error);
    return NextResponse.json({ error: 'Failed to fetch PHI data' }, { status: 500 });
  }
}

