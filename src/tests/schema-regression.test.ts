
import { test, describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { updateResource } from '../core/crud.js';
import { RESOURCE_REGISTRY } from '../core/resource-registry.js';
import { UpdateVisitSchema } from '../core/types.js';

// Mock Persistence Adapter
class MockPersistenceAdapter {
  store: Map<string, any> = new Map();
  collectionName: string = '';

  constructor(store: Map<string, any> = new Map()) {
      this.store = store;
  }

  forCollection(name: string) {
    const adapter = new MockPersistenceAdapter(this.store);
    adapter.collectionName = name;
    return adapter;
  }

  validateId(id: string) {
    return ObjectId.isValid(id);
  }

  async findById(id: string) {
    return this.store.get(id) || null;
  }

  async updateById(id: string, update: any) {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updates = update.set || update;
    const updated = { ...existing, ...updates };
    this.store.set(id, updated);
    return updated;
  }
  
  async findOne(query: any) { return null; }
  async find(query: any, limit?: number) { return []; }
  toExternal(record: any, idField: string) {
    if (!record) return null;
    return { ...record, [idField]: record._id.toString() };
  }
  getDb() { return null; }
}

describe('Visit Update Regression Test', () => {
  let adapter: any;
  let store: Map<string, any>;

  beforeEach(() => {
    store = new Map();
    adapter = new MockPersistenceAdapter(store);
  });

  it('should verify UpdateVisitSchema IS strict', () => {
      try {
          UpdateVisitSchema.parse({ visit_id: "123", garbage: "456" });
          assert.fail("Schema should have thrown on garbage");
      } catch (e: any) {
          assert.ok(e.errors || e.issues, "Should be Zod error");
          // assert.ok(e.message.includes("Unrecognized key"), "Should be unrecognized key error");
      }
  });

  it('should allow updating a visit with valid fields', async () => {
    const visitId = new ObjectId();
    const dependentId = new ObjectId();
    const visit = {
      _id: visitId,
      dependent_id: dependentId,
      date: '2023-01-01',
      type: 'office',
      reason: 'Checkup'
    };
    store.set(visitId.toString(), visit);
    store.set(dependentId.toString(), { _id: dependentId, record_identifier: 'Test Patient' });

    const updateData = { reason: 'Follow-up' };
    const result = await updateResource(adapter, {
      resource_type: 'visit',
      id: visitId.toString(),
      data: updateData
    });
    const updated = JSON.parse(result.content[0].text);
    assert.strictEqual(updated.reason, 'Follow-up');
  });

  it('should FAIL if garbage fields are provided via updateResource (Strict check)', async () => {
    const visitId = new ObjectId();
    const dependentId = new ObjectId();
    const visit = { _id: visitId, dependent_id: dependentId, date: '2023-01-01', type: 'office', reason: 'Checkup' };
    store.set(visitId.toString(), visit);

    const updateData = { reason: 'Follow-up', garbage_key_xyz: 'garbage' };

    try {
        await updateResource(adapter, {
          resource_type: 'visit',
          id: visitId.toString(),
          data: updateData
        });
        assert.fail("updateResource should have thrown validation error for garbage key");
    } catch (e: any) {
        assert.ok(e.message.includes("Validation failed"), "Error should be validation failure");
    }
  });

  it('should allow updating a visit even if extra fields (dependent_id) are provided (The Fix)', async () => {
    const visitId = new ObjectId();
    const dependentId = new ObjectId();
    const visit = { _id: visitId, dependent_id: dependentId, date: '2023-01-01', type: 'office', reason: 'Checkup' };
    store.set(visitId.toString(), visit);

    // dependent_id is NOT in UpdateVisitSchema, so it should FAIL unless we strip it in updateResource
    const updateData = { reason: 'Follow-up', dependent_id: dependentId.toString() };

    try {
        await updateResource(adapter, {
          resource_type: 'visit',
          id: visitId.toString(),
          data: updateData
        });
    } catch (e: any) {
        // If this throws, it means strict mode is ON and fix is NOT applied.
        throw e;
    }
  });
});
