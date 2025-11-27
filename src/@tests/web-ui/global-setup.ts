import path from 'node:path';
import type { FullConfig } from '@playwright/test';
import { resetTestDatabase } from './utils/db';

const DEFAULT_SEED =
  process.env.PLAYWRIGHT_SEED || 'src/@tests/llm-smoke/chat-tests/scenario-one/seed.json';

export default async function globalSetup(_config: FullConfig) {
  await resetTestDatabase({ seedPath: path.resolve(DEFAULT_SEED) });
}

