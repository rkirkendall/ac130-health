import { Database } from '../db.js';
import { getResourceDefinition, getAllResourceTypes } from '../resource-registry.js';
import { z } from 'zod';
import { zodToJsonSchemaForMCP } from '../schema-utils.js';

/**
 * Extract helpful schema hints from validation errors
 */
function extractSchemaHints(jsonSchema: any, error: z.ZodError, receivedData: any): string {
  const hints: string[] = [];
  
  // Extract object data for analysis (handle arrays)
  let dataForAnalysis = receivedData;
  if (Array.isArray(receivedData) && receivedData.length > 0) {
    dataForAnalysis = receivedData[0];
  }
  
  // Handle union types (single object vs array)
  if (jsonSchema.oneOf) {
    const objectSchema = jsonSchema.oneOf.find((s: any) => s.type === 'object');
    const arraySchema = jsonSchema.oneOf.find((s: any) => s.type === 'array');
    
    if (objectSchema && arraySchema) {
      hints.push('Schema accepts either:');
      hints.push('  1. A single object');
      hints.push('  2. An array of objects (for batch creation)');
      
      // Use the object schema for field hints
      if (objectSchema.properties) {
        const required = objectSchema.required || [];
        const receivedKeys = dataForAnalysis && typeof dataForAnalysis === 'object' && !Array.isArray(dataForAnalysis)
          ? Object.keys(dataForAnalysis)
          : [];
        
        if (required.length > 0) {
          const missing = required.filter((key: string) => !receivedKeys.includes(key));
          if (missing.length > 0) {
            hints.push(`\nMissing required fields: ${missing.join(', ')}`);
          }
        }
        
        // Show expected top-level fields
        const expectedFields = Object.keys(objectSchema.properties);
        const unexpected = receivedKeys.filter((key: string) => !expectedFields.includes(key));
        if (unexpected.length > 0) {
          hints.push(`\nUnexpected fields received: ${unexpected.join(', ')}`);
          hints.push(`Expected top-level fields: ${expectedFields.join(', ')}`);
        } else if (receivedKeys.length === 0 && required.length > 0) {
          hints.push(`\nExpected top-level fields: ${expectedFields.join(', ')}`);
        }
      }
    } else {
      // Fallback: try first schema in oneOf
      const firstSchema = jsonSchema.oneOf[0];
      if (firstSchema && firstSchema.properties) {
        const required = firstSchema.required || [];
        const receivedKeys = dataForAnalysis && typeof dataForAnalysis === 'object' && !Array.isArray(dataForAnalysis)
          ? Object.keys(dataForAnalysis)
          : [];
        
        if (required.length > 0) {
          const missing = required.filter((key: string) => !receivedKeys.includes(key));
          if (missing.length > 0) {
            hints.push(`Missing required fields: ${missing.join(', ')}`);
          }
        }
      }
    }
  } else if (jsonSchema.type === 'object' && jsonSchema.properties) {
    // Single object schema
    const required = jsonSchema.required || [];
    const receivedKeys = dataForAnalysis && typeof dataForAnalysis === 'object' && !Array.isArray(dataForAnalysis)
      ? Object.keys(dataForAnalysis)
      : [];
    
    if (required.length > 0) {
      const missing = required.filter((key: string) => !receivedKeys.includes(key));
      if (missing.length > 0) {
        hints.push(`Missing required fields: ${missing.join(', ')}`);
      }
    }
    
    // Show expected fields
    const expectedFields = Object.keys(jsonSchema.properties);
    const unexpected = receivedKeys.filter((key: string) => !expectedFields.includes(key));
    if (unexpected.length > 0) {
      hints.push(`Unexpected fields: ${unexpected.join(', ')}`);
      hints.push(`Expected fields: ${expectedFields.join(', ')}`);
    } else if (receivedKeys.length === 0) {
      hints.push(`Expected fields: ${expectedFields.join(', ')}`);
    }
  }
  
  // Add specific field type hints for common errors
  const missingRequiredIssues = error.issues.filter(issue => 
    issue.code === 'invalid_type' && issue.message.includes('Required')
  );
  
  if (missingRequiredIssues.length > 0) {
    const missingFields = missingRequiredIssues.map(issue => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
      return path;
    });
    
    if (hints.length === 0) {
      hints.push(`Missing required fields: ${missingFields.join(', ')}`);
    }
  }
  
  // Provide example structure for complex nested objects and arrays
  const nestedObjectIssues = error.issues.filter(issue => 
    issue.path.length > 0 && 
    (issue.code === 'invalid_type' || issue.code === 'invalid_union')
  );
  
  if (nestedObjectIssues.length > 0) {
    // Group errors by field path to identify problematic nested structures
    const pathGroups = new Map<string, z.ZodIssue[]>();
    nestedObjectIssues.forEach(issue => {
      if (issue.path.length > 0) {
        const firstLevel = issue.path[0].toString();
        if (!pathGroups.has(firstLevel)) {
          pathGroups.set(firstLevel, []);
        }
        pathGroups.get(firstLevel)!.push(issue);
      }
    });
    
    // Extract object schema for nested field analysis
    let objectSchemaForNested = jsonSchema;
    if (jsonSchema.oneOf) {
      const objSchema = jsonSchema.oneOf.find((s: any) => s.type === 'object');
      if (objSchema) objectSchemaForNested = objSchema;
    }
    
    pathGroups.forEach((issues, fieldName) => {
      // Check if this is a results array issue
      if (fieldName === 'results' || issues.some(i => i.path.includes('results'))) {
        const resultsIssues = issues.filter(i => i.path.includes('results'));
        if (resultsIssues.length > 0) {
          const resultsSchema = objectSchemaForNested.properties?.results;
          if (resultsSchema && resultsSchema.type === 'array' && resultsSchema.items) {
            const itemProps = resultsSchema.items.properties || {};
            const requiredFields = resultsSchema.items.required || [];
            const allFields = Object.keys(itemProps);
            
            // Check what fields are missing
            const missingFields = resultsIssues
              .filter(i => i.code === 'invalid_type' && i.message.includes('Required'))
              .map(i => i.path[i.path.length - 1]?.toString())
              .filter(Boolean);
            
            if (missingFields.length > 0) {
              hints.push(`\nIn 'results' array: Missing required field(s): ${[...new Set(missingFields)].join(', ')}`);
              hints.push(`Each item in 'results' array must have: ${allFields.join(', ')}`);
              if (requiredFields.length > 0) {
                hints.push(`Required fields in each 'results' item: ${requiredFields.join(', ')}`);
              }
            } else {
              hints.push(`\nField 'results' expects an array. Each item should have: ${allFields.join(', ')}`);
            }
          }
        }
      } else if (objectSchemaForNested.properties && objectSchemaForNested.properties[fieldName]) {
        const fieldSchema = objectSchemaForNested.properties[fieldName];
        if (fieldSchema.type === 'array' && fieldSchema.items) {
          const itemProps = fieldSchema.items.properties || {};
          hints.push(`\nField '${fieldName}' expects an array. Each item should have: ${Object.keys(itemProps).join(', ')}`);
        }
      }
    });
  }
  
  return hints.length > 0 
    ? `Schema hints:\n${hints.join('\n')}`
    : 'Check the schema resource for the exact structure required.';
}

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
  data: z.any(), // Update fields - can be object or JSON string
});

