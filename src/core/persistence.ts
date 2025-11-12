export type Query = Record<string, unknown>;

export interface UpdateOperations {
  set?: Record<string, unknown>;
  setOnInsert?: Record<string, unknown>;
}

export type ReturnDocument = 'before' | 'after';

export interface UpdateOptions {
  upsert?: boolean;
  returnDocument?: ReturnDocument;
}

export interface ResourcePersistence {
  readonly collectionName: string;

  validateId(id: string): boolean;

  create(record: Record<string, unknown>): Promise<Record<string, unknown>>;
  createMany(records: Record<string, unknown>[]): Promise<Record<string, unknown>[]>;

  findById(id: string): Promise<Record<string, unknown> | null>;
  findOne(filter: Query): Promise<Record<string, unknown> | null>;
  find(filter: Query, limit: number): Promise<Record<string, unknown>[]>;

  updateById(
    id: string,
    operations: UpdateOperations,
    options?: UpdateOptions
  ): Promise<Record<string, unknown> | null>;

  updateOne(
    filter: Query,
    operations: UpdateOperations,
    options?: UpdateOptions
  ): Promise<Record<string, unknown> | null>;

  deleteById(id: string): Promise<Record<string, unknown> | null>;

  normalizeFilter(filter: Query): Query;
  toExternal(record: Record<string, unknown>, idField: string): Record<string, unknown>;
}

export interface PersistenceAdapter {
  forCollection(collectionName: string): ResourcePersistence;
}

