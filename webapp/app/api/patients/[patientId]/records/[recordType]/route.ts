import type { NextRequest } from 'next/server';
import { GET as DependentRecordsGET } from '@/app/api/dependents/[dependentId]/records/[recordType]/route';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ patientId: string; recordType: string }> }
) {
  const { patientId, recordType } = await context.params;
  return DependentRecordsGET(request, {
    params: Promise.resolve({ dependentId: patientId, recordType }),
  });
}

