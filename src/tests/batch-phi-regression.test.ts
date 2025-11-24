import { beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoPersistenceAdapter } from '../persistence/mongo-persistence.js';
import { createResource, listResource } from '../core/crud.js';
import * as vault from '../core/phi/vault.js';

const originalAnalyzeText = vault._deps.analyzeText;

const mockAnalyzeText = async (text: string) => {
  const results: Array<{ start: number; end: number; entity_type: string; score: number }> = [];

  const addMatch = (needle: string, entity_type: string) => {
    const start = text.indexOf(needle);
    if (start >= 0) {
      results.push({
        start,
        end: start + needle.length,
        entity_type,
        score: 0.99,
      });
    }
  };

  addMatch('John Doe', 'PERSON');
  addMatch('555-123-4567', 'PHONE_NUMBER');

  return results;
};

describe('Batch PHI handling', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let adapter: MongoPersistenceAdapter;

  beforeEach(async () => {
    vault._deps.analyzeText = mockAnalyzeText;
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    adapter = new MongoPersistenceAdapter(client.db('ac130-batch-phi'));
  });

  afterEach(async () => {
    vault._deps.analyzeText = originalAnalyzeText;
    if (client) {
      await client.close();
    }
    if (mongod) {
      await mongod.stop();
    }
  });

  async function createDependent(): Promise<string> {
    const dependentResult = await createResource(adapter, {
      resource_type: 'dependent',
      data: {
        record_identifier: `Test Dep ${Date.now()}`,
      },
    });

    const payload = JSON.parse(dependentResult.content[0].text);
    return payload.dependent_id ?? payload.dependent?.dependent_id;
  }

  it('sanitizes every record when creating batches', async () => {
    const dependentId = await createDependent();

    const result = await createResource(adapter, {
      resource_type: 'visit',
      duplicate_check_confirmed: true,
      data: [
        {
          dependent_id: dependentId,
          reason: 'Follow up with John Doe',
          notes: 'Call John Doe at 555-123-4567',
        },
        {
          dependent_id: dependentId,
          reason: 'Discuss labs with John Doe',
          notes: 'Second note mentioning John Doe',
        },
      ],
    });

    const payload = JSON.parse(result.content[0].text);
    const visits = payload.visits;

    assert.ok(Array.isArray(visits), 'Batch response should include visits array');
    assert.strictEqual(visits.length, 2);

    for (const visit of visits) {
      assert.ok(!visit.reason.includes('John Doe'), 'Reason should be sanitized');
      assert.ok(!visit.notes.includes('John Doe'), 'Notes should be sanitized');
      assert.ok(!visit.notes.includes('555-123-4567'), 'Notes should redact phone numbers');
      assert.ok(
        visit.notes.includes('phi:vault'),
        'Sanitized batch records should include phi:vault references'
      );
    }
  });

  it('redacts phi:vault tokens when listing sanitized records', async () => {
    const dependentId = await createDependent();

    await createResource(adapter, {
      resource_type: 'visit',
      duplicate_check_confirmed: true,
      data: [
        {
          dependent_id: dependentId,
          notes: 'Reach John Doe at 555-123-4567',
        },
      ],
    });

    const listResult = await listResource(adapter, {
      resource_type: 'visit',
      filters: {
        dependent_id: dependentId,
      },
    });

    const payload = JSON.parse(listResult.content[0].text);
    const visit = payload.visits?.[0];

    assert.ok(visit, 'List response should include at least one visit');
    assert.ok(!visit.notes.includes('John Doe'), 'Listed notes should not expose PHI');
    assert.ok(!visit.notes.includes('555-123-4567'), 'Listed notes should redact phone numbers');
    assert.ok(!visit.notes.includes('phi:vault'), 'List responses should replace vault tokens');
  });
});

