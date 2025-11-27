#!/usr/bin/env tsx

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

import { MongoClient, Db, ObjectId } from 'mongodb';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface ScenarioMetadata {
  name: string;
  description?: string;
}

type ScenarioMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

interface StateAssertion {
  collection: string;
  query: Record<string, JsonValue>;
  match: Record<string, JsonValue>;
}

interface ActionExpectation {
  order: number;
  tool: string;
  arguments?: Record<string, JsonValue>;
  required?: boolean;
  state_assertions?: StateAssertion[];
}

interface ScenarioDefinition {
  metadata: ScenarioMetadata;
  conversation: ScenarioMessage[];
  expectations?: {
    actions?: ActionExpectation[];
    state_assertions?: StateAssertion[];
  };
  seed?: {
    mongo_dump?: string;
  };
}

interface ObservedAction {
  order: number;
  tool: string;
  arguments: Record<string, JsonValue> | undefined;
  result?: Record<string, JsonValue>;
  raw?: Record<string, JsonValue>;
}

interface ScenarioRunResult {
  name: string;
  passed: boolean;
  errors: string[];
  observedActionsPath?: string;
  transcriptPath?: string;
}

interface RunOptions {
  ignoreExpectations?: boolean;
}

interface CliArgs {
  scenario?: string;
  bail: boolean;
  list: boolean;
  ignoreExpectations: boolean;
}

interface MongoContext {
  client: MongoClient;
  db: Db;
  uri: string;
  dbName: string;
  stop: () => Promise<void>;
}

interface TranscriptEntry {
  timestamp: string;
  role: string;
  content: string;
  source: string;
}

