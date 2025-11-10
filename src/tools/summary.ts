import {
  getHealthSummary as sharedGetHealthSummary,
  updateHealthSummary as sharedUpdateHealthSummary,
} from '@ac130/mcp-core';
import type { Database } from '../db.js';
import { MongoPersistenceAdapter } from '../persistence/mongo-persistence.js';

function getAdapter(db: Database) {
  return new MongoPersistenceAdapter(db.getDb());
}

export function updateHealthSummary(db: Database, args: unknown) {
  return sharedUpdateHealthSummary(getAdapter(db), args);
}

export function getHealthSummary(db: Database, patientId: string) {
  return sharedGetHealthSummary(getAdapter(db), patientId);
}


