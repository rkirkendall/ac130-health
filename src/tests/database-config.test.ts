import { beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Database } from '../db.js';

describe('Database configuration', () => {
  let mongod: MongoMemoryServer;
  let mongoUri: string;
  let originalDbNameEnv: string | undefined;

  beforeEach(async () => {
    originalDbNameEnv = process.env.HEALTH_RECORD_DB_NAME;
    mongod = await MongoMemoryServer.create();
    mongoUri = mongod.getUri();
  });

  afterEach(async () => {
    process.env.HEALTH_RECORD_DB_NAME = originalDbNameEnv;
    if (mongod) {
      await mongod.stop();
    }
  });

  it('prefers the constructor-provided database name', async () => {
    process.env.HEALTH_RECORD_DB_NAME = 'env_db_should_not_be_used';
    const db = new Database(mongoUri, 'custom_db_name');

    await db.connect();
    try {
      assert.strictEqual(db.getDb().databaseName, 'custom_db_name');
    } finally {
      await db.disconnect();
    }
  });

  it('falls back to the environment variable when no dbName is provided', async () => {
    process.env.HEALTH_RECORD_DB_NAME = 'env_fallback_db';
    const db = new Database(mongoUri);

    await db.connect();
    try {
      assert.strictEqual(db.getDb().databaseName, 'env_fallback_db');
    } finally {
      await db.disconnect();
    }
  });
});

