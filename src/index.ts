#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.HEALTH_RECORD_DB_NAME || 'health_record';

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
        description: `Create one or more resource records. Supports batch creation for resources that support it. Available resource types:\n${resourceTypeDescriptions}`,
        inputSchema: {
          type: 'object',
          properties: {
            resource_type: {
              type: 'string',
              enum: resourceTypes,
              description: 'The type of resource to create',
            },
            data: {
              type: ['object', 'array'],
              description: 'The resource data (single object or array for batch creation). Structure depends on resource_type.',
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
        description: `Update an existing resource record. Available resource types:\n${resourceTypeDescriptions}`,
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
              description: 'The fields to update. Structure depends on resource_type.',
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
        description: `List resource records with optional filters. Available resource types:\n${resourceTypeDescriptions}`,
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
              description: 'Optional filters to apply. Structure depends on resource_type. For patients, can filter by relationship.',
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
  return {
    resources: [
      {
        uri: 'summary://patient/{patient_id}',
        name: 'Active Health Summary',
        description: 'Current health summary for a patient',
        mimeType: 'text/plain',
      },
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
  
  throw new Error(`Unknown resource: ${uri}`);
});

async function main() {
  try {
    await db.connect();
    await db.createIndexes();
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('Health Record MCP Server running on stdio');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

