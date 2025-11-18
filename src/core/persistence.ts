import { Db } from 'mongodb';

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
  find(filter: Query, limit?: number): Promise<any[]>;
  findById(id: string): Promise<any | null>;
  findOne(filter: Query): Promise<any | null>;
  create(data: object): Promise<any>;
  createMany(data: object[]): Promise<any[]>;
  updateById(id: string, updates: object, options?: object): Promise<any | null>;
  updateOne(filter: Query, updates: object, options?: object): Promise<any | null>;
  deleteById(id: string): Promise<any | null>;
  toExternal(data: object, idField: string): Record<string, unknown>;
  validateId(id: string): boolean;
}

export interface PersistenceAdapter {
  forCollection(collectionName: string): ResourcePersistence;
  getDb(): Db;
}

