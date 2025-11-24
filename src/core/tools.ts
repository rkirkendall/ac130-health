import { getAllResourceTypes, RESOURCE_REGISTRY } from './resource-registry.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolMetadataOptions {
  allowDependentDeletion?: boolean;
}

function formatResourceTypeDescriptions(resourceTypes: string[]): string {
  if (!resourceTypes.length) {
    return 'No resource types are currently registered.';
  }

  return resourceTypes
    .map((type) => {
      const def = RESOURCE_REGISTRY[type as keyof typeof RESOURCE_REGISTRY];
      return `- ${type}: ${def?.description ?? 'No description available.'}`;
    })
    .join('\n');
}

export function getSharedToolDefinitions(options?: ToolMetadataOptions): ToolDefinition[] {
  const resourceTypes = getAllResourceTypes();
  const resourceTypeDescriptions = formatResourceTypeDescriptions(resourceTypes);

  const allowDependentDeletion = options?.allowDependentDeletion ?? false;
  const deletableResourceTypes = allowDependentDeletion
    ? resourceTypes
    : resourceTypes.filter((type) => type !== 'dependent');

  const deletableResourceTypeDescriptions = formatResourceTypeDescriptions(deletableResourceTypes);

  const deleteDescription = allowDependentDeletion
    ? `Delete a resource record by ID. Available resource types:\n${resourceTypeDescriptions}`
    : `Delete a resource record by ID.

Patient/dependent deletion is disabled via MCP. Use the AC130 dashboard to remove an entire profile so all related records are cleaned up automatically.

Available resource types:\n${deletableResourceTypeDescriptions ||
        'No non-dependent resource types are currently available for deletion.'}`;

  return [
    {
      name: 'create_resource',
      description: `Create one or more resource records. Supports batch creation for resources that support it. Available resource types:
${resourceTypeDescriptions}

IMPORTANT: Read the schema resource at 'schema://{resource_type}' (payload.create) to see the exact fields and structure required. For prescription, condition, lab, and visit records you must call list_resource first to confirm no duplicates exist, then pass duplicate_check_confirmed=true when retrying create_resource.

USAGE PATTERNS:

1. Single Record Creation:
   Use "data" as an object: { "dependent_id": "123...", "test_name": "CBC", ... }

2. Batch Creation (Multiple Records):
   Use "data" as an array: [{ "dependent_id": "123...", "test_name": "CBC", ... }, { "dependent_id": "123...", "test_name": "BMP", ... }]

EXAMPLE - Create Single Lab:
  {
    "resource_type": "lab",
    "data": {
      "dependent_id": "507f1f77bcf86cd799439011",
      "test_name": "Complete Blood Count",
      "results": [
        { "test": "WBC", "value": 7.5, "unit": "K/uL", "reference_range": "4.0-11.0" },
        { "test": "RBC", "value": 5.2, "unit": "M/uL", "reference_range": "4.5-5.9" }
      ],
      "result_date": "2024-01-15",
      "status": "final"
    }
  }

EXAMPLE - Batch Create Labs:
  {
    "resource_type": "lab",
    "data": [
      {
        "dependent_id": "507f1f77bcf86cd799439011",
        "test_name": "CBC",
        "results": [{ "test": "WBC", "value": 7.5, "unit": "K/uL" }]
      },
      {
        "dependent_id": "507f1f77bcf86cd799439011",
        "test_name": "BMP",
        "results": [{ "test": "Sodium", "value": 140, "unit": "mEq/L" }]
      }
    ]
  }`,
      inputSchema: {
        type: 'object',
        properties: {
          resource_type: {
            type: 'string',
            enum: resourceTypes,
            description: 'The type of resource to create',
          },
          data: {
            description:
              'The resource data. Can be a single object or an array of objects for batch creation. Structure depends on resource_type. Read schema://{resource_type} (payload.create) for exact schema.',
          },
          duplicate_check_confirmed: {
            type: 'boolean',
            description:
              'Required for prescription, condition, lab, and visit records. Call list_resource first to ensure a duplicate does not already exist, then retry create_resource with this set to true.',
          },
        },
        required: ['resource_type', 'data'],
      },
    },
    {
      name: 'get_resource',
      description: `Get a single resource record by ID. Available resource types:
${resourceTypeDescriptions}`,
      inputSchema: {
        type: 'object',
        properties: {
          resource_type: {
            type: 'string',
            enum: resourceTypes,
            description: 'The type of resource to retrieve',
          },
          id: {
            type: 'string',
            description: 'The ID of the resource to retrieve',
          },
        },
        required: ['resource_type', 'id'],
      },
    },
    {
      name: 'update_resource',
      description: `Update an existing resource record. Available resource types:
${resourceTypeDescriptions}

IMPORTANT: Before updating a resource, read the schema resource at 'schema://{resource_type}' (payload.update) to see the exact fields available for update.`,
      inputSchema: {
        type: 'object',
        properties: {
          resource_type: {
            type: 'string',
            enum: resourceTypes,
            description: 'The type of resource to update',
          },
          id: {
            type: 'string',
            description: 'The ID of the resource to update',
          },
          data: {
            type: 'object',
            description:
              'The fields to update. Structure depends on resource_type. Read schema://{resource_type} (payload.update) for exact schema.',
          },
        },
        required: ['resource_type', 'id', 'data'],
      },
    },
    {
      name: 'delete_resource',
      description: deleteDescription,
      inputSchema: {
        type: 'object',
        properties: {
          resource_type: {
            type: 'string',
            enum: deletableResourceTypes,
            description: 'The type of resource to delete',
          },
          id: {
            type: 'string',
            description: 'The ID of the resource to delete',
          },
        },
        required: ['resource_type', 'id'],
      },
    },
    {
      name: 'list_resource',
      description: `List resource records with optional filters. Available resource types:
${resourceTypeDescriptions}

IMPORTANT: Before listing a resource, read the schema resource at 'schema://{resource_type}' (payload.list) to see available filter fields.`,
      inputSchema: {
        type: 'object',
        properties: {
          resource_type: {
            type: 'string',
            enum: resourceTypes,
            description: 'The type of resource to list',
          },
          filters: {
            type: 'object',
            description:
              'Optional filters to apply. Structure depends on resource_type. Read schema://{resource_type} (payload.list) for available filter fields.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 50)',
          },
        },
        required: ['resource_type'],
      },
    },
    {
      name: 'update_health_summary',
      description:
        'Update the active health summary for a dependent. This should be a concise summary of current conditions, active medications, recent visits, pending labs, and upcoming follow-ups.',
      inputSchema: {
        type: 'object',
        properties: {
          dependent_id: { type: 'string', description: 'Dependent ID' },
          summary_text: { type: 'string', description: 'Updated health summary text' },
        },
        required: ['dependent_id', 'summary_text'],
      },
    },
  ];
}

