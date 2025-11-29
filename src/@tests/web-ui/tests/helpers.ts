import path from 'node:path';
import { resetTestDatabase } from '../utils/db';

export const SCENARIO_ONE_SEED = path.join(
  'src',
  '@tests',
  'llm-smoke',
  'chat-tests',
  'scenario-one',
  'seed.json'
);

export const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3001/t';

export async function seedScenarioOne() {
  await resetTestDatabase({ seedPath: SCENARIO_ONE_SEED });
}

