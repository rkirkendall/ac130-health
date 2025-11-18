import { createResource, updateResource } from './core/crud.js';
import { MongoPersistenceAdapter } from './persistence/mongo-persistence.js';
import { Db, MongoClient, ObjectId } from 'mongodb';

async function runTest() {
  const mongoClient = new MongoClient(process.env.MONGO_URL || 'mongodb://mongodb:27017');
  await mongoClient.connect();
  const db: Db = mongoClient.db('ac130-test');
  const persistenceAdapter = new MongoPersistenceAdapter(db);
  const conditionsCollection = db.collection('conditions');
  const phiVaultCollection = db.collection('phi_vault_entries');

  console.log('--- Running Presidio E2E Test ---');

  // 1. Create a dependent for our tests
  const dependentArgs = {
    resource_type: 'dependent',
    data: {
      record_identifier: 'Test Dependent',
      external_ref: `presidio-e2e-test-${Date.now()}`,
    },
  };
  const dependentResult = await createResource(persistenceAdapter, dependentArgs);
  const dependent = JSON.parse(dependentResult.content[0].text);
  const dependentId = dependent.dependent_id;
  console.log('Created dependent:', dependentId);

  // 2. Create a condition with PHI in the notes
  const createArgs = {
    resource_type: 'condition',
    data: {
      dependent_id: dependentId,
      name: 'Hypertension',
      status: 'active',
      notes: 'Patient can be reached at 555-123-4567. Email: test@example.com.',
    },
    duplicate_check_confirmed: true,
  };

  console.log('\n--- Testing createResource with PHI ---');
  const createResult = await createResource(persistenceAdapter, createArgs);
  const condition = JSON.parse(createResult.content[0].text);
  const conditionId = condition.condition_id;
  console.log('Created condition:', conditionId);

  // 3. Verify the condition was sanitized
  const createdCondition = await conditionsCollection.findOne({ _id: new ObjectId(conditionId) });
  console.log('Sanitized notes on create:', createdCondition?.notes);
  if (!createdCondition?.notes.includes('phi:vault:')) {
    throw new Error('PHI was not sanitized on create!');
  }

  // 4. Verify the PHI was vaulted
  const vaultEntry = await phiVaultCollection.findOne({ resource_id: new ObjectId(conditionId) });
  console.log('Vault entry on create:', vaultEntry);
  if (!vaultEntry) {
    throw new Error('PHI was not vaulted on create!');
  }

  // 5. Update the condition with more PHI
  const updateArgs = {
    resource_type: 'condition',
    id: conditionId,
    data: {
      notes: 'Updated notes. Patient mentioned their birthday is 1990-01-15.',
    },
  };

  console.log('\n--- Testing updateResource with PHI ---');
  await updateResource(persistenceAdapter, updateArgs);
  console.log('Updated condition:', conditionId);

  // 6. Verify the condition was sanitized on update
  const updatedCondition = await conditionsCollection.findOne({ _id: new ObjectId(conditionId) });
  console.log('Sanitized notes on update:', updatedCondition?.notes);
  if (!updatedCondition?.notes.includes('phi:vault:')) {
    throw new Error('PHI was not sanitized on update!');
  }

  // 7. Verify the PHI was vaulted on update
  const updatedVaultEntry = await phiVaultCollection.findOne({
    resource_id: new ObjectId(conditionId),
    value: '1990-01-15',
  });
  console.log('Vault entry on update:', updatedVaultEntry);
  if (!updatedVaultEntry) {
    throw new Error('PHI was not vaulted on update!');
  }

  console.log('\n--- Presidio E2E Test Complete ---');
  await db.dropDatabase();
  await mongoClient.close();
}

runTest().catch((err) => {
  console.error('Test failed', err);
  process.exit(1);
});