const DeleteResourceSchema = z.object({
  resource_type: z.string(),
  id: z.string(),
});

const ListResourceSchema = z.object({
  resource_type: z.string(),
  filters: z.any().optional(), // Can be object or JSON string
  limit: z.number().optional(),
});

export async function createResource(db: Database, args: unknown) {
  const validated = CreateResourceSchema.parse(args);
  let { resource_type, data } = validated;

  const resourceDef = getResourceDefinition(resource_type);
  if (!resourceDef) {
    throw new Error(`Unknown resource type: ${resource_type}. Available types: ${getAllResourceTypes().join(', ')}`);
  }

  // Handle case where data arrives as a JSON string (common with some MCP clients)
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      throw new Error(`Invalid JSON in data parameter: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Validate data against resource-specific schema with better error messages
  let validatedData;
  try {
    validatedData = resourceDef.createSchema.parse(data);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      // Handle union errors specially - extract the most relevant error
      let errorToUse = error;
      if (error.issues.length === 1 && error.issues[0].code === 'invalid_union') {
        const unionError = error.issues[0] as any;
        if (unionError.unionErrors && Array.isArray(unionError.unionErrors)) {
          // Find the error that matches what was actually received (array vs object)
          const isArray = Array.isArray(data);
          const matchingError = unionError.unionErrors.find((err: z.ZodError) => {
            // If we received an array, find the error that validates arrays
            if (isArray) {
              return err.issues.some((issue: any) => 
                issue.path.length > 0 || issue.message.includes('array')
              );
            }
            // If we received an object, find the error that validates objects
            return err.issues.some((issue: any) => 
              issue.code === 'invalid_type' && issue.expected === 'object'
            );
          }) || unionError.unionErrors[isArray ? 1 : 0]; // Fallback to array error if array, object error if object
          
          if (matchingError) {
            errorToUse = matchingError;
          }
        }
      }
      
      // Extract schema structure for hints
      const jsonSchema = zodToJsonSchemaForMCP(resourceDef.createSchema);
      const schemaHint = extractSchemaHints(jsonSchema, errorToUse, data);
      
      const issues = errorToUse.issues.map(issue => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `  - ${path}: ${issue.message}`;
      }).join('\n');
      
      throw new Error(
        `Validation failed for ${resource_type}:\n${issues}\n\n` +
        `${schemaHint}\n\n` +
        `For complete schema details, read: schema://${resource_type}/create`
      );
    }
    throw error;
  }
  const persistence = db.getResourcePersistence(resourceDef.collectionName);
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

    const insertedRecords = await persistence.createMany(records);
    const formatted = insertedRecords.map((record) =>
      persistence.toExternal(record, resourceDef.idField)
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            count: formatted.length,
            [resourceDef.collectionName]: formatted,
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

  const inserted = await persistence.create(record);
  const formatted = persistence.toExternal(inserted, resourceDef.idField);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...formatted,
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

  const persistence = db.getResourcePersistence(resourceDef.collectionName);

  if (!persistence.validateId(id)) {
    throw new Error(`Invalid ${resourceDef.idField}`);
  }

  const record = await persistence.findById(id);

  if (!record) {
    throw new Error(`${resourceDef.name} not found`);
  }

  const formatted = persistence.toExternal(record, resourceDef.idField);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...formatted,
        }, null, 2),
      },
    ],
  };
}

