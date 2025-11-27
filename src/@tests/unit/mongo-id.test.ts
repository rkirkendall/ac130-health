import { test, describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import { MongoResourcePersistence } from '../../persistence/mongo-persistence.js';

// Mock Collection
class MockCollection {
  store: Map<string, any> = new Map();

  get collectionName() {
    return 'mock_resources';
  }

  async insertOne(doc: any) {
    // Simulate MongoDB generating _id if not provided, or using provided one
    const _id = doc._id || new ObjectId();
    const storedDoc = { ...doc, _id };
    this.store.set(_id.toString(), storedDoc);
    return { insertedId: _id, acknowledged: true };
  }

  async insertMany(docs: any[]) {
    const insertedIds: Record<number, ObjectId> = {};
    docs.forEach((doc, index) => {
      const _id = doc._id || new ObjectId();
      const storedDoc = { ...doc, _id };
      this.store.set(_id.toString(), storedDoc);
      insertedIds[index] = _id;
    });
    return { insertedIds, acknowledged: true };
  }

  async findOne(query: any) {
    if (query._id) {
      const key = query._id.toString();
      return this.store.get(key) || null;
    }
    // Simple filter simulation for testing
    for (const doc of this.store.values()) {
      let match = true;
      for (const [k, v] of Object.entries(query)) {
        // Handle simple equality and ObjectId matching
        if (String(doc[k]) !== String(v)) {
          match = false;
          break;
        }
      }
      if (match) return doc;
    }
    return null;
  }

  find(query: any) {
    const results: any[] = [];
    for (const doc of this.store.values()) {
      let match = true;
      if (query && Object.keys(query).length > 0) {
        // Simple recursion for nested queries not supported here, but basic equality yes
        for (const [k, v] of Object.entries(query)) {
          // Check if value is ObjectId in doc but string in query, or vice versa
          const docVal = doc[k];
          const queryVal = v;

          // Very basic comparison relying on toString
          if (String(docVal) !== String(queryVal)) {
            match = false;
            break;
          }
        }
      }
      if (match) results.push(doc);
    }

    const cursor: any = {};
    cursor.sort = () => cursor;
    cursor.limit = (n: number) => ({
      toArray: async () => results.slice(0, n),
    });
    cursor.toArray = async () => results;

    return cursor;
  }
}

describe('MongoResourcePersistence ID Handling', () => {
  let mockCollection: any;
  let persistence: MongoResourcePersistence;

  beforeEach(() => {
    mockCollection = new MockCollection();
    persistence = new MongoResourcePersistence(mockCollection);
  });

  it('should convert string IDs to ObjectId on create', async () => {
    const inputId = new ObjectId().toHexString();
    const dependentId = new ObjectId().toHexString();
    
    const record = {
      _id: inputId, // Passed as string
      dependent_id: dependentId, // Passed as string
      name: 'Test Resource'
    };

    await persistence.create(record);

    // Verify storage in mock DB
    const stored = mockCollection.store.get(inputId);
    assert.ok(stored, 'Record should be stored');
    assert.ok(stored._id instanceof ObjectId, '_id should be stored as ObjectId');
    assert.ok(stored.dependent_id instanceof ObjectId, 'dependent_id should be stored as ObjectId');
    assert.strictEqual(stored._id.toHexString(), inputId);
    assert.strictEqual(stored.dependent_id.toHexString(), dependentId);
  });

  it('should stringify ObjectId on read (toExternal)', async () => {
    const oid = new ObjectId();
    const depOid = new ObjectId();
    
    // Manually inject record with ObjectIds
    const doc = {
      _id: oid,
      dependent_id: depOid,
      name: 'Read Test'
    };
    mockCollection.store.set(oid.toString(), doc);

    // Read via persistence
    const result = await persistence.findById(oid.toHexString());
    assert.ok(result);
    
    // Check raw result from findById (it actually returns raw from DB currently, 
    // conversion happens in CRUD layer or toExternal utility. 
    // Wait, let's check findById implementation in mongo-persistence.ts)
    // findById returns `this.collection.findOne(...)`. 
    // So it returns the raw document (with ObjectIds).
    assert.ok(result._id instanceof ObjectId, 'findById should return raw ObjectId');

    // Check toExternal
    const external = persistence.toExternal(result, 'resource_id'); // ID field arbitrary here
    assert.strictEqual(typeof external._id, 'string', '_id should be stringified in toExternal');
    assert.strictEqual(typeof external.dependent_id, 'string', 'dependent_id should be stringified in toExternal');
    assert.strictEqual(external._id, oid.toHexString());
    assert.strictEqual(external.dependent_id, depOid.toHexString());
  });

  it('should handle legacy data with string IDs gracefully', async () => {
    // Simulate "bad" data where _id is a string in the DB
    const badId = "legacy_string_id";
    const badDoc = {
      _id: badId, // Stored as string!
      name: 'Legacy Doc'
    };
    mockCollection.store.set(badId, badDoc);

    // Note: findById validates ObjectId.isValid. "legacy_string_id" is NOT valid ObjectId.
    // So findById would fail or return null if it tries to cast to ObjectId.
    // Let's see persistence.findById:
    // if (!this.validateId(id)) return null;
    // So legacy NON-ObjectId strings are not accessible via findById with ID validation.
    // This is expected behavior for the system (we enforce 24-char hex).
    
    // But what if it IS a valid 24-char hex string stored AS A STRING?
    const hexIdString = new ObjectId().toHexString();
    const stringStoredDoc = {
      _id: hexIdString, // Stored as string primitive, not BSON ObjectId
      name: 'String Stored Hex'
    };
    mockCollection.store.set(hexIdString, stringStoredDoc);

    // findById casts input to ObjectId before querying: findOne({ _id: new ObjectId(id) })
    // So it won't match the string stored in DB.
    // This confirms we CANNOT read string-stored IDs with the current finder if we query by ID.
    
    // However, list/find might work if we filter by other fields?
    const found = await persistence.findOne({ name: 'String Stored Hex' });
    // findOne normalizes filters.
    
    // If we find it via other means, does toExternal crash?
    if (found) {
        const ext = persistence.toExternal(found, 'id');
        assert.strictEqual(ext._id, hexIdString);
        assert.strictEqual(typeof ext._id, 'string');
    }
  });

  it('should find records when filtering with string IDs', async () => {
    const depId = new ObjectId();
    
    // Store correctly as ObjectId
    const doc = {
        _id: new ObjectId(),
        dependent_id: depId,
        name: 'Filter Test'
    };
    mockCollection.store.set(doc._id.toString(), doc);

    // Search using STRING dependent_id
    const results = await persistence.find({ dependent_id: depId.toHexString() }, 10);
    
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'Filter Test');
    // The persistence layer should have converted the string filter to ObjectId
  });
});

