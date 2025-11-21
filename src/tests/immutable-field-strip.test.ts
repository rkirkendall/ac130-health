
import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { updateResource } from '../core/crud.js';
import { PersistenceAdapter } from '../core/persistence.js';
import { ObjectId } from 'mongodb';

interface StubbedPersistenceOverrides {
  find?: ReturnType<typeof mock.fn>;
  findById?: ReturnType<typeof mock.fn>;
  findOne?: ReturnType<typeof mock.fn>;
  updateById?: ReturnType<typeof mock.fn>;
  toExternal?: ReturnType<typeof mock.fn>;
  validateId?: ReturnType<typeof mock.fn>;
}

function createStubPersistence(
  overrides: Partial<StubbedPersistenceOverrides> = {}
): any {
  return {
    find: overrides.find ?? mock.fn(async () => []),
    findById: overrides.findById ?? mock.fn(async () => null),
    findOne: overrides.findOne ?? mock.fn(async () => null),
    create: mock.fn(async () => ({})),
    createMany: mock.fn(async () => []),
    updateById: overrides.updateById ?? mock.fn(async () => null),
    updateOne: mock.fn(async () => null),
    deleteById: mock.fn(async () => null),
    toExternal:
      overrides.toExternal ??
      mock.fn((doc: Record<string, unknown>, idField: string) => {
        const sourceId =
          (doc?.[idField] as string | undefined) ??
          (doc?._id instanceof ObjectId ? doc._id.toHexString() : undefined);
        return {
          ...doc,
          [idField]: sourceId,
        };
      }),
    validateId:
      overrides.validateId ?? mock.fn((value: string) => ObjectId.isValid(value)),
  };
}

describe('updateResource immutable field stripping', () => {
  it('should strip immutable fields from update data', async () => {
    const resourceType = 'visit';
    const id = new ObjectId().toHexString();
    const dependentId = new ObjectId().toHexString();

    const visitRecord = {
      _id: new ObjectId(id),
      dependent_id: new ObjectId(dependentId),
      type: 'office',
      status: 'completed',
    };

    const visitPersistence = createStubPersistence({
      findById: mock.fn(async () => visitRecord),
      updateById: mock.fn(async () => ({
        ...visitRecord,
        status: 'updated',
      })),
      toExternal: mock.fn((doc: Record<string, unknown>, idField: string) => ({
        ...doc,
        [idField]:
          (doc?._id instanceof ObjectId ? doc._id.toHexString() : doc?.[idField]) ??
          id,
      })),
    });

    const dependentPersistence = createStubPersistence({
      findById: mock.fn(async () => ({
        _id: new ObjectId(dependentId),
        record_identifier: 'A-123',
      })),
      toExternal: mock.fn(
        (doc: Record<string, unknown>, idField: string) => ({
          record_identifier: doc.record_identifier,
          [idField]:
            (doc?._id instanceof ObjectId
              ? doc._id.toHexString()
              : doc?.[idField]) ?? dependentId,
        })
      ),
    });

    const summaryPersistence = createStubPersistence({
      findOne: mock.fn(async () => null),
    });

    const defaultPersistence = createStubPersistence();

    const adapter: PersistenceAdapter = {
      forCollection: (collectionName: string) => {
        switch (collectionName) {
          case 'visits':
            return visitPersistence as any;
          case 'dependents':
            return dependentPersistence as any;
          case 'active_summaries':
            return summaryPersistence as any;
          default:
            return defaultPersistence as any;
        }
      },
      getDb: () => ({}) as any,
    };

    const updateData = {
      resource_type: resourceType,
      id,
      data: {
        type: 'office',
        _id: id,
        dependent_id: dependentId,
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
        created_by: 'user',
        updated_by: 'user',
        visit_id: id,
      },
    };

    await updateResource(adapter, updateData);

    assert.strictEqual(visitPersistence.updateById.mock.callCount(), 1);
    const callArgs = visitPersistence.updateById.mock.calls[0].arguments;
    const updateArg = callArgs[1] as { set: Record<string, any> };
    const setOp = updateArg.set;

    assert.ok(setOp);
    assert.strictEqual(setOp.type, 'office');
    assert.strictEqual('_id' in setOp, false);
    assert.strictEqual('dependent_id' in setOp, false);
    assert.strictEqual('created_at' in setOp, false);
    assert.strictEqual('created_by' in setOp, false);
    assert.ok('updated_at' in setOp);
    assert.strictEqual(setOp.updated_by, 'mcp');
    assert.strictEqual('visit_id' in setOp, false);
  });
});
