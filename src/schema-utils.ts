import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Convert a Zod schema to JSON Schema format for MCP resource exposure
 */
export function zodToJsonSchemaForMCP(schema: z.ZodType): any {
  try {
    // Handle union types (like CreateLabSchema which can be single or array)
    if (schema instanceof z.ZodUnion) {
      const options = schema._def.options;
      // If it's a union of object and array, we want to show both possibilities
      if (options.length === 2) {
        const [single, array] = options;
        if (single instanceof z.ZodObject && array instanceof z.ZodArray) {
          return {
            oneOf: [
              zodToJsonSchema(single),
              {
                type: 'array',
                items: zodToJsonSchema(array._def.type),
              },
            ],
          };
        }
      }
    }

    // Handle array types
    if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: zodToJsonSchema(schema._def.type),
      };
    }

    // Default: convert directly
    return zodToJsonSchema(schema);
  } catch (error: any) {
    // If schema conversion fails, return a basic error schema
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error converting Zod schema to JSON Schema: ${errorMessage}`, error);
    throw new Error(`Schema conversion failed: ${errorMessage}`);
  }
}

/**
 * Get example data for a resource type
 */
function getExampleForResourceType(resourceType: string): any {
  const examples: Record<string, any> = {
    lab: {
      single: {
        patient_id: "507f1f77bcf86cd799439011",
        test_name: "Complete Blood Count",
        results: [
          { test: "WBC", value: 7.5, unit: "K/uL", reference_range: "4.0-11.0" },
          { test: "RBC", value: 5.2, unit: "M/uL", reference_range: "4.5-5.9" }
        ],
        result_date: "2024-01-15",
        status: "final"
      },
      batch: [
        {
          patient_id: "507f1f77bcf86cd799439011",
          test_name: "CBC",
          results: [{ test: "WBC", value: 7.5, unit: "K/uL" }]
        },
        {
          patient_id: "507f1f77bcf86cd799439011",
          test_name: "BMP",
          results: [{ test: "Sodium", value: 140, unit: "mEq/L" }]
        }
      ]
    },
    patient: {
      single: {
        name: { given: "John", family: "Smith" },
        dob: "1955-03-15",
        sex: "male",
        relationship: "father"
      },
      batch: [
        { name: { given: "John", family: "Smith" }, relationship: "father" },
        { name: { given: "Mary", family: "Smith" }, relationship: "mother" }
      ]
    },
    visit: {
      single: {
        patient_id: "507f1f77bcf86cd799439011",
        date: "2024-01-15",
        type: "office",
        reason: "Annual checkup"
      },
      batch: [
        { patient_id: "507f1f77bcf86cd799439011", date: "2024-01-15", type: "office" },
        { patient_id: "507f1f77bcf86cd799439011", date: "2024-02-20", type: "telehealth" }
      ]
    },
    prescription: {
      single: {
        patient_id: "507f1f77bcf86cd799439011",
        medication_name: "Lisinopril",
        dose: "10mg",
        frequency: "once daily",
        status: "active"
      }
    },
    condition: {
      single: {
        patient_id: "507f1f77bcf86cd799439011",
        name: "Hypertension",
        status: "active",
        diagnosed_date: "2023-05-10"
      }
    }
  };
  
  return examples[resourceType];
}

/**
 * Generate a JSON Schema description for a resource's create schema
 */
export function getCreateSchemaJson(resourceType: string, createSchema: z.ZodType): any {
  const jsonSchema = zodToJsonSchemaForMCP(createSchema);
  const examples = getExampleForResourceType(resourceType);
  
  // Build description with examples
  let description = `Schema for creating ${resourceType} resources.`;
  
  // Add usage instructions
  if (jsonSchema.oneOf) {
    description += '\n\nSupports both single and batch creation:\n';
    description += '- Single: Pass an object matching the schema\n';
    description += '- Batch: Pass an array of objects matching the schema\n';
  }
  
  // Add examples if available
  if (examples) {
    description += '\n\nEXAMPLES:\n';
    if (examples.single) {
      description += `\nSingle Record:\n${JSON.stringify(examples.single, null, 2)}`;
    }
    if (examples.batch) {
      description += `\n\nBatch Creation:\n${JSON.stringify(examples.batch, null, 2)}`;
    }
  }
  
  // Add helpful metadata
  return {
    ...jsonSchema,
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: `${resourceType} Create Schema`,
    description,
    ...(examples?.single && { examples: examples.batch ? [examples.single, examples.batch] : [examples.single] }),
  };
}

/**
 * Generate a JSON Schema description for a resource's update schema
 */
export function getUpdateSchemaJson(resourceType: string, updateSchema: z.ZodType, idField: string): any {
  const jsonSchema = zodToJsonSchemaForMCP(updateSchema);
  
  // Remove the id field from the schema since it's passed separately in the tool call
  if (jsonSchema.properties) {
    const { [idField]: _, ...rest } = jsonSchema.properties;
    // Also remove from required array if present
    const required = jsonSchema.required?.filter((field: string) => field !== idField);
    
    return {
      ...jsonSchema,
      properties: rest,
      required: required && required.length > 0 ? required : undefined,
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: `${resourceType} Update Schema`,
      description: `Schema for updating ${resourceType} resources. All fields are optional. The ${idField} is passed separately in the tool call.`,
    };
  }
  
  return {
    ...jsonSchema,
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: `${resourceType} Update Schema`,
    description: `Schema for updating ${resourceType} resources. All fields are optional.`,
  };
}

/**
 * Generate a JSON Schema description for a resource's list/filter schema
 */
export function getListSchemaJson(resourceType: string, listSchema: z.ZodType | undefined): any {
  if (!listSchema) {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: `${resourceType} List Schema`,
      description: `No specific filter schema defined for ${resourceType}. Use generic filters.`,
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 50)',
        },
      },
    };
  }

  const jsonSchema = zodToJsonSchemaForMCP(listSchema);
  
  return {
    ...jsonSchema,
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: `${resourceType} List Schema`,
    description: `Schema for filtering ${resourceType} resources.`,
  };
}

