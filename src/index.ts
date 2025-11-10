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
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { Database } from './db.js';
import { CARE_MANAGER_BASE_PROMPT } from './prompts.js';

// Generic CRUD tool imports
import { createResource, getResource, updateResource, deleteResource, listResource } from './tools/crud.js';
import { updateHealthSummary, getHealthSummary } from './tools/summary.js';
import { getAllResourceTypes, RESOURCE_REGISTRY } from './resource-registry.js';
import { getCreateSchemaJson, getUpdateSchemaJson, getListSchemaJson } from './schema-utils.js';

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
    },
  }
);

const db = new Database(MONGO_URI, DB_NAME);

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
        description: `Create one or more resource records. Supports batch creation for resources that support it. Available resource types:\n${resourceTypeDescriptions}\n\nIMPORTANT: Read the schema resource at 'schema://{resource_type}/create' to see the exact fields and structure required.

USAGE PATTERNS:

1. Single Record Creation:
   Use "data" as an object: { "patient_id": "123...", "test_name": "CBC", ... }

2. Batch Creation (Multiple Records):
   Use "data" as an array: [{ "patient_id": "123...", "test_name": "CBC", ... }, { "patient_id": "123...", "test_name": "BMP", ... }]

EXAMPLE - Create Single Lab:
  {
    "resource_type": "lab",
    "data": {
      "patient_id": "507f1f77bcf86cd799439011",
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
        "patient_id": "507f1f77bcf86cd799439011",
        "test_name": "CBC",
        "results": [{ "test": "WBC", "value": 7.5, "unit": "K/uL" }]
      },
      {
        "patient_id": "507f1f77bcf86cd799439011",
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
        description: `Update an existing resource record. Available resource types:\n${resourceTypeDescriptions}\n\nIMPORTANT: Before updating a resource, read the schema resource at 'schema://{resource_type}/update' to see the exact fields available for update.`,
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
        description: `List resource records with optional filters. Available resource types:\n${resourceTypeDescriptions}\n\nIMPORTANT: Before listing a resource, read the schema resource at 'schema://{resource_type}/list' to see available filter fields.`,
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
        description: 'Update the active health summary for a patient. This should be a concise summary of current conditions, active medications, recent visits, pending labs, and upcoming follow-ups.',
        inputSchema: {
          type: 'object',
          properties: {
            patient_id: { type: 'string', description: 'Patient ID' },
            summary_text: { type: 'string', description: 'Updated health summary text' },
          },
          required: ['patient_id', 'summary_text'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case 'create_resource':
        return await createResource(db, request.params.arguments);
      case 'get_resource':
        return await getResource(db, request.params.arguments);
      case 'update_resource':
        return await updateResource(db, request.params.arguments);
      case 'delete_resource':
        return await deleteResource(db, request.params.arguments);
      case 'list_resource':
        return await listResource(db, request.params.arguments);
      case 'update_health_summary':
        return await updateHealthSummary(db, request.params.arguments);
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
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
  const schemaResources = resourceTypes.flatMap(type => {
    const def = RESOURCE_REGISTRY[type];
    return [
      {
        uri: `schema://${type}/create`,
        name: `${type} Create Schema`,
        description: `JSON Schema for creating ${def.description}`,
        mimeType: 'application/json',
      },
      {
        uri: `schema://${type}/update`,
        name: `${type} Update Schema`,
        description: `JSON Schema for updating ${def.description}`,
        mimeType: 'application/json',
      },
      {
        uri: `schema://${type}/list`,
        name: `${type} List Schema`,
        description: `JSON Schema for filtering/listing ${def.description}`,
        mimeType: 'application/json',
      },
    ];
  });

  return {
    resources: [
      {
        uri: 'summary://patient/{patient_id}',
        name: 'Active Health Summary',
        description: 'Current health summary for a patient',
        mimeType: 'text/plain',
      },
      ...schemaResources,
    ],
  };
});

// Read resource content
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  
  if (uri.startsWith('summary://patient/')) {
    const patientId = uri.replace('summary://patient/', '');
    const summaryText = await getHealthSummary(db, patientId);
    
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
  
  // Handle schema resources
  if (uri.startsWith('schema://')) {
    try {
      const match = uri.match(/^schema:\/\/([^/]+)\/(create|update|list)$/);
      if (match) {
        const [, resourceType, schemaType] = match;
        const def = RESOURCE_REGISTRY[resourceType as keyof typeof RESOURCE_REGISTRY];
        
        if (!def) {
          throw new Error(`Unknown resource type: ${resourceType}. Available types: ${getAllResourceTypes().join(', ')}`);
        }
        
        let schemaJson: any;
        try {
          if (schemaType === 'create') {
            schemaJson = getCreateSchemaJson(resourceType, def.createSchema);
          } else if (schemaType === 'update') {
            schemaJson = getUpdateSchemaJson(resourceType, def.updateSchema, def.idField);
          } else if (schemaType === 'list') {
            schemaJson = getListSchemaJson(resourceType, def.listSchema);
          } else {
            throw new Error(`Unknown schema type: ${schemaType}. Must be one of: create, update, list`);
          }
        } catch (schemaError: any) {
          throw new Error(`Failed to generate schema for ${resourceType}/${schemaType}: ${schemaError.message}`);
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
      } else {
        throw new Error(`Invalid schema URI format. Expected: schema://{resource_type}/{create|update|list}. Got: ${uri}`);
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Error reading schema resource ${uri}: ${errorMessage}`);
    }
  }
  
  throw new Error(`Unknown resource: ${uri}. Available resources include schema://{resource_type}/create, schema://{resource_type}/update, schema://{resource_type}/list, and summary://patient/{patient_id}`);
});

async function main() {
  try {
    await db.connect();
    await db.createIndexes();

    if (MCP_TRANSPORT === 'http') {
      // HTTP transport
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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

