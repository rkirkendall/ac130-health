import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db('ac130_health');
    
    const patients = await db.collection('patients')
      .find({})
      .sort({ created_at: -1 })
      .toArray();
    
    const patientsWithIds = patients.map(patient => ({
      ...patient,
      _id: patient._id.toString(),
    }));
    
    return NextResponse.json(patientsWithIds);
  } catch (error) {
    console.error('Error fetching patients:', error);
    return NextResponse.json({ error: 'Failed to fetch patients' }, { status: 500 });
  }
}

