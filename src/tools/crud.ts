import { ObjectId } from 'mongodb';
import { Database } from '../db.js';
import { getResourceDefinition, getAllResourceTypes } from '../resource-registry.js';
import { z } from 'zod';

// Generic schemas for CRUD operations
const CreateResourceSchema = z.object({
  resource_type: z.string(),
  data: z.any(), // Will be validated by resource-specific schema
});

const GetResourceSchema = z.object({
  resource_type: z.string(),
  id: z.string(),
});

const UpdateResourceSchema = z.object({
  resource_type: z.string(),
  id: z.string(),
  data: z.record(z.any()), // Update fields
});

const DeleteResourceSchema = z.object({
  resource_type: z.string(),
  id: z.string(),
});

const ListResourceSchema = z.object({
  resource_type: z.string(),
  filters: z.record(z.any()).optional(),
  limit: z.number().optional(),
});

export async function createResource(db: Database, args: unknown) {
  const validated = CreateResourceSchema.parse(args);
  const { resource_type, data } = validated;

  const resourceDef = getResourceDefinition(resource_type);
  if (!resourceDef) {
    throw new Error(`Unknown resource type: ${resource_type}. Available types: ${getAllResourceTypes().join(', ')}`);
  }

  // Validate data against resource-specific schema
  const validatedData = resourceDef.createSchema.parse(data);
  const collection = resourceDef.getCollection(db);
  const now = new Date();

  // Handle batch creation
  if (Array.isArray(validatedData)) {
    if (!resourceDef.supportsBatch) {
      throw new Error(`Resource type ${resource_type} does not support batch creation`);
    }

    const records = validatedData.map((item: any) => ({
      ...item,
      created_at: now,
      updated_at: now,
      created_by: 'mcp',
      updated_by: 'mcp',
    }));

    const result = await collection.insertMany(records);
    const insertedIds = Object.values(result.insertedIds);
    const inserted = await collection.find({ _id: { $in: insertedIds } }).toArray();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: inserted.length,
            [resourceDef.collectionName]: inserted.map((item: any) => ({
              ...item,
              _id: item._id.toString(),
              [resourceDef.idField]: item._id.toString(),
            })),
          }, null, 2),
        },
      ],
    };
  }

  // Handle single creation
  const record = {
    ...validatedData,
    created_at: now,
    updated_at: now,
    created_by: 'mcp',
    updated_by: 'mcp',
  };

  const result = await collection.insertOne(record);
  const inserted = await collection.findOne({ _id: result.insertedId });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          [resourceDef.idField]: result.insertedId.toString(),
          ...inserted,
          _id: inserted?._id.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function getResource(db: Database, args: unknown) {
  const validated = GetResourceSchema.parse(args);
  const { resource_type, id } = validated;

  const resourceDef = getResourceDefinition(resource_type);
  if (!resourceDef) {
    throw new Error(`Unknown resource type: ${resource_type}`);
  }

  if (!ObjectId.isValid(id)) {
    throw new Error(`Invalid ${resourceDef.idField}`);
  }

  const collection = resourceDef.getCollection(db);
  const record = await collection.findOne({ _id: new ObjectId(id) });

  if (!record) {
    throw new Error(`${resourceDef.name} not found`);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...record,
          _id: record._id.toString(),
          [resourceDef.idField]: record._id.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function updateResource(db: Database, args: unknown) {
  const validated = UpdateResourceSchema.parse(args);
  const { resource_type, id, data } = validated;

  const resourceDef = getResourceDefinition(resource_type);
  if (!resourceDef) {
    throw new Error(`Unknown resource type: ${resource_type}`);
  }

  if (!ObjectId.isValid(id)) {
    throw new Error(`Invalid ${resourceDef.idField}`);
  }

  // Validate update data against update schema (but merge with id field)
  const updateData = { [resourceDef.idField]: id, ...data };
  const validatedUpdate = resourceDef.updateSchema.parse(updateData);
  
  // Remove the id field from updates (it's used for querying, not updating)
  const { [resourceDef.idField]: _, ...updates } = validatedUpdate;

  const collection = resourceDef.getCollection(db);
  const result = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
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
    throw new Error(`${resourceDef.name} not found`);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...result,
          _id: result._id.toString(),
          [resourceDef.idField]: result._id.toString(),
        }, null, 2),
      },
    ],
  };
}

export async function deleteResource(db: Database, args: unknown) {
  const validated = DeleteResourceSchema.parse(args);
  const { resource_type, id } = validated;

  const resourceDef = getResourceDefinition(resource_type);
  if (!resourceDef) {
    throw new Error(`Unknown resource type: ${resource_type}`);
  }

  if (!ObjectId.isValid(id)) {
    throw new Error(`Invalid ${resourceDef.idField}`);
  }

  const collection = resourceDef.getCollection(db);
  const result = await collection.findOneAndDelete({ _id: new ObjectId(id) });

  if (!result) {
    throw new Error(`${resourceDef.name} not found`);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          [resourceDef.idField]: id,
          deleted: {
            ...result,
            _id: result._id.toString(),
            [resourceDef.idField]: result._id.toString(),
          },
        }, null, 2),
      },
    ],
  };
}

// Fields that are ObjectIds in MongoDB but come as strings in filters
const OBJECT_ID_FIELDS = new Set([
  'patient_id',
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

function convertObjectIdFilters(query: any): any {
  const converted: any = {};
  for (const [key, value] of Object.entries(query)) {
    if (OBJECT_ID_FIELDS.has(key) && typeof value === 'string' && ObjectId.isValid(value)) {
      converted[key] = new ObjectId(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      // Recursively handle nested objects (e.g., $in, $gte, etc.)
      converted[key] = convertObjectIdFilters(value);
    } else if (Array.isArray(value) && OBJECT_ID_FIELDS.has(key)) {
      // Handle arrays of ObjectIds (e.g., $in queries)
      converted[key] = value.map((v: any) => 
        typeof v === 'string' && ObjectId.isValid(v) ? new ObjectId(v) : v
      );
    } else {
      converted[key] = value;
    }
  }
  return converted;
}

export async function listResource(db: Database, args: unknown) {
  const validated = ListResourceSchema.parse(args);
  const { resource_type, filters = {}, limit = 50 } = validated;

  const resourceDef = getResourceDefinition(resource_type);
  if (!resourceDef) {
    throw new Error(`Unknown resource type: ${resource_type}`);
  }

  // If resource has a list schema, validate filters by merging with limit
  let query: any = {};
  if (resourceDef.listSchema) {
    // Merge filters with limit for validation
    const filterData = { ...filters, limit };
    const validatedFilters = resourceDef.listSchema.parse(filterData);
    query = { ...validatedFilters };
    // Remove limit from query (we'll use it separately for MongoDB)
    delete query.limit;
  } else {
    // Otherwise, use filters directly (with basic validation)
    query = filters;
  }

  // Convert ObjectId string fields to ObjectId objects
  query = convertObjectIdFilters(query);

  const collection = resourceDef.getCollection(db);
  const records = await collection.find(query).limit(limit).toArray();

  const formattedRecords = records.map((record: any) => ({
    ...record,
    _id: record._id.toString(),
    [resourceDef.idField]: record._id.toString(),
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          count: records.length,
          [resourceDef.collectionName]: formattedRecords,
        }, null, 2),
      },
    ],
  };
}

