# AC130 Health MCP Server

## What the Project Is
AC130 Health is a Model Context Protocol (MCP) server that exposes tools for capturing longitudinal health records in MongoDB with an accompanying Next.js viewer for browsing those records locally.

## Why It Exists
Managing family health data is tedious. AC130 Health gives individuals an MCP-native workflow for creating and updating medical records with an always-current active health summary that stays on their own infrastructure.

## Install with Docker
```bash
cd ac130
npm install
./start.sh
```

`start.sh` launches MongoDB, the Dockerized MCP runner, and the optional viewer at http://localhost:3001. When you want Claude/Cursor to talk to the server over stdio, run:

```bash
./scripts/run-mcp-docker.sh
```

`run-mcp-docker.sh` reuses the long-lived container built by Docker (which already runs `npm run build` inside the image) and executes `dist/index.js` inside it. If you change TypeScript source, rebuild the image with `docker compose build mcp-server` so the container picks up the new `dist/`.

### Health Summary Regeneration
- CRUD tool responses now include `_meta.health_summary_sampling` metadata with the context needed to regenerate a patient’s active summary. When an MCP client supports `sampling/createMessage`, the server automatically packages a prompt with the updated records, the prior summary, and the shared outline, then writes the returned text via `update_health_summary`.
- Clients that do not advertise the sampling capability keep working as before—they simply receive the metadata (plus the existing `_meta.suggested_actions` hint) and can choose to handle summary refreshes on their own.
- Session output is mirrored to `mcp.log` whenever you launch the server with `./scripts/run-mcp-docker.sh`, which makes it easier to audit sampling runs during debugging.

## MCP Configuration
With the MCP server running via `./scripts/run-mcp-docker.sh`, point Claude Desktop or Cursor at the script:

```json
{
  "mcpServers": {
    "health-record-mcp": {
      "command": "/absolute/path/to/ac130/scripts/run-mcp-docker.sh"
    }
  }
}
```

Prefer running the server directly on the host instead of inside Docker? Replace the command above with your Node binary plus `npm run dev`.

## Data Schema & MCP Details
### Collections
- `patients`, `providers`, `visits`, `prescriptions`, `labs`, `treatments`, `conditions`, `allergies`, `immunizations`, `vital_signs`, `procedures`, `imaging`, `insurance`, `active_summaries`

### Tools (6 total)
- `create_resource` — insert one or many records for any registered `resource_type`
- `get_resource` — fetch a single record by ID
- `update_resource` — patch fields on an existing record
- `delete_resource` — remove a record by ID
- `list_resource` — enumerate records with optional filters (see schema resources for filter fields)
- `update_health_summary` — maintain the `summary://patient/{patient_id}` resource

Each CRUD tool accepts a `resource_type` drawn from the 13 collections above.

### Prompts & Resources
- Prompts: 1 (`care_manager_base`)
- Resources: 15
  - `summary://patient/{patient_id}` live health summaries
  - `guide://health_summary/outline` authoring guidance
  - `schema://{resource_type}` — JSON payload bundling the create/update/list schemas for that resource type

## Contributing
### Build from Source
1. `npm install`
2. `npm run build` to emit `dist/`
3. `npm start` to run the compiled build, or `npm run dev` for watch mode with `tsx`

When you change prompts or server logic, restart any long-lived MCP process so it picks up the new artifacts.

### Run Tests
AC130 Health uses Node’s test runner through `tsx`. Place `.test.ts` files under `tests/` (or alongside the modules they cover) and run:

```bash
npm test
```

Contributions should include focused unit tests for new behaviours.
