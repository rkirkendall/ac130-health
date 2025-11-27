# LLM Smoke Tests

This suite replays deterministic conversations against a local MCP server using the OpenAI Codex CLI (which natively speaks MCP) and validates the tools the model invokes.

## Layout
```
src/@tests/llm-smoke
├── chat-tests/
│   └── <scenario>/
│       ├── scenario.json   # prompt + expectations
│       └── seed.json       # optional Mongo dump loaded before each run
├── logs/               # generated artifacts (actions + transcripts)
└── run-chat-tests.ts   # harness entry point (Codex-based)
```

## Prerequisites

1. Install the Codex CLI (one-time):
   ```bash
   npm install -g @openai/codex
   ```
2. Register the AC130 MCP server with Codex (one-time):
   ```bash
   codex mcp add health-record-mcp --url http://127.0.0.1:3002/
   ```
   You can inspect your configuration with `codex mcp list`. The harness will automatically start the MCP server on port `3002`, so make sure no other service is listening there.
3. Ensure the supporting Docker services are running (MongoDB + Presidio):
   ```bash
   docker compose --profile mcp up -d mongodb presidio-analyzer
   ```
4. Run `npm install` inside `ac130/` so the harness and MCP server dependencies are installed.

At runtime, the harness will:

- Connect to the local MongoDB instance (default `mongodb://127.0.0.1:27017`), drop the `health_record_test` database, and seed it with each scenario’s `seed.json`.
- Launch the MCP server (`dist/index.js`) in HTTP mode on `http://127.0.0.1:3002/`, pointing it at that test database.
- Start a Codex session (`codex exec --json …`) with the scenario’s conversation as the opening prompt.
- Capture Codex’s JSON event stream so actions and transcripts match what a real MCP client sees.

## Scenario JSON Format
Each `scenario.json` follows this shape:

```json
{
  "metadata": {
    "name": "human-readable identifier",
    "description": "what this scenario covers"
  },
  "conversation": [
    { "role": "system", "content": "optional system priming" },
    { "role": "user", "content": "first user utterance" },
    { "role": "assistant", "content": "(optional) prior context" }
  ],
  "expectations": {
    "actions": [
      {
        "order": 1,
        "tool": "list_conditions",
        "arguments": { "dependent_id": "DEPENDENT_SEED_1" },
        "required": true,
        "state_assertions": [
          {
            "collection": "conditions",
            "query": { "condition_id": "COND_SEED_1" },
            "match": { "status": "inactive" }
          }
        ]
      }
    ]
  },
  "seed": {
    "mongo_dump": "seed.json"   // optional
  }
}
```

Key points:
- `conversation` represents the initial turn history handed to Codex. It supports `system`, `user`, and `assistant` roles.
- `expectations.actions` is an ordered list of tool invocations to assert. Arguments are compared using deep partial matching (the test can pin only the fields that matter).
- To allow flexible string matching, set a field to `{ "$regex": "pattern", "$flags": "i" }`. This passes if the actual value matches the supplied regular expression (flags are optional and mirror JavaScript’s `RegExp` flags).
- `state_assertions` lets a step declare Mongo collection + query + expected document shape after that action completes.
- `expectations.state_assertions` (top-level) can be used when you only care about the final database state. The harness will evaluate those assertions after the scenario finishes, regardless of the specific tool calls taken.
- `seed.mongo_dump` points at a JSON file in the same directory loaded into the test Mongo database before the conversation starts.

## Observed MCP Log Format
For every scenario the harness writes `logs/<scenario>/actions.json` so assertions can diff the expected/observed calls:

```json
{
  "scenario": "scenario-one",
  "model": "gpt-4.1-mini",
  "actions": [
    {
      "order": 1,
      "type": "tool_call",
      "tool": "list_conditions",
      "arguments": {
        "dependent_id": "DEPENDENT_SEED_1"
      },
      "raw": {
        "id": "call_ABCD",
        "tool_call_id": "...",
        "response_ms": 812
      }
    }
  ],
  "transcript_file": "logs/scenario-one/transcript.ndjson"
}
```

- `order` reflects the sequence observed at runtime (used when comparing with `expectations.actions[*].order`).
- `arguments` is the parsed JSON passed to the MCP tool.
- `result` includes the first text block returned by the MCP tool (if any). This mirrors the `item.result.content` payload emitted by Codex.
- `raw` stores metadata straight from the Codex MCP event (useful when debugging).
- A companion NDJSON transcript preserves the scenario priming, Codex agent messages, and tool outputs.

The harness will diff `expectations.actions` against `actions.json` using deep partial matching and emit a summary table. Until the harness is fully implemented, these files document the contract that the script will satisfy.

## Running the Harness

1. Ensure dependencies are installed (`npm install`) and the MCP server is built (`npm run build`).
2. Install Codex (see prerequisites above) and confirm `codex mcp list` shows `health-record-mcp`.
3. Run the suite:

   ```bash
   npm run test:llm            # run all scenarios
   npm run test:llm -- --scenario scenario-one
   npm run test:llm -- --list               # list scenarios only
   npm run test:llm -- --no-expect          # skip expectation checks (observation mode)
   ```

- Drops and seeds the `health_record_test` database before each run.
- Launches the MCP server (`dist/index.js`) in HTTP mode on `http://127.0.0.1:3002/`.
- Executes a Codex session with the scenario conversation and streams the JSON output so transcripts/actions match what a real MCP-aware client sees.
- Records every MCP tool invocation plus the transcript under `src/@tests/llm-smoke/logs/<scenario>/`.

Pass `--no-expect` (or `--no-expectations`) to skip expectation checks when you just want to observe the model’s behavior and inspect the generated logs before finalizing assertions. After a run completes you can inspect the test database visually at `http://localhost:3001/t`, which renders the standard webapp UI backed by the latest `health_record_test` data.

### Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `LLM_SMOKE_MONGO_URI` | `mongodb://127.0.0.1:27017` | Connection string the harness uses when seeding/tearing down the test database. |
| `LLM_SMOKE_DB_NAME` | `health_record_test` | Database dropped/seeds before each scenario (also used by the `/t` webapp route). |
| `LLM_SMOKE_MCP_PORT` | `3002` | HTTP port reserved for the MCP server during tests. |
| `LLM_SMOKE_MCP_URL` | `http://127.0.0.1:3002/` | Full URL communicated to Codex. |
