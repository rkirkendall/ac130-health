const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL || 'http://127.0.0.1:3001';
const TEST_DB_HEADER = 'x-ac130-use-test-db';

export interface DependentRecord {
  _id: string;
  dependent_id: string;
  record_identifier: string;
  [key: string]: unknown;
}

export async function listDependents(): Promise<DependentRecord[]> {
  const response = await fetch(`${API_BASE_URL}/api/dependents`, {
    headers: {
      [TEST_DB_HEADER]: '1',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to list dependents: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as DependentRecord[];
  return data ?? [];
}

