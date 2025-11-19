import { test, describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import * as vault from '../core/phi/vault.js';
import { PhiVaultAdapter } from '../core/phi/types.js';

const originalAnalyzeText = vault._deps.analyzeText;

// Mock implementation
const mockAnalyzeText = async (text: string) => {
    const results = [];
    
    if (text.includes('John Doe')) {
        const start = text.indexOf('John Doe');
        results.push({ start, end: start + 'John Doe'.length, score: 0.9, entity_type: 'PERSON', text: 'John Doe' });
    }
    if (text.includes('555-123-4567')) {
        const start = text.indexOf('555-123-4567');
        results.push({ start, end: start + '555-123-4567'.length, score: 0.9, entity_type: 'PHONE_NUMBER', text: '555-123-4567' });
    }
    if (text.includes('123 Main St')) {
        const start = text.indexOf('123 Main St');
        results.push({ start, end: start + '123 Main St'.length, score: 0.8, entity_type: 'ADDRESS', text: '123 Main St' });
    }
    if (text.includes('INS-98765')) {
        const start = text.indexOf('INS-98765');
        results.push({ start, end: start + 'INS-98765'.length, score: 0.95, entity_type: 'ID', text: 'INS-98765' });
    }
    if (text.includes('Tylenol')) {
        const start = text.indexOf('Tylenol');
        results.push({ start, end: start + 'Tylenol'.length, score: 0.6, entity_type: 'PERSON', text: 'Tylenol' });
    }
    return results;
};

// Mock Adapter
class MockPhiVaultAdapter implements PhiVaultAdapter {
  storedEntries: any[] = [];

  async upsertPhiEntries(entries: any[]): Promise<ObjectId[]> {
    const ids: ObjectId[] = [];
    for (const entry of entries) {
      this.storedEntries.push(entry);
      ids.push(new ObjectId());
    }
    return ids;
  }

  async findPhiEntries(criteria: any) {
    return [];
  }
}

describe('PHI Protection & Vaulting', () => {
  let adapter: MockPhiVaultAdapter;
  const dependentId = new ObjectId();
  const resourceId = new ObjectId();

  beforeEach(() => {
    adapter = new MockPhiVaultAdapter();
    vault._deps.analyzeText = mockAnalyzeText;
  });

  afterEach(() => {
    vault._deps.analyzeText = originalAnalyzeText;
  });

  it('should vault and redact patient name', async () => {
    const payload = {
      note: "Patient John Doe arrived for checkup."
    };
    
    const phiFields = [{ path: 'note', strategy: 'substring' as const }];

    const sanitized = await vault.vaultAndSanitizeFields(
      adapter,
      'visit',
      resourceId,
      dependentId,
      payload,
      phiFields
    );

    // Should replace John Doe with token
    assert.ok(sanitized.note.includes('phi:vault:PERSON:'), 'Name should be replaced with vault token');
    assert.ok(!sanitized.note.includes('John Doe'), 'Original name should not appear in sanitized text');
    
    // Should store in adapter
    const entry = adapter.storedEntries.find(e => e.value === 'John Doe');
    assert.ok(entry, 'John Doe should be stored in vault');
    assert.strictEqual(entry.phi_type, 'PERSON');
  });

  it('should strictly enforce known identifiers (Person)', async () => {
    // Scenario: "Tylenol" is detected as PERSON by our mock Presidio
    // But if we specify known identifiers that DO NOT include Tylenol, it should be ignored (not vaulted).
    // And John Doe should be vaulted if he IS in the list.
    
    const payload = {
      note: "Prescribed Tylenol to John Doe."
    };
    const phiFields = [{ path: 'note', strategy: 'substring' as const }];
    const knownIdentifiers = ['John Doe']; // We know John Doe is our patient

    const sanitized = await vault.vaultAndSanitizeFields(
      adapter,
      'visit',
      resourceId,
      dependentId,
      payload,
      phiFields,
      knownIdentifiers
    );

    // Tylenol should REMAIN (was filtered out from vaulting because it didn't match knownIdentifiers)
    assert.ok(sanitized.note.includes('Tylenol'), 'Medical term falsely identified as Person should be kept if not in known list');
    
    // John Doe should be VAULTED (matched known list)
    assert.ok(!sanitized.note.includes('John Doe'), 'Known identifier should be vaulted');
    assert.ok(sanitized.note.includes('phi:vault:PERSON:'), 'Token should replace known name');
  });

  it('should vault phone numbers, addresses, and insurance IDs', async () => {
    // User Requirement: include name, phone number, address, and insurance id
    const payload = {
      summary: "Contact: 555-123-4567 at 123 Main St. Insurance: INS-98765."
    };
    const phiFields = [{ path: 'summary', strategy: 'substring' as const }];
    const knownIdentifiers = ['John Doe']; 

    const sanitized = await vault.vaultAndSanitizeFields(
      adapter,
      'visit',
      resourceId,
      dependentId,
      payload,
      phiFields,
      knownIdentifiers
    );

    // Phone
    assert.ok(!sanitized.summary.includes('555-123-4567'), 'Phone number should be redacted');
    assert.ok(sanitized.summary.includes('phi:vault:PHONE_NUMBER:'), 'Phone token present');

    // Address
    assert.ok(!sanitized.summary.includes('123 Main St'), 'Address should be redacted');
    assert.ok(sanitized.summary.includes('phi:vault:ADDRESS:'), 'Address token present');

    // Insurance ID
    assert.ok(!sanitized.summary.includes('INS-98765'), 'Insurance ID should be redacted');
    assert.ok(sanitized.summary.includes('phi:vault:ID:'), 'ID token present');
  });
});
