import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { RECORD_TYPES } from '@/lib/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dependentId: string }> }
) {
  try {
    const { dependentId } = await params;
    const client = await clientPromise;
    const db = client.db('health_record');
    
    const dependentObjectId = new ObjectId(dependentId);
    
    const counts = await Promise.all(
      RECORD_TYPES.map(async ({ type, label }) => {
        const countWithObjectId = await db.collection(type).countDocuments({
          dependent_id: dependentObjectId,
        });
        const countWithString = await db.collection(type).countDocuments({
          dependent_id: dependentId,
        });
        const count = Math.max(countWithObjectId, countWithString);
        return { type, label, count };
      })
    );
    
    return NextResponse.json(counts);
  } catch (error) {
    console.error('Error fetching record counts:', error);
    return NextResponse.json({ error: 'Failed to fetch record counts' }, { status: 500 });
  }
}