interface CodexEvent {
  type: string;
  item?: {
    id: string;
    type: string;
    text?: string;
    server?: string;
    tool?: string;
    arguments?: Record<string, JsonValue>;
    result?: { content?: Array<{ type: string; text?: string }> };
    error?: string | null;
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_ROOT = __dirname;
const CHAT_TESTS_DIR = path.join(TEST_ROOT, 'chat-tests');
const LOGS_DIR = path.join(TEST_ROOT, 'logs');
const REPO_ROOT = path.resolve(TEST_ROOT, '../../..');
const MCP_SERVER_ENTRY = path.join(REPO_ROOT, 'dist/index.js');
const CODEX_BIN = process.env.CODEX_BIN || 'codex';
const MCP_HTTP_PORT = parseInt(process.env.LLM_SMOKE_MCP_PORT || '3002', 10);
const MCP_HTTP_URL = process.env.LLM_SMOKE_MCP_URL || `http://127.0.0.1:${MCP_HTTP_PORT}/`;
const MONGO_URI = process.env.LLM_SMOKE_MONGO_URI || 'mongodb://127.0.0.1:27017';
const MONGO_DB_NAME = process.env.LLM_SMOKE_DB_NAME || 'health_record_test';

async function main() {
  const args = parseArgs();
  const scenarios = await discoverScenarioDirs(args.scenario);
  if (!scenarios.length) {
    console.error('No scenarios found.');
    process.exit(1);
  }

  if (args.list) {
    for (const scenario of scenarios) {
      console.log(path.basename(scenario));
    }
    return;
  }

  await fsp.mkdir(LOGS_DIR, { recursive: true });
  const results: ScenarioRunResult[] = [];

  for (const scenarioDir of scenarios) {
    const scenarioName = path.basename(scenarioDir);
    console.log(`\n🧪 Running scenario: ${scenarioName}`);
    try {
      const result = await runScenario(scenarioDir, { ignoreExpectations: args.ignoreExpectations });
      results.push(result);
      console.log(result.passed ? `✅ ${scenarioName} passed` : `❌ ${scenarioName} failed`);
      if (!result.passed && args.bail) {
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Scenario ${scenarioName} crashed: ${message}`);
      results.push({ name: scenarioName, passed: false, errors: [message] });
      if (args.bail) {
        break;
      }
    }
  }

  const failed = results.filter((r) => !r.passed);
  if (failed.length) {
    console.error(`\n${failed.length}/${results.length} scenarios failed.`);
    failed.forEach((r) => console.error(`- ${r.name}: ${r.errors.join('; ')}`));
    process.exit(1);
  } else {
    console.log(`\n✅ All ${results.length} scenarios passed.`);
  }
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = { bail: false, list: false, ignoreExpectations: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--scenario' && args[i + 1]) {
      parsed.scenario = args[i + 1];
      i += 1;
    } else if (arg === '--bail') {
      parsed.bail = true;
    } else if (arg === '--list') {
      parsed.list = true;
    } else if (arg === '--no-expect' || arg === '--no-expectations') {
      parsed.ignoreExpectations = true;
    }
  }

  return parsed;
}

async function discoverScenarioDirs(single?: string): Promise<string[]> {
  const entries = await fsp.readdir(CHAT_TESTS_DIR, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(CHAT_TESTS_DIR, entry.name));
  if (single) {
    return dirs.filter((dir) => path.basename(dir) === single);
  }
  return dirs;
}

async function runScenario(scenarioDir: string, options?: RunOptions): Promise<ScenarioRunResult> {
  const scenario = await loadScenario(scenarioDir);
  const scenarioName = scenario.metadata.name ?? path.basename(scenarioDir);
  const scenarioLogsDir = path.join(LOGS_DIR, scenarioName);
  await fsp.mkdir(scenarioLogsDir, { recursive: true });

  const transcriptPath = path.join(scenarioLogsDir, 'transcript.ndjson');
  const transcriptStream = fs.createWriteStream(transcriptPath, { flags: 'w' });

  const observedActions: ObservedAction[] = [];
  const errors: string[] = [];

  let mongo: MongoContext | undefined;
  let serverProcess: ChildProcessWithoutNullStreams | undefined;

  try {
    mongo = await createMongoContext();
    if (scenario.seed?.mongo_dump) {
      await seedMongoFromFile(mongo.db, path.join(scenarioDir, scenario.seed.mongo_dump));
    }

    serverProcess = await startMcpServer({ mongoUri: mongo.uri, dbName: mongo.dbName });

    const codexResult = await runCodexSession(buildPrompt(scenario.conversation));

    writeTranscriptEntries(
      transcriptStream,
      scenario.conversation.map((msg) => ({
        timestamp: new Date().toISOString(),
        role: msg.role,
        content: msg.content,
        source: 'scenario',
      }))
    );
    writeTranscriptEntries(transcriptStream, codexResult.transcript);

    observedActions.push(...codexResult.actions);
    const actionsPath = path.join(scenarioLogsDir, 'actions.json');
    await fsp.writeFile(
      actionsPath,
      JSON.stringify({ scenario: scenarioName, actions: observedActions }, null, 2)
    );

    if (!options?.ignoreExpectations) {
      const expectationErrors = await evaluateExpectations({ scenario, observedActions, db: mongo.db });
      errors.push(...expectationErrors);
    }
  } finally {
    if (transcriptStream.writable) {
      transcriptStream.end();
    }
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
    if (mongo) {
      await mongo.stop().catch(() => {});
    }
  }

  return {
    name: scenarioName,
    passed: options?.ignoreExpectations ? true : errors.length === 0,
    errors,
    transcriptPath,
    observedActionsPath: path.join(scenarioLogsDir, 'actions.json'),
  };
}

function buildPrompt(messages: ScenarioMessage[]): string {
  return messages
    .map((msg) => {
      const prefix = msg.role === 'system' ? 'System' : msg.role === 'assistant' ? 'Assistant' : 'User';
      return `${prefix}:
${msg.content}`;
    })
    .join('\n\n');
}

async function runCodexSession(prompt: string): Promise<{ transcript: TranscriptEntry[]; actions: ObservedAction[] }> {
  return new Promise((resolve, reject) => {
    const args = ['exec', '--json', '--skip-git-repo-check', '-'];
    const child = spawn(CODEX_BIN, args, { cwd: REPO_ROOT, stdio: ['pipe', 'pipe', 'pipe'] });

    const transcript: TranscriptEntry[] = [];
    const actions: ObservedAction[] = [];
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let actionCounter = 0;

    child.stdin.write(prompt);
    child.stdin.end();

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      let idx = stdoutBuffer.indexOf('\n');
      while (idx !== -1) {
        const line = stdoutBuffer.slice(0, idx).trim();
        stdoutBuffer = stdoutBuffer.slice(idx + 1);
        if (line) {
          processCodexEvent(line, transcript, actions, () => ++actionCounter);
        }
        idx = stdoutBuffer.indexOf('\n');
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString();
    });

    child.on('error', (error) => reject(error));

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderrBuffer || `codex exited with status ${code}`));
        return;
      }
      resolve({ transcript, actions });
    });
  });
}

function processCodexEvent(
  line: string,
  transcript: TranscriptEntry[],
  actions: ObservedAction[],
  nextActionOrder: () => number
): void {
  let event: CodexEvent;
  try {
    event = JSON.parse(line);
  } catch {
    return;
  }

  if (event.type !== 'item.completed' || !event.item) {
    return;
  }

  const { item } = event;
  if (item.type === 'agent_message' && item.text) {
    transcript.push({
      timestamp: new Date().toISOString(),
      role: 'assistant',
      content: item.text,
      source: 'codex',
    });
  } else if (item.type === 'mcp_tool_call' && item.tool) {
    const order = nextActionOrder();
    actions.push({
      order,
      tool: item.tool,
      arguments: item.arguments,
      result: extractToolResult(item),
      raw: {
        item_id: item.id,
        server: item.server ?? '',
      },
    });

    const textBlocks =
      item.result?.content?.map((block) => ('text' in block && block.text ? block.text : '')).filter(Boolean).join('\n') ??
      '';
    if (textBlocks) {
      transcript.push({
        timestamp: new Date().toISOString(),
        role: 'tool',
        content: textBlocks,
        source: item.tool,
      });
    }
  }
}

function extractToolResult(item?: CodexEvent['item']): Record<string, JsonValue> | undefined {
  const text = item?.result?.content?.find((block) => 'text' in block && block.text)?.text;
  return text ? { text } : undefined;
}

async function createMongoContext(): Promise<MongoContext> {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(MONGO_DB_NAME);
  await db.dropDatabase().catch(() => {});

  return {
    client,
    db,
    uri: MONGO_URI,
    dbName: MONGO_DB_NAME,
    stop: async () => {
      await client.close().catch(() => {});
    },
  };
}

async function seedMongoFromFile(db: Db, seedPath: string): Promise<void> {
  const raw = await fsp.readFile(seedPath, 'utf-8');
  const payload = JSON.parse(raw) as Record<string, any[]>;

  for (const [collectionName, docs] of Object.entries(payload)) {
    if (!Array.isArray(docs) || !docs.length) {
      continue;
    }
    const normalizedDocs = docs.map((doc) => {
      const copy: Record<string, any> = structuredClone(doc);
      if (typeof copy._id === 'string' && ObjectId.isValid(copy._id)) {
        copy._id = new ObjectId(copy._id);
      }
      return copy;
    });
    await db.collection(collectionName).insertMany(normalizedDocs);
  }
}

async function startMcpServer(options: { mongoUri: string; dbName: string }) {
  if (!fs.existsSync(MCP_SERVER_ENTRY)) {
    throw new Error(`Cannot find MCP server entry at ${MCP_SERVER_ENTRY}. Run npm run build.`);
  }

  const env = {
    ...process.env,
    MONGO_URI: options.mongoUri,
    HEALTH_RECORD_DB_NAME: options.dbName,
    MCP_TRANSPORT: 'http',
    MCP_PORT: String(MCP_HTTP_PORT),
    MCP_HTTP_ENABLE_JSON: 'true',
  };

  const child = spawn(process.execPath, [MCP_SERVER_ENTRY], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  await waitForServerReady(MCP_HTTP_URL, 12000);

  return child;
}

async function waitForServerReady(url: string, timeoutMs = 8000): Promise<void> {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const ok = await tryConnect(host, port);
    if (ok) {
      return;
    }
    await delay(200);
  }

  throw new Error(`Timed out waiting for MCP server at ${url}`);
}

async function tryConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function evaluateExpectations(options: {
  scenario: ScenarioDefinition;
  observedActions: ObservedAction[];
  db: Db;
}): Promise<string[]> {
  const { scenario, observedActions, db } = options;
  const errors: string[] = [];
  const expectedActions = [...(scenario.expectations?.actions ?? [])].sort((a, b) => a.order - b.order);
  const usedIndices = new Set<number>();

  for (const expected of expectedActions) {
    let observedIndex = -1;
    let observed: ObservedAction | undefined;
    let lastArgumentMismatch: string | undefined;

    for (let idx = 0; idx < observedActions.length; idx += 1) {
      const action = observedActions[idx];
      if (usedIndices.has(idx) || action.order < expected.order || action.tool !== expected.tool) {
        continue;
      }
      if (expected.arguments) {
        const match = deepPartialMatch(expected.arguments, action.arguments ?? {});
        if (!match.ok) {
          lastArgumentMismatch = match.reason;
          continue;
        }
      }
      observedIndex = idx;
      observed = action;
      break;
    }

    if (!observed) {
      if (expected.required === false) {
        continue;
      }
      if (lastArgumentMismatch) {
        errors.push(`Argument mismatch for ${expected.tool}: ${lastArgumentMismatch}`);
      } else {
        errors.push(`Missing action with order ${expected.order} (${expected.tool})`);
      }
      continue;
    }
    usedIndices.add(observedIndex);

    if (expected.state_assertions?.length) {
      for (const assertion of expected.state_assertions) {
        const query = convertObjectIdFields(assertion.query);
        const doc = await db.collection(assertion.collection).findOne(query);
        if (!doc) {
          errors.push(
            `State assertion failed: no document in ${assertion.collection} matching ${JSON.stringify(
              assertion.query
            )}`
          );
          continue;
        }
        const matchDoc = serializeDocument(doc);
        const match = deepPartialMatch(assertion.match, matchDoc);
        if (!match.ok) {
          errors.push(`State assertion mismatch in ${assertion.collection}: ${match.reason}`);
        }
      }
    }
  }

  if (scenario.expectations?.state_assertions?.length) {
    for (const assertion of scenario.expectations.state_assertions) {
      const query = convertObjectIdFields(assertion.query);
      const doc = await db.collection(assertion.collection).findOne(query);
      if (!doc) {
        errors.push(
          `State assertion failed: no document in ${assertion.collection} matching ${JSON.stringify(assertion.query)}`
        );
        continue;
      }
      const matchDoc = serializeDocument(doc);
      const match = deepPartialMatch(assertion.match, matchDoc);
      if (!match.ok) {
        errors.push(`State assertion mismatch in ${assertion.collection}: ${match.reason}`);
      }
    }
  }

  return errors;
}

type RegexDescriptor = { $regex: string; $flags?: string };

function isRegexDescriptor(value: JsonValue): value is RegexDescriptor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return typeof (value as Record<string, JsonValue>).$regex === 'string';
}

function formatRegex(descriptor: RegexDescriptor): string {
  return `/${descriptor.$regex}/${descriptor.$flags ?? ''}`;
}

function deepPartialMatch(expected: JsonValue, actual: JsonValue): { ok: boolean; reason?: string } {
  if (isRegexDescriptor(expected)) {
    const actualText = typeof actual === 'string' ? actual : undefined;
    if (actualText === undefined) {
      return {
        ok: false,
        reason: `Expected value matching ${formatRegex(expected)}, got ${JSON.stringify(actual)}`,
      };
    }
    let regex: RegExp;
    try {
      regex = new RegExp(expected.$regex, expected.$flags);
    } catch (error) {
      return {
        ok: false,
        reason: `Invalid regex ${formatRegex(expected)}: ${(error as Error).message}`,
      };
    }
    return regex.test(actualText)
      ? { ok: true }
      : { ok: false, reason: `Value "${actualText}" did not match ${formatRegex(expected)}` };
  }

  if (typeof expected !== 'object' || expected === null) {
    return Object.is(expected, actual)
      ? { ok: true }
      : { ok: false, reason: `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}` };
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return { ok: false, reason: `Expected array, got ${typeof actual}` };
    }
    if (expected.length > actual.length) {
      return { ok: false, reason: `Expected array with at least ${expected.length} entries` };
    }
    for (let i = 0; i < expected.length; i += 1) {
      const result = deepPartialMatch(expected[i], actual[i]);
      if (!result.ok) {
        return { ok: false, reason: `Array item ${i}: ${result.reason}` };
      }
    }
    return { ok: true };
  }

  if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
    return { ok: false, reason: `Expected object, got ${typeof actual}` };
  }

  for (const [key, value] of Object.entries(expected)) {
    if (!(key in (actual as Record<string, JsonValue>))) {
      return { ok: false, reason: `Missing key \"${key}\"` };
    }
    const result = deepPartialMatch(value, (actual as Record<string, JsonValue>)[key]);
    if (!result.ok) {
      return { ok: false, reason: `Key \"${key}\": ${result.reason}` };
    }
  }
  return { ok: true };
}

function convertObjectIdFields(query: Record<string, JsonValue>): Record<string, any> {
  const converted: Record<string, any> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (isRegexDescriptor(value)) {
        converted[key] = new RegExp(value.$regex, value.$flags);
      } else {
        converted[key] = convertObjectIdFields(value as Record<string, JsonValue>);
      }
    } else if (typeof value === 'string' && ObjectId.isValid(value) && shouldConvertToObjectId(key)) {
      converted[key] = new ObjectId(value);
    } else {
      converted[key] = value;
    }
  }
  return converted;
}

function shouldConvertToObjectId(key: string): boolean {
  return key === '_id' || key.endsWith('_id');
}

function serializeDocument(doc: Record<string, any>): Record<string, JsonValue> {
  const output: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (value instanceof ObjectId) {
      output[key] = value.toHexString();
    } else {
      output[key] = value as JsonValue;
    }
  }
  return output;
}

async function loadScenario(scenarioDir: string): Promise<ScenarioDefinition> {
  const scenarioPath = path.join(scenarioDir, 'scenario.json');
  const raw = await fsp.readFile(scenarioPath, 'utf-8');
  const scenario = JSON.parse(raw) as ScenarioDefinition;
  scenario.conversation ??= [];
  scenario.expectations ??= { actions: [] };
  scenario.expectations.actions ??= [];
  return scenario;
}

function writeTranscriptEntries(stream: fs.WriteStream, entries: TranscriptEntry[]): void {
  for (const entry of entries) {
    stream.write(`${JSON.stringify(entry)}\n`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
