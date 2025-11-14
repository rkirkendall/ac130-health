import type { NextRequest } from 'next/server';
import { GET as DependentCountsGET } from '@/app/api/dependents/[dependentId]/counts/route';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ patientId: string }> }
) {
  const { patientId } = await context.params;
  return DependentCountsGET(request, {
    params: Promise.resolve({ dependentId: patientId }),
  });
}

