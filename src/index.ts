#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  CreateMessageResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { Database } from './db.js';
import { CARE_MANAGER_BASE_PROMPT } from './prompts.js';

// Generic CRUD tool imports
import { createResource, getResource, updateResource, deleteResource, listResource } from './tools/crud.js';
import { updateHealthSummary, getHealthSummary } from './tools/summary.js';
import { getAllResourceTypes, RESOURCE_REGISTRY } from './resource-registry.js';
import { getCreateSchemaJson, getUpdateSchemaJson, getListSchemaJson } from './schema-utils.js';
import { getSharedResourceMetadata, readSharedResource } from './core/resources.js';
import type { CrudRuntimeOptions, HealthSummarySamplingPlan } from './core/crud.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.HEALTH_RECORD_DB_NAME || 'health_record';
const MCP_TRANSPORT = process.env.MCP_TRANSPORT || 'stdio';
const MCP_PORT = parseInt(process.env.MCP_PORT || '3002');

console.error(`MCP Transport: ${MCP_TRANSPORT}, Port: ${MCP_PORT}`);

const server = new Server(
  {
    name: 'health-record-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
      sampling: {},
    },
  }
);

const db = new Database(MONGO_URI, DB_NAME);

type SamplingExecutionStatus = 'updated' | 'failed' | 'skipped';

interface HealthSummarySamplingStatus {
  dependent_id: string;
  status: SamplingExecutionStatus;
  reason: string;
  model?: string;
  stop_reason?: string | null;
}

function mergeSamplingMeta(result: any, statuses: HealthSummarySamplingStatus[]): void {
  if (!statuses.length) {
    return;
  }

  const existingMeta = result._meta ? { ...result._meta } : {};
  const samplingMeta =
    existingMeta.health_summary_sampling && typeof existingMeta.health_summary_sampling === 'object'
      ? { ...existingMeta.health_summary_sampling }
      : {};

  const statusSummary: SamplingExecutionStatus =
    statuses.some((status) => status.status === 'updated')
      ? 'updated'
      : statuses.some((status) => status.status === 'failed')
        ? 'failed'
        : 'skipped';

  samplingMeta.status = statusSummary === 'updated' ? 'completed' : statusSummary;
  samplingMeta.executed_at = new Date().toISOString();
  samplingMeta.execution = statuses;

  existingMeta.health_summary_sampling = samplingMeta;
  result._meta = existingMeta;
}

