import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient, ObjectId } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_MONGO_URI = process.env.LLM_SMOKE_MONGO_URI || 'mongodb://127.0.0.1:27017';
const DEFAULT_DB_NAME =
  process.env.WEBAPP_TEST_DB_NAME || process.env.LLM_SMOKE_DB_NAME || 'health_record_test';
const REPO_ROOT = path.resolve(__dirname, '../../../..');

export interface ResetOptions {
  seedPath?: string;
}

export async function resetTestDatabase(options?: ResetOptions) {
  const client = new MongoClient(DEFAULT_MONGO_URI);
  await client.connect();
  try {
    const db = client.db(DEFAULT_DB_NAME);
    await db.dropDatabase();

    if (options?.seedPath) {
      const resolvedSeed = path.isAbsolute(options.seedPath)
        ? options.seedPath
        : path.join(REPO_ROOT, options.seedPath);
      const raw = await fs.readFile(resolvedSeed, 'utf-8');
      const payload = JSON.parse(raw) as Record<string, any[]>;
      for (const [collectionName, docs] of Object.entries(payload)) {
        if (!Array.isArray(docs) || docs.length === 0) {
          continue;
        }
        const normalized = docs.map(doc => {
          const copy: Record<string, any> = structuredClone(doc);
          if (typeof copy._id === 'string' && ObjectId.isValid(copy._id)) {
            copy._id = new ObjectId(copy._id);
          }
          return copy;
        });
        await db.collection(collectionName).insertMany(normalized);
      }
    }
  } finally {
    await client.close();
  }
}

