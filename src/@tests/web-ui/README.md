## Web UI Playwright Suite

The specs under `src/@tests/web-ui` exercise the Next.js dashboard running at `http://localhost:3001`. They assume:

1. Docker services for MongoDB + Presidio are running (`docker compose --profile mcp up -d mongodb presidio-analyzer`).
2. The Next.js app (`ac130/webapp`) is running locally (`npm run dev`).
3. The site is served with access to the dedicated test database (`health_record_test`), which is always selected by sending the `x-ac130-use-test-db: 1` header.

### Commands

```bash
# Run all specs headlessly
npm run test:web

# Open the Playwright UI mode
npm run test:web:ui
```

### Configuration

- `PLAYWRIGHT_BASE_URL` (default `http://127.0.0.1:3001/t`) controls the page URL the tests open.
- `PLAYWRIGHT_API_BASE_URL` (default `http://127.0.0.1:3001`) controls the API endpoint used for server-side assertions.
- `PLAYWRIGHT_HEADED=1` forces headed browser runs locally.
- `LLM_SMOKE_MONGO_URI` / `WEBAPP_TEST_DB_NAME` mirror the harness defaults and control where the test data is stored.

Global setup invokes `resetTestDatabase()` with the Scenario One seed (`src/@tests/llm-smoke/chat-tests/scenario-one/seed.json`) before the Playwright run starts. Individual specs also call `resetTestDatabase()` in `test.beforeEach()` so every test starts from the same fixture data. Pass a custom `seedPath` if you want a different setup (see below).

### Recording new specs

Use Playwright’s `codegen` to capture UI flows:

```bash
# Creates/overwrites src/@tests/web-ui/tests/new.spec.ts
npx playwright codegen http://127.0.0.1:3001/t \
  --browser=chromium \
  --output src/@tests/web-ui/tests/new.spec.ts
```

While the recorder is open, interact with the app. The script is written to the file specified by `--output`; click the save icon (or close the window) when you’re done. You can also launch `npm run test:web:ui` and use the built-in “Record” button to append to an existing spec.

Shortcut: run `npm run record:web` to automatically seed the Scenario One data, then open codegen writing to `src/@tests/web-ui/tests/dependents.spec.ts`. Override inputs as needed:

```bash
npm run record:web -- --seed src/@tests/llm-smoke/chat-tests/scenario-one/seed.json --output src/@tests/web-ui/tests/dependents.spec.ts
```

- `--seed` points at any seed JSON file (defaults to Scenario One).
- `--output` controls the generated spec path (defaults to `dependents.spec.ts`).
- You can also set env vars `PLAYWRIGHT_SEED` / `PLAYWRIGHT_CODEGEN_OUTPUT`.

### Seeding data (shared with llm-smoke)

`resetTestDatabase()` understands the same JSON dumps used by the Codex harness (e.g., `src/@tests/llm-smoke/chat-tests/scenario-one/seed.json`). Pass a relative path:

```ts
test.beforeEach(async () => {
  await resetTestDatabase({
    seedPath: 'src/@tests/llm-smoke/chat-tests/scenario-one/seed.json',
  });
});
```

You can also set `PLAYWRIGHT_SEED=...` and teach `global-setup.ts` to read that env var if you want the entire suite to start from a shared dataset.
