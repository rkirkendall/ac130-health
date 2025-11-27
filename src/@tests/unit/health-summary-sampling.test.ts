import { describe, it } from 'node:test';
import assert from 'node:assert';
import type { PersistenceAdapter, ResourcePersistence } from '../../core/persistence.js';
import type { PhiVaultAdapter, PhiVaultEntry } from '../../core/phi/types.js';
import { RESOURCE_REGISTRY } from '../../core/resource-registry.js';
import { __healthSummaryInternals } from '../../core/crud.js';

const {
  buildDependentSnapshot,
  buildHealthSummaryPrompt,
  getSnapshotLimit,
} = __healthSummaryInternals;

type TestSnapshot = Awaited<ReturnType<typeof buildDependentSnapshot>>;

class NoopPhiVaultAdapter implements PhiVaultAdapter {
  async upsertPhiEntries(): Promise<string[]> {
    return [];
  }
  async getUnstructuredPhiVaultEntries(): Promise<any[]> {
    return [];
  }
  async upsertStructuredPhiVault(): Promise<string> {
    return 'phi-vault';
  }
  async getStructuredPhiVault(): Promise<PhiVaultEntry | null> {
    return null;
  }
  async getStructuredPhiVaults(): Promise<Map<string, PhiVaultEntry>> {
    return new Map();
  }
  async getStructuredPhiVaultByDependentId(): Promise<PhiVaultEntry | null> {
    return null;
  }
}

class SnapshotResourcePersistence implements ResourcePersistence {
  constructor(private readonly docsByDependent: Record<string, Record<string, unknown>[]>) {}

  async find(filter: Record<string, unknown>, limit: number): Promise<any[]> {
    const dependentId = filter.dependent_id as string;
    const entries = this.docsByDependent[dependentId] ?? [];
    return entries.slice(0, limit);
  }

  // Unused interface methods for this test suite.
  findById(): Promise<any | null> {
    return Promise.resolve(null);
  }
  findOne(): Promise<any | null> {
    return Promise.resolve(null);
  }
  create(): Promise<any> {
    throw new Error('Not implemented');
  }
  createMany(): Promise<any[]> {
    throw new Error('Not implemented');
  }
  updateById(): Promise<any | null> {
    throw new Error('Not implemented');
  }
  updateOne(): Promise<any | null> {
    throw new Error('Not implemented');
  }
  deleteById(): Promise<any | null> {
    throw new Error('Not implemented');
  }
  toExternal(data: any): Record<string, unknown> {
    return { ...data };
  }
  validateId(): boolean {
    return true;
  }
}

class SnapshotPersistenceAdapter implements PersistenceAdapter {
  private readonly phiVault = new NoopPhiVaultAdapter();

  constructor(
    private readonly store: Record<string, Record<string, Record<string, unknown>[]>>
  ) {}

  forCollection(collectionName: string): ResourcePersistence {
    const collectionDocs = this.store[collectionName] ?? {};
    return new SnapshotResourcePersistence(collectionDocs);
  }

  getPhiVault(): PhiVaultAdapter {
    return this.phiVault;
  }
}

describe('Health summary snapshot limits', () => {
  it('enforces per-resource caps and truncation metadata', async () => {
    const dependentId = 'dep-limit';
    const visitLimit = getSnapshotLimit('visit');
    const visitCollection = RESOURCE_REGISTRY.visit.collectionName;
    const visitRecords = Array.from({ length: visitLimit + 3 }, (_, idx) => ({
      _id: `visit-${idx}`,
      dependent_id: dependentId,
      notes: `Visit ${idx}`,
    }));

    const adapter = new SnapshotPersistenceAdapter({
      [visitCollection]: {
        [dependentId]: visitRecords,
      },
    });

    const snapshot = await buildDependentSnapshot(adapter, dependentId);
    const visitSnapshot = snapshot.resources.visit;

    assert.ok(visitSnapshot, 'Visit snapshot should exist');
    assert.strictEqual(
      visitSnapshot.records.length,
      visitLimit,
      'Snapshot should cap records at configured limit'
    );
    assert.strictEqual(visitSnapshot.truncated, true, 'Truncation flag should be set');
  });

  it('keeps prompt payloads under the configured character budget', () => {
    const dependentId = 'dep-budget';
    const snapshot: TestSnapshot = {
      dependent: { dependent_id: dependentId, record_identifier: 'Unit Test' },
      summaryText: 'Existing baseline summary.',
      resources: {
        visit: {
          records: Array.from({ length: 20 }, (_, idx) => ({
            visit_id: `visit-${idx}`,
            dependent_id: dependentId,
            notes: 'x'.repeat(400),
          })),
          truncated: true,
          limit: getSnapshotLimit('visit'),
        },
        condition: {
          records: [],
          truncated: false,
          limit: getSnapshotLimit('condition'),
        },
      },
    };

    const relevantRecords = Array.from({ length: 15 }, (_, idx) => ({
      visit_id: `visit-new-${idx}`,
      dependent_id: dependentId,
      notes: 'y'.repeat(250),
    }));

    const prompt = buildHealthSummaryPrompt({
      dependentId,
      dependentName: 'Unit Test',
      action: 'update',
      resourceType: 'visit',
      reason: 'Visit details changed',
      relevantRecords,
      snapshot,
    });

    const userMessage = prompt.messages[0]?.content[0]?.text ?? '';
    assert.ok(userMessage.includes('Snapshot Records'), 'Prompt should include snapshot details');
    assert.ok(
      userMessage.includes('<<Context truncated'),
      'Prompt should call out truncated sections to protect token budget'
    );
    assert.ok(
      userMessage.length <= 7000,
      `Prompt should stay under the 7k character budget (received ${userMessage.length})`
    );
  });
});

