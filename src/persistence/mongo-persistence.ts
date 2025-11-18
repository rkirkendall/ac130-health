import { Collection, Db, ObjectId } from 'mongodb';
import type {
  PersistenceAdapter,
  Query,
  ResourcePersistence,
  UpdateOperations,
  UpdateOptions,
} from './types.js';

const OBJECT_ID_FIELDS = new Set<string>([
  '_id',
  'dependent_id',
  'phi_vault_id',
  'provider_id',
  'visit_id',
  'prescription_id',
  'lab_id',
  'treatment_id',
  'condition_id',
  'allergy_id',
  'immunization_id',
  'vitals_id',
  'procedure_id',
  'imaging_id',
  'insurance_id',
  'ordered_by',
  'prescriber_id',
  'diagnosed_by',
  'verified_by',
  'administered_by',
  'recorded_by',
  'performed_by',
]);

function convertValueForIdField(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(convertValueForIdField);
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const nested: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      nested[key] = convertValueForIdField(nestedValue);
    }
    return nested;
  }

  if (typeof value === 'string' && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }

  return value;
}

function convertObjectIdFilters(
  query: Record<string, unknown>,
  objectIdFields: Set<string>
): Record<string, unknown> {
  const converted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    if (objectIdFields.has(key)) {
      converted[key] = convertValueForIdField(value);
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      converted[key] = convertObjectIdFilters(value as Record<string, unknown>, objectIdFields);
      continue;
    }

    converted[key] = value;
  }

  return converted;

}

class MongoResourcePersistence implements ResourcePersistence {
  private readonly objectIdFields: Set<string>;

  constructor(private readonly collection: Collection<Record<string, unknown>>) {
    this.objectIdFields = OBJECT_ID_FIELDS;
  }

  get collectionName(): string {
    return this.collection.collectionName;
  }

  validateId(id: string): boolean {
    return ObjectId.isValid(id);
  }

  async create(record: Record<string, unknown>): Promise<Record<string, unknown>> {
    const converted = this.convertCreateValues(record);
    const result = await this.collection.insertOne(converted);
    if (!result.insertedId) {
      throw new Error(`Failed to insert document into ${this.collectionName}`);
    }

    const inserted = await this.collection.findOne({ _id: result.insertedId } as Query);
    if (!inserted) {
      return { ...converted, _id: result.insertedId };
    }
    return inserted;
  }

  async createMany(
    records: Record<string, unknown>[]
  ): Promise<Record<string, unknown>[]> {
    if (records.length === 0) {
      return [];
    }

    const converted = records.map(record => this.convertCreateValues(record));
    const result = await this.collection.insertMany(converted);
    const insertedIds = Object.values(result.insertedIds ?? {});

    if (insertedIds.length === 0) {
      return [];
    }

    const inserted = await this.collection
      .find({ _id: { $in: insertedIds } } as Query)
      .toArray();

    const byId = new Map<string, Record<string, unknown>>();
    inserted.forEach((doc) => {
      const key = doc._id instanceof ObjectId ? doc._id.toString() : String(doc._id);
      byId.set(key, doc);
    });

    return insertedIds
      .map((id) => {
        const key = id instanceof ObjectId ? id.toString() : String(id);
        return byId.get(key);
      })
      .filter((doc): doc is Record<string, unknown> => Boolean(doc));
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    if (!this.validateId(id)) {
      return null;
    }

    return this.collection.findOne({ _id: new ObjectId(id) } as Query);
  }

  async findOne(filter: Query): Promise<Record<string, unknown> | null> {
    const normalized = this.normalizeFilter(filter);
    return this.collection.findOne(normalized);
  }

  async find(filter: Query, limit: number): Promise<Record<string, unknown>[]> {
    const normalized = this.normalizeFilter(filter);
    return this.collection.find(normalized).limit(limit).toArray();
  }

  async updateById(
    id: string,
    operations: UpdateOperations,
    options?: UpdateOptions
  ): Promise<Record<string, unknown> | null> {
    if (!this.validateId(id)) {
      return null;
    }

    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id) } as Query,
      this.buildUpdateDoc(operations),
      {
        upsert: options?.upsert ?? false,
        returnDocument: options?.returnDocument ?? 'after',
      }
    );

    return (result as any)?.value ?? (result as any) ?? null;
  }

  async updateOne(
    filter: Query,
    operations: UpdateOperations,
    options?: UpdateOptions
  ): Promise<Record<string, unknown> | null> {
    const normalized = this.normalizeFilter(filter);
    const result = await this.collection.findOneAndUpdate(
      normalized,
      this.buildUpdateDoc(operations),
      {
        upsert: options?.upsert ?? false,
        returnDocument: options?.returnDocument ?? 'after',
      }
    );

    return (result as any)?.value ?? (result as any) ?? null;
  }

  async deleteById(id: string): Promise<Record<string, unknown> | null> {
    if (!this.validateId(id)) {
      return null;
    }

    const result = await this.collection.findOneAndDelete({ _id: new ObjectId(id) } as Query);
    return (result as any)?.value ?? (result as any) ?? null;
  }

  normalizeFilter(filter: Query): Query {
    if (!filter || typeof filter !== 'object') {
      return {};
    }

    return convertObjectIdFilters(filter, this.objectIdFields);
  }

  toExternal(record: Record<string, unknown>, idField: string): Record<string, unknown> {
    const internalId = record?._id;
    const stringId =
      typeof internalId === 'string'
        ? internalId
        : internalId instanceof ObjectId
        ? internalId.toString()
        : internalId !== undefined
        ? String(internalId)
        : undefined;

    if (!stringId) {
      return { ...record };
    }

    return {
      ...record,
      _id: stringId,
      [idField]: stringId,
    };
  }

  private buildUpdateDoc(operations: UpdateOperations) {
    const updateDoc: Record<string, unknown> = {};
    if (operations.set && Object.keys(operations.set).length > 0) {
      updateDoc.$set = this.convertUpdateValues(operations.set);
    }
    if (operations.setOnInsert && Object.keys(operations.setOnInsert).length > 0) {
      updateDoc.$setOnInsert = this.convertUpdateValues(operations.setOnInsert);
    }
    if (Object.keys(updateDoc).length === 0) {
      throw new Error('No update operations provided');
    }
    return updateDoc;
  }

  private convertCreateValues(values: Record<string, unknown>): Record<string, unknown> {
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) {
        continue;
      }

      if (this.objectIdFields.has(key)) {
        converted[key] = convertValueForIdField(value);
      } else {
        converted[key] = value;
      }
    }
    return converted;
  }

  private convertUpdateValues(values: Record<string, unknown>): Record<string, unknown> {
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) {
        continue;
      }

      if (this.objectIdFields.has(key)) {
        converted[key] = convertValueForIdField(value);
      } else {
        converted[key] = value;
      }
    }
    return converted;
  }
}

export class MongoPersistenceAdapter implements PersistenceAdapter {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  forCollection(collectionName: string): ResourcePersistence {
    return new MongoResourcePersistence(this.db.collection(collectionName));
  }

  getDb(): Db {
    return this.db;
  }
}

