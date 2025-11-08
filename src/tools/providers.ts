import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import {
  CreateProviderSchema,
  UpdateProviderSchema,
  GetProviderSchema,
} from '../types.js';

export async function createProvider(db: Database, args: unknown) {
  const validated = CreateProviderSchema.parse(args);
  
  const now = new Date();
  const provider = {
    ...validated,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  };
  
  const result = await db.providers.insertOne(provider as any);
  const inserted = await db.providers.findOne({ _id: result.insertedId });
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          provider_id: result.insertedId.toString(),
          ...inserted,
          _id: inserted?._id.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function updateProvider(db: Database, args: unknown) {
  const validated = UpdateProviderSchema.parse(args);
  const { provider_id, ...updates } = validated;
  
  if (!ObjectId.isValid(provider_id)) {
    throw new Error('Invalid provider_id');
  }
  
  const result = await db.providers.findOneAndUpdate(
    { _id: new ObjectId(provider_id) },
    { 
      $set: {
        ...updates,
        updated_at: new Date(),
        updated_by: 'mcp',
      },
    },
    { returnDocument: 'after' }
  );
  
  if (!result) {
    throw new Error('Provider not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...result,
          _id: result._id.toString(),
          provider_id: result._id.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function getProvider(db: Database, args: unknown) {
  const validated = GetProviderSchema.parse(args);
  
  if (!ObjectId.isValid(validated.provider_id)) {
    throw new Error('Invalid provider_id');
  }
  
  const provider = await db.providers.findOne({ _id: new ObjectId(validated.provider_id) });
  
  if (!provider) {
    throw new Error('Provider not found');
  }
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...provider,
          _id: provider._id.toString(),
          provider_id: provider._id.toString(),
        }, null, 2),
      },
    ],
  };
}