async function executeHealthSummarySampling(
  plans: HealthSummarySamplingPlan[],
  extra: {
    signal?: AbortSignal;
    sendRequest?: typeof server['request'];
    requestId?: number | string;
  }
): Promise<HealthSummarySamplingStatus[]> {
  const statuses: HealthSummarySamplingStatus[] = [];

  if (plans.length === 0) {
    return statuses;
  }

  const clientCapabilities = server.getClientCapabilities();
  if (!clientCapabilities?.sampling) {
    for (const plan of plans) {
      statuses.push({
        dependent_id: plan.dependentId,
        status: 'skipped',
        reason: 'Client does not advertise the sampling capability.',
      });
    }
    return statuses;
  }

  if (typeof extra?.sendRequest !== 'function') {
    for (const plan of plans) {
      statuses.push({
        dependent_id: plan.dependentId,
        status: 'failed',
        reason: 'Sampling request channel unavailable for this transport.',
      });
    }
    return statuses;
  }

  for (const plan of plans) {
    if (extra.signal?.aborted) {
      statuses.push({
        dependent_id: plan.dependentId,
        status: 'failed',
        reason: 'Sampling aborted before execution.',
      });
      continue;
    }

    try {
      const samplingParams: Record<string, unknown> = {
        messages: plan.prompt.messages,
        maxTokens: plan.prompt.maxTokens,
      };

      if (plan.prompt.systemPrompt) {
        samplingParams.systemPrompt = plan.prompt.systemPrompt;
      }

      if (plan.prompt.temperature !== undefined) {
        samplingParams.temperature = plan.prompt.temperature;
      }

      const samplingResult = await extra.sendRequest(
        {
          method: 'sampling/createMessage',
          params: samplingParams,
        },
        CreateMessageResultSchema,
        {
          timeout: 120_000,
        }
      );

      if (samplingResult.content.type !== 'text') {
        throw new Error(`Sampling returned unsupported content type: ${samplingResult.content.type}`);
      }

      const summaryText = samplingResult.content.text.trim();
      if (!summaryText) {
        throw new Error('Sampling completed but returned empty text.');
      }

      await updateHealthSummary(db, {
        dependent_id: plan.dependentId,
        summary_text: summaryText,
      });

      try {
        await server.sendResourceUpdated({ uri: `summary://dependent/${plan.dependentId}` });
      } catch (notificationError) {
        console.warn('Failed to emit resource update notification:', notificationError);
      }

      statuses.push({
        dependent_id: plan.dependentId,
        status: 'updated',
        reason: 'Health summary regenerated via sampling.',
        model: samplingResult.model,
        stop_reason: samplingResult.stopReason ?? undefined,
      });
    } catch (error) {
      statuses.push({
        dependent_id: plan.dependentId,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return statuses;
}

async function runHealthSummarySampling(
  plans: HealthSummarySamplingPlan[],
  result: any,
  extra: {
    signal?: AbortSignal;
    sendRequest?: typeof server['request'];
    requestId?: number | string;
  }
): Promise<void> {
  if (plans.length === 0) {
    return;
  }

  try {
    const statuses = await executeHealthSummarySampling(plans, extra ?? {});
    mergeSamplingMeta(result, statuses);
  } catch (error) {
    mergeSamplingMeta(result, [
      {
        dependent_id: plans[0]?.dependentId ?? 'unknown',
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      },
    ]);
  }
}

// Generate resource type descriptions
const resourceTypes = getAllResourceTypes();
const resourceTypeDescriptions = resourceTypes.map(type => {
  const def = RESOURCE_REGISTRY[type];
  return `- ${type}: ${def.description}`;
}).join('\n');

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'create_resource',
        description: `Create one or more resource records. Supports batch creation for resources that support it. Available resource types:\n${resourceTypeDescriptions}\n\nIMPORTANT: Read the schema resource at 'schema://{resource_type}' (payload.create) to see the exact fields and structure required. For prescription, condition, lab, and visit records you must call list_resource first to confirm no duplicates exist, then pass duplicate_check_confirmed=true when retrying create_resource.

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
              description: 'The resource data. Can be a single object or an array of objects for batch creation. Structure depends on resource_type. Read schema://{resource_type}/create for exact schema.',
            },
            duplicate_check_confirmed: {
              type: 'boolean',
              description: 'Required for prescription, condition, lab, and visit records. Call list_resource first to ensure a duplicate does not already exist, then retry create_resource with this set to true.',
            },
          },
          required: ['resource_type', 'data'],
        },
      },
      {
        name: 'get_resource',
        description: `Get a single resource record by ID. Available resource types:\n${resourceTypeDescriptions}`,
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
        description: `Update an existing resource record. Available resource types:\n${resourceTypeDescriptions}\n\nIMPORTANT: Before updating a resource, read the schema resource at 'schema://{resource_type}' (payload.update) to see the exact fields available for update.`,
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
              description: 'The fields to update. Structure depends on resource_type. Read schema://{resource_type}/update for exact schema.',
            },
          },
          required: ['resource_type', 'id', 'data'],
        },
      },
      {
        name: 'delete_resource',
        description: `Delete a resource record by ID. Available resource types:\n${resourceTypeDescriptions}`,
        inputSchema: {
          type: 'object',
          properties: {
            resource_type: {
              type: 'string',
              enum: resourceTypes,
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
        description: `List resource records with optional filters. Available resource types:\n${resourceTypeDescriptions}\n\nIMPORTANT: Before listing a resource, read the schema resource at 'schema://{resource_type}' (payload.list) to see available filter fields.`,
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
              description: 'Optional filters to apply. Structure depends on resource_type. Read schema://{resource_type}/list for available filter fields.',
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
        description: 'Update the active health summary for a dependent. This should be a concise summary of current conditions, active medications, recent visits, pending labs, and upcoming follow-ups.',
        inputSchema: {
          type: 'object',
          properties: {
            dependent_id: { type: 'string', description: 'Dependent ID' },
            summary_text: { type: 'string', description: 'Updated health summary text' },
          },
          required: ['dependent_id', 'summary_text'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  try {
    const toolName = request.params.name;
    const healthSummaryPlans: HealthSummarySamplingPlan[] = [];
    const crudOptions: CrudRuntimeOptions = {
      onHealthSummaryPlan: async (plans) => {
        healthSummaryPlans.push(...plans);
      },
    };

    let result;

    switch (toolName) {
      case 'create_resource':
        result = await createResource(db, request.params.arguments, crudOptions);
        break;
      case 'get_resource':
        result = await getResource(db, request.params.arguments);
        break;
      case 'update_resource':
        result = await updateResource(db, request.params.arguments, crudOptions);
        break;
      case 'delete_resource':
        result = await deleteResource(db, request.params.arguments);
        break;
      case 'list_resource':
        result = await listResource(db, request.params.arguments);
        break;
      case 'update_health_summary':
        result = await updateHealthSummary(db, request.params.arguments);
        break;
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }

    if (
      result &&
      healthSummaryPlans.length > 0 &&
      (toolName === 'create_resource' || toolName === 'update_resource')
    ) {
      await runHealthSummarySampling(healthSummaryPlans, result, {
        signal: extra?.signal,
        sendRequest: extra?.sendRequest,
        requestId: extra?.requestId,
      });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// List available prompts
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: 'care_manager_base',
        description: 'Base prompt for care manager assistant role',
      },
    ],
  };
});

// Get prompt content
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === 'care_manager_base') {
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: CARE_MANAGER_BASE_PROMPT,
          },
        },
      ],
    };
  }
  throw new Error(`Unknown prompt: ${request.params.name}`);
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const resourceTypes = getAllResourceTypes();
  const schemaResources = resourceTypes.map(type => {
    const def = RESOURCE_REGISTRY[type];
    const modes = ['create', 'update'];
    if (def.listSchema) {
      modes.push('list');
    }

    return {
      uri: `schema://${type}`,
      name: `${type} Schemas`,
      description: `JSON Schemas for ${def.description} (${modes.join('/')})`,
      mimeType: 'application/json',
    };
  });

  const sharedResources = getSharedResourceMetadata();

  return {
    resources: [
      {
        uri: 'summary://dependent/{dependent_id}',
        name: 'Active Health Summary',
        description: 'Current health summary for a dependent',
        mimeType: 'text/plain',
      },
      ...sharedResources,
      ...schemaResources,
    ],
  };
});

