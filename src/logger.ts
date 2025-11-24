import { appendFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_LOG_DIR = path.join(process.cwd(), 'logs');

interface BaseLogEntry {
  timestamp: string;
  requestId?: string;
}

interface HttpLogEntry extends BaseLogEntry {
  method: string | undefined;
  url: string | undefined;
  statusCode?: number;
  durationMs?: number;
  bodyPreview?: string;
  error?: string;
  transport?: 'http' | 'stdio';
}

interface ToolLogEntry extends BaseLogEntry {
  tool: string;
  arguments?: unknown;
  resultSummary?: string;
  durationMs?: number;
  error?: string;
}

export class MCPLogger {
  private readonly httpLogPath: string;
  private readonly toolLogPath: string;
  private readonly logDir: string;

  constructor(customDir?: string) {
    this.logDir = customDir ?? DEFAULT_LOG_DIR;
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
    this.httpLogPath = path.join(this.logDir, 'mcp-http.log');
    this.toolLogPath = path.join(this.logDir, 'mcp-tools.log');
  }

  generateRequestId(): string {
    return randomUUID();
  }

  async logHttp(entry: Omit<HttpLogEntry, 'timestamp'>) {
    const line: HttpLogEntry = {
      timestamp: new Date().toISOString(),
      transport: 'http',
      ...entry,
    };
    await this.appendLine(this.httpLogPath, line as unknown as Record<string, unknown>);
  }

  async logTool(entry: Omit<ToolLogEntry, 'timestamp'>) {
    const line: ToolLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    await this.appendLine(this.toolLogPath, line as unknown as Record<string, unknown>);
  }

  private async appendLine(filePath: string, payload: Record<string, unknown>) {
    try {
      await appendFile(filePath, JSON.stringify(payload) + '\n');
    } catch (error) {
      console.error('Failed to write MCP log entry:', error);
    }
  }
}

export const mcpLogger = new MCPLogger(process.env.MCP_LOG_DIR);

