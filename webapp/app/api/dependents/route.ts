import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db('health_record');
    
    const dependents = await db.collection('dependents')
      .find({})
      .sort({ created_at: -1 })
      .toArray();
    
    const sanitized = dependents.map(dependent => ({
      ...dependent,
      _id: dependent._id.toString(),
      dependent_id: dependent._id.toString(),
      phi_vault_id: dependent.phi_vault_id ? dependent.phi_vault_id.toString() : undefined,
    }));
    
    return NextResponse.json(sanitized);
  } catch (error) {
    console.error('Error fetching dependents:', error);
    return NextResponse.json({ error: 'Failed to fetch dependents' }, { status: 500 });
  }
}