// Read resource content
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  
  if (uri.startsWith('summary://dependent/')) {
    const dependentId = uri.replace('summary://dependent/', '');
    const summaryText = await getHealthSummary(db, dependentId);
    
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: summaryText,
        },
      ],
    };
  }
  
  const sharedResource = readSharedResource(uri);
  if (sharedResource) {
    return {
      contents: [
        {
          uri,
          mimeType: sharedResource.mimeType,
          text: sharedResource.text,
        },
      ],
    };
  }
  
  // Handle schema resources
  if (uri.startsWith('schema://')) {
    try {
      const match = uri.match(/^schema:\/\/([^/]+)$/);
      if (!match) {
        throw new Error(`Invalid schema URI format. Expected: schema://{resource_type}. Got: ${uri}`);
      }

      const [, resourceType] = match;
      const def = RESOURCE_REGISTRY[resourceType as keyof typeof RESOURCE_REGISTRY];

      if (!def) {
        throw new Error(`Unknown resource type: ${resourceType}. Available types: ${getAllResourceTypes().join(', ')}`);
      }

      try {
        const schemaJson: Record<string, unknown> = {
          resource_type: resourceType,
          create: getCreateSchemaJson(resourceType, def.createSchema),
          update: getUpdateSchemaJson(resourceType, def.updateSchema, def.idField),
        };

        if (def.listSchema) {
          schemaJson.list = getListSchemaJson(resourceType, def.listSchema);
        }

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(schemaJson, null, 2),
            },
          ],
        };
      } catch (schemaError: any) {
        throw new Error(`Failed to generate schemas for ${resourceType}: ${schemaError.message}`);
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error reading schema resource ${uri}: ${errorMessage}`);
    }
  }
  
  throw new Error(`Unknown resource: ${uri}. Available resources include schema://{resource_type} and summary://dependent/{dependent_id}`);
});

async function main() {
  try {
    await db.connect();
    await db.createIndexes();

    if (MCP_TRANSPORT === 'http') {
      // HTTP transport (stateless mode, like cloud version)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await server.connect(transport);

      const httpServer = createServer(async (req, res) => {
        try {
          // Parse the request body if it's a POST request
          let parsedBody: unknown;
          if (req.method === 'POST') {
            const buffers = [];
            for await (const chunk of req) {
              buffers.push(chunk);
            }
            const body = Buffer.concat(buffers).toString();
            try {
              parsedBody = JSON.parse(body);
            } catch (parseError) {
              console.error('Failed to parse JSON body:', parseError);
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
              return;
            }
          }

          await transport.handleRequest(req, res, parsedBody);
        } catch (error) {
          console.error('HTTP request error:', error);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        }
      });

      httpServer.listen(MCP_PORT, () => {
        console.error(`Health Record MCP Server running on HTTP port ${MCP_PORT}`);
      });
    } else {
      // Default stdio transport
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error('Health Record MCP Server running on stdio');
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
