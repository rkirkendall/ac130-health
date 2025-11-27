import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { selectDbNameFromHeaders } from '@/lib/db-config';

const toTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const sanitizeDependent = (dependent: Record<string, any>) => {
  const { external_ref, ...rest } = dependent;
  return {
    ...rest,
    _id: dependent._id?.toString(),
    dependent_id: dependent._id?.toString(),
    phi_vault_id: dependent.phi_vault_id ? dependent.phi_vault_id.toString() : undefined,
    has_phi: Boolean(dependent.phi_vault_id),
  };
};

const normalizeNestedStrings = (entries: Record<string, unknown>) => {
  const normalized: Record<string, string> = {};
  Object.entries(entries).forEach(([key, value]) => {
    const trimmed = toTrimmedString(value);
    if (trimmed) {
      normalized[key] = trimmed;
    }
  });
  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

const normalizePhiPayload = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidate = payload as Record<string, any>;
  const phi: Record<string, any> = {};

  const legalNameInput = candidate.legal_name;
  if (legalNameInput && typeof legalNameInput === 'object') {
    const legalName = normalizeNestedStrings({
      given: legalNameInput.given,
      family: legalNameInput.family,
    });
    const text = toTrimmedString(legalNameInput.text);
    if (legalName || text) {
      phi.legal_name = text
        ? { text }
        : legalName;
    }
  }

  const relationshipNote = toTrimmedString(candidate.relationship_note);
  if (relationshipNote) {
    phi.relationship_note = relationshipNote;
  }

  const fullDob = toTrimmedString(candidate.full_dob);
  if (fullDob) {
    phi.full_dob = fullDob;
  }

  const sex = toTrimmedString(candidate.sex)?.toLowerCase();
  if (sex === 'male' || sex === 'female') {
    phi.sex = sex;
  }

  const birthYear = candidate.birth_year;
  if (typeof birthYear === 'number' && Number.isFinite(birthYear)) {
    phi.birth_year = Math.trunc(birthYear);
  } else if (typeof birthYear === 'string') {
    const parsed = Number(birthYear);
    if (!Number.isNaN(parsed)) {
      phi.birth_year = Math.trunc(parsed);
    }
  }

  const contact = candidate.contact;
  if (contact && typeof contact === 'object') {
    const normalizedContact = normalizeNestedStrings({
      phone: contact.phone,
      email: contact.email,
    });
    if (normalizedContact) {
      phi.contact = normalizedContact;
    }
  }

  const address = candidate.address;
  if (address && typeof address === 'object') {
    const normalizedAddress = normalizeNestedStrings({
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      postal_code: address.postal_code,
      country: address.country,
    });
    if (normalizedAddress) {
      phi.address = normalizedAddress;
    }
  }

  return Object.keys(phi).length > 0 ? phi : undefined;
};

export async function GET(request: Request) {
  try {
    const client = await clientPromise;
    const db = client.db(selectDbNameFromHeaders(request.headers));

    const dependents = await db
      .collection('dependents')
      .find({})
      .sort({ created_at: -1 })
      .toArray();

    return NextResponse.json(dependents.map(sanitizeDependent));
  } catch (error) {
    console.error('Error fetching dependents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dependents' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const recordIdentifier = toTrimmedString(body.record_identifier);

    if (!recordIdentifier) {
      return NextResponse.json(
        { error: 'record_identifier is required' },
        { status: 400 }
      );
    }

    const phiPayload = normalizePhiPayload(body.phi);

    const client = await clientPromise;
    const db = client.db(selectDbNameFromHeaders(request.headers));
    const now = new Date();

    const dependentDoc: Record<string, any> = {
      record_identifier: recordIdentifier,
      archived: false,
      created_at: now,
      updated_at: now,
      created_by: 'webapp',
      updated_by: 'webapp',
    };

    const insertResult = await db.collection('dependents').insertOne(dependentDoc);
    const dependentId = insertResult.insertedId;

    if (phiPayload) {
      const phiResult = await db.collection('phi_vault').insertOne({
        dependent_id: dependentId,
        ...phiPayload,
        created_at: now,
        updated_at: now,
        created_by: 'webapp',
        updated_by: 'webapp',
      });

      await db.collection('dependents').updateOne(
        { _id: dependentId },
        { $set: { phi_vault_id: phiResult.insertedId } }
      );
    }

    const insertedDependent = await db.collection('dependents').findOne({
      _id: dependentId,
    });

    if (!insertedDependent) {
      throw new Error('Failed to load inserted dependent');
    }

    return NextResponse.json(sanitizeDependent(insertedDependent), { status: 201 });
  } catch (error) {
    console.error('Error creating dependent:', error);
    return NextResponse.json(
      { error: 'Failed to create dependent' },
      { status: 500 }
    );
  }
}

