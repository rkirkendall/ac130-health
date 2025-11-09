import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { RECORD_TYPES } from '@/lib/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ patientId: string }> }
) {
  try {
    const { patientId } = await params;
    const client = await clientPromise;
    const db = client.db('ac130_health');
    
    const patientObjectId = new ObjectId(patientId);
    
    const counts = await Promise.all(
      RECORD_TYPES.map(async ({ type, label }) => {
        // Try both ObjectId and string format for patient_id
        const countWithObjectId = await db.collection(type).countDocuments({
          patient_id: patientObjectId,
        });
        const countWithString = await db.collection(type).countDocuments({
          patient_id: patientId,
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

