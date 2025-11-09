# AC130 Health MCP Server

A Model Context Protocol (MCP) server for managing longitudinal medical records. AC130 Health provides tools to create, update, and retrieve patient health information including visits, prescriptions, lab results, and treatments, with an automatically maintained active health summary.

## Features

- **Patient Management**: Track patients with relationship field (e.g., "dad", "mom", "spouse")
- **Healthcare Entities**: Manage providers, visits, prescriptions, labs, treatments, conditions, allergies, immunizations, vital signs, and procedures
- **Active Health Summary**: Auto-injected MCP resource that provides current, relevant health context
- **Bulk Creation**: All create tools accept single objects or arrays for efficient batch data entry
- **MongoDB Storage**: All data persisted in MongoDB with proper indexing
- **Type-Safe**: Built with TypeScript and Zod validation

## Setup

### Option 1: Run with Docker

```bash
# Start MongoDB and MCP server
docker compose up -d mongodb mcp-server

# Use the MCP server container (see DOCKER.md for details)
./scripts/run-mcp-docker.sh
```

For Docker troubleshooting, see the script: `scripts/run-mcp-docker.sh`

### Option 2: Run from Source (Development)

```bash
# Install dependencies
npm install

# Start MongoDB with Docker
docker compose up -d mongodb

# Run MCP server in development mode
npm run dev
```

### Claude Desktop Configuration

Add the MCP server to your Claude Desktop or Cursor config:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Cursor**: `~/.cursor/mcp.json`

**For Docker (Option 1)**:
```json
{
  "mcpServers": {
    "ac130-health-mcp": {
      "command": "/absolute/path/to/ac130-2/scripts/run-mcp-docker.sh",
      "args": []
    }
  }
}
```

**For Development (Option 2)**:
```json
{
  "mcpServers": {
    "ac130-health-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/ac130-2/node_modules/.bin/tsx",
        "/absolute/path/to/ac130-2/src/index.ts"
      ],
      "env": {
        "MONGO_URI": "mongodb://localhost:27017",
        "AC130_HEALTH_DB_NAME": "ac130_health"
      }
    }
  }
}
```

**Important**: Replace `/absolute/path/to/ac130-2` with your actual project path. Restart Claude Desktop after making changes.

## Available Tools

All resources support `create_*`, `update_*`, `get_*`, and `list_*` operations (where applicable):

- **Patients**: Create, update, get, list by relationship
- **Providers**: Create, update, get
- **Visits**: Create, update, get
- **Prescriptions**: Create, update, get (with status: active/stopped/completed)
- **Labs**: Create, update, get (with status: pending/final/corrected)
- **Treatments**: Create, update, get
- **Conditions**: Create, update, get (with status: active/resolved/chronic)
- **Allergies**: Create, update, get
- **Immunizations**: Create, update, get
- **Vital Signs**: Create, update, get
- **Procedures**: Create, update, get
- **Imaging**: Create, update, get
- **Insurance**: Create, update, get
- **Health Summary**: Update active health summary for a patient

## MCP Resources

### Active Health Summary
- **URI**: `summary://patient/{patient_id}`
- Automatically injected into context when chatting about a patient
- Provides concise, current health information (conditions, medications, recent visits, pending labs, upcoming follow-ups)

## Example Usage

**Recording a visit:**
```
"My dad went to see Dr. Smith today for his blood pressure check. 
They increased his Lisinopril to 20mg."
```

**Bulk data entry:**
```
"I just uploaded my dad's hospital discharge summary PDF. 
Parse it and save all the relevant information."
```

**Clinical questions:**
```
"Is his current blood pressure medication dosage normal for someone his age?"
```

## Documentation

- [QUICKSTART.md](./QUICKSTART.md) - Get started in 5 minutes
- [TESTING.md](./TESTING.md) - Testing with MCP Inspector

## Development

```bash
npm run build        # Build TypeScript
npm start            # Production mode (requires build first)
```

Test with MCP Inspector:
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Design Notes

- **Active Health Summary**: Auto-injected MCP resource provides token-efficient, current context without bulk retrieval
- **No bulk get tool**: Specific tools fetch details as needed; summary provides essential context
- **Bulk creation**: All create tools accept arrays for efficient batch data entry (perfect for PDF parsing)

## License

MIT
