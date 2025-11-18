import {
  getHealthSummary as sharedGetHealthSummary,
  updateHealthSummary as sharedUpdateHealthSummary,
} from '../core/summary.js';
import type { Database } from '../db.js';
import { MongoPersistenceAdapter } from '../persistence/mongo-persistence.js';
import { MongoPhiVaultAdapter } from '../persistence/mongo-phi-vault.js';

function getAdapter(db: Database) {
  return new MongoPersistenceAdapter(db.getDb());
}

export function updateHealthSummary(db: Database, args: unknown) {
  return sharedUpdateHealthSummary(getAdapter(db), new MongoPhiVaultAdapter(db.getDb()), args);
}

export function getHealthSummary(db: Database, dependentId: string) {
  return sharedGetHealthSummary(getAdapter(db), dependentId);
}


