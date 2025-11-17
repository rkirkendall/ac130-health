import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

const toDbDependentId = (value: string) => {
  if (ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return value;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dependentId: string }> }
) {
  try {
    const { dependentId } = await params;
    const client = await clientPromise;
    const db = client.db('health_record');

    const dependentKey = toDbDependentId(dependentId);
    const phiEntry = await db.collection('phi_vault').findOne({
      dependent_id: dependentKey,
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

const serializePhiEntry = (entry: Record<string, any>) => ({
  ...entry,
  _id: entry._id?.toString(),
  dependent_id: entry.dependent_id?.toString
    ? entry.dependent_id.toString()
    : entry.dependent_id,
});

const buildPhiUpdate = (field: string, value: string): Record<string, unknown> | null => {
  switch (field) {
    case 'legal_name':
      return { legal_name: { text: value } };
    case 'relationship_note':
      return { relationship_note: value };
    case 'full_dob':
      return { full_dob: value };
    case 'birth_year': {
      const parsed = Number(value);
      return { birth_year: Number.isNaN(parsed) ? value : parsed };
    }
    case 'sex': {
      const normalized = value.toLowerCase();
      if (normalized === 'male' || normalized === 'female') {
        return { sex: normalized };
      }
      return null;
    }
    case 'contact_phone':
      return { 'contact.phone': value };
    case 'contact_email':
      return { 'contact.email': value };
    case 'address_line1':
      return { 'address.line1': value };
    default:
      return null;
  }
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ dependentId: string }> }
) {
  try {
    const { dependentId } = await params;
    const body = await request.json();
    const field = String(body.field ?? '').trim();
    const value = String(body.value ?? '').trim();

    if (!field || !value) {
      return NextResponse.json(
        { error: 'Field and value are required' },
        { status: 400 }
      );
    }

    const fieldUpdate = buildPhiUpdate(field, value);
    if (!fieldUpdate) {
      return NextResponse.json(
        { error: 'Unsupported PHI field' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('health_record');
    const dependentKey = toDbDependentId(dependentId);

    const phiCollection = db.collection('phi_vault');

    const result = await phiCollection.findOneAndUpdate(
        { dependent_id: dependentKey },
        {
          $set: {
            ...fieldUpdate,
            dependent_id: dependentKey,
            updated_at: new Date(),
          },
          $setOnInsert: {
            created_at: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after' }
      );

    let phiEntry = result?.value ?? null;
    if (!phiEntry) {
      phiEntry = await phiCollection.findOne({ dependent_id: dependentKey });
      if (!phiEntry) {
        throw new Error('Failed to upsert PHI entry');
      }
    }

    if (!(dependentKey instanceof ObjectId)) {
      throw new Error('Dependent ID must be a valid ObjectId');
    }

    await db.collection('dependents').updateOne(
      { _id: dependentKey },
      { $set: { phi_vault_id: phiEntry._id } }
    );

    return NextResponse.json(serializePhiEntry(phiEntry));
  } catch (error) {
    console.error('Error saving PHI data:', error);
    return NextResponse.json(
      { error: 'Failed to save PHI data' },
      { status: 500 }
    );
  }
}

