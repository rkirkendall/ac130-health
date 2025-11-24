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
import { getSharedToolDefinitions } from './core/tools.js';
import type { CrudRuntimeOptions, HealthSummarySamplingPlan } from './core/crud.js';
import { mcpLogger } from './logger.js';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.HEALTH_RECORD_DB_NAME || 'health_record';
const MCP_TRANSPORT = process.env.MCP_TRANSPORT || 'stdio';
const MCP_PORT = parseInt(process.env.MCP_PORT || '3002');
const MCP_HTTP_ENABLE_JSON = process.env.MCP_HTTP_ENABLE_JSON === 'true';
const HTTP_BODY_PREVIEW_LIMIT = 2000;

function truncateBody(body?: string): string | undefined {
  if (!body) {
    return undefined;
  }
  if (body.length <= HTTP_BODY_PREVIEW_LIMIT) {
    return body;
  }
  return `${body.slice(0, HTTP_BODY_PREVIEW_LIMIT)}…`;
}

function summarizeToolResult(result: any): string | undefined {
  if (!result) {
    return undefined;
  }

  try {
    if (Array.isArray(result.content) && result.content.length > 0) {
      const first = result.content[0];
      if (first && typeof first === 'object' && 'text' in first && typeof first.text === 'string') {
        return truncateBody(first.text);
      }
    }
    if (typeof result === 'object') {
      return truncateBody(JSON.stringify(result));
    }
    return truncateBody(String(result));
  } catch {
    return undefined;
  }
}

function collectRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    req.on('error', (error) => reject(error));
  });
}

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

// Resource type list used across handlers
const resourceTypes = getAllResourceTypes();

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: getSharedToolDefinitions(),
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const toolName = request.params.name;
  const toolRequestId = mcpLogger.generateRequestId();
  const toolStartedAt = Date.now();
  void mcpLogger.logTool({
    requestId: toolRequestId,
    tool: toolName,
    arguments: request.params.arguments,
  });
  try {
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

    void mcpLogger.logTool({
      requestId: toolRequestId,
      tool: toolName,
      durationMs: Date.now() - toolStartedAt,
      resultSummary: summarizeToolResult(result),
    });

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
    void mcpLogger.logTool({
      requestId: toolRequestId,
      tool: toolName,
      durationMs: Date.now() - toolStartedAt,
      error: errorMessage,
    });
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
        enableJsonResponse: MCP_HTTP_ENABLE_JSON,
      });

      await server.connect(transport);

      const httpServer = createServer((req, res) => {
        const requestId = mcpLogger.generateRequestId();
        const startedAt = Date.now();
        let rawBody: string | undefined;

        const logCompletion = (errorMessage?: string) => {
          void mcpLogger.logHttp({
            requestId,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
            bodyPreview: truncateBody(rawBody),
            error: errorMessage,
          });
        };

        const handleRequest = async (parsedBody: unknown) => {
          res.once('finish', () => logCompletion());
          try {
          await transport.handleRequest(req, res, parsedBody);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
          console.error('HTTP request error:', error);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
            logCompletion(message);
          }
        };

        if (req.method === 'POST') {
          collectRequestBody(req)
            .then(async (body) => {
              rawBody = body;
              if (!body) {
                await handleRequest(undefined);
                return;
              }
              try {
                const parsedBody = JSON.parse(body);
                await handleRequest(parsedBody);
              } catch (parseError) {
                const message =
                  parseError instanceof Error ? parseError.message : 'Unable to parse JSON body';
                console.error('Failed to parse JSON body:', parseError);
                if (!res.headersSent) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
                logCompletion(message);
              }
            })
            .catch((error) => {
              const message = error instanceof Error ? error.message : String(error);
              console.error('Failed to read HTTP request body:', error);
              if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to read request body' }));
              }
              logCompletion(message);
            });
        } else {
          void handleRequest(undefined);
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