export async function updateResource(db: Database, args: unknown) {
  const validated = UpdateResourceSchema.parse(args);
  let { resource_type, id, data } = validated;

  const resourceDef = getResourceDefinition(resource_type);
  if (!resourceDef) {
    throw new Error(`Unknown resource type: ${resource_type}`);
  }

  const persistence = db.getResourcePersistence(resourceDef.collectionName);

  if (!persistence.validateId(id)) {
    throw new Error(`Invalid ${resourceDef.idField}`);
  }

  // Handle case where data arrives as a JSON string (common with some MCP clients)
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      throw new Error(`Invalid JSON in data parameter: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Validate update data against update schema (but merge with id field)
  const updateData = { [resourceDef.idField]: id, ...data };
  const validatedUpdate = resourceDef.updateSchema.parse(updateData);
  
  // Remove the id field from updates (it's used for querying, not updating)
  const { [resourceDef.idField]: _, ...updates } = validatedUpdate;

  const result = await persistence.updateById(
    id,
    {
      set: {
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

  const formatted = persistence.toExternal(result, resourceDef.idField);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          ...formatted,
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

  const persistence = db.getResourcePersistence(resourceDef.collectionName);

  if (!persistence.validateId(id)) {
    throw new Error(`Invalid ${resourceDef.idField}`);
  }

  const result = await persistence.deleteById(id);

  if (!result) {
    throw new Error(`${resourceDef.name} not found`);
  }

  const formatted = persistence.toExternal(result, resourceDef.idField);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          [resourceDef.idField]: id,
          deleted: {
            ...formatted,
          },
        }, null, 2),
      },
    ],
  };
}

export async function listResource(db: Database, args: unknown) {
  const validated = ListResourceSchema.parse(args);
  let { resource_type, filters = {}, limit = 50 } = validated;

  const resourceDef = getResourceDefinition(resource_type);
  if (!resourceDef) {
    throw new Error(`Unknown resource type: ${resource_type}`);
  }

  // Handle case where filters arrives as a JSON string (common with some MCP clients)
  if (typeof filters === 'string') {
    try {
      filters = JSON.parse(filters);
    } catch (e) {
      throw new Error(`Invalid JSON in filters parameter: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Ensure filters is an object, not undefined or null
  if (!filters || typeof filters !== 'object') {
    filters = {};
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

  const persistence = db.getResourcePersistence(resourceDef.collectionName);
  const records = await persistence.find(query, limit);
  const formattedRecords = records.map((record) =>
    persistence.toExternal(record, resourceDef.idField)
  );

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

