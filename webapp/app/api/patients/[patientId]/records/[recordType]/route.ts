import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ patientId: string; recordType: string }> }
) {
  try {
    const { patientId, recordType } = await params;
    const client = await clientPromise;
    const db = client.db('health_record');
    
    const patientObjectId = new ObjectId(patientId);
    
    // Find records with ObjectId patient_id (all records should now use ObjectId)
    const records = await db.collection(recordType)
      .find({ patient_id: patientObjectId })
      .sort({ created_at: -1 })
      .toArray();
    
    const recordsWithIds = records.map(record => ({
      ...record,
      _id: record._id.toString(),
      patient_id: record.patient_id?.toString ? record.patient_id.toString() : record.patient_id,
      provider_id: record.provider_id?.toString ? record.provider_id.toString() : record.provider_id,
      prescriber_id: record.prescriber_id?.toString ? record.prescriber_id.toString() : record.prescriber_id,
      ordered_by: record.ordered_by?.toString ? record.ordered_by.toString() : record.ordered_by,
      diagnosed_by: record.diagnosed_by?.toString ? record.diagnosed_by.toString() : record.diagnosed_by,
      verified_by: record.verified_by?.toString ? record.verified_by.toString() : record.verified_by,
      recorded_by: record.recorded_by?.toString ? record.recorded_by.toString() : record.recorded_by,
      performed_by: record.performed_by?.toString ? record.performed_by.toString() : record.performed_by,
      administered_by: record.administered_by?.toString ? record.administered_by.toString() : record.administered_by,
    }));
    
    return NextResponse.json(recordsWithIds);
  } catch (error) {
    console.error('Error fetching records:', error);
    return NextResponse.json({ error: 'Failed to fetch records' }, { status: 500 });
  }
}

