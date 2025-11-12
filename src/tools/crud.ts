import {
  createResource as sharedCreateResource,
  deleteResource as sharedDeleteResource,
  getResource as sharedGetResource,
  listResource as sharedListResource,
  updateResource as sharedUpdateResource,
} from '../core/crud.js';
import type { Database } from '../db.js';
import { MongoPersistenceAdapter } from '../persistence/mongo-persistence.js';

function getAdapter(db: Database) {
  return new MongoPersistenceAdapter(db.getDb());
}

export function createResource(db: Database, args: unknown) {
  return sharedCreateResource(getAdapter(db), args);
}

export function getResource(db: Database, args: unknown) {
  return sharedGetResource(getAdapter(db), args);
}

export function updateResource(db: Database, args: unknown) {
  return sharedUpdateResource(getAdapter(db), args);
}

export function deleteResource(db: Database, args: unknown) {
  return sharedDeleteResource(getAdapter(db), args);
}

export function listResource(db: Database, args: unknown) {
  return sharedListResource(getAdapter(db), args);
}


