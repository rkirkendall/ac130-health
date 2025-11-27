export const DEFAULT_DB_NAME = process.env.WEBAPP_DB_NAME || 'health_record';
export const TEST_DB_NAME = process.env.WEBAPP_TEST_DB_NAME || 'health_record_test';
export const TEST_DB_HEADER = 'x-ac130-use-test-db';

export function selectDbNameFromHeaders(headers?: Headers | HeadersInit): string {
  if (!headers) {
    return DEFAULT_DB_NAME;
  }
  const normalized = headers instanceof Headers ? headers : new Headers(headers);
  return normalized.get(TEST_DB_HEADER) === '1' ? TEST_DB_NAME : DEFAULT_DB_NAME;
}

