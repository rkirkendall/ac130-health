import { ObjectId } from 'mongodb';

function hasAnyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some(hasAnyValue);
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasAnyValue);
  }

  return true;
}

export function hasPhiPayload(phi: Record<string, unknown> | undefined): boolean {
  if (!phi || typeof phi !== 'object') {
    return false;
  }

  return hasAnyValue(phi);
}

export function separatePhiPayload(
  record: Record<string, unknown>
): {
  sanitized: Record<string, unknown>;
  phiPayload?: Record<string, unknown>;
} {
  if (!record || typeof record !== 'object' || !Object.prototype.hasOwnProperty.call(record, 'phi')) {
    return { sanitized: record };
  }

  const { phi, ...rest } = record as Record<string, unknown> & {
    phi?: Record<string, unknown>;
  };

  if (phi && hasPhiPayload(phi)) {
    return {
      sanitized: rest,
      phiPayload: phi,
    };
  }

  return { sanitized: rest };
}
