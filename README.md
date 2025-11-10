# Health Record MCP Server

A Model Context Protocol (MCP) server for managing longitudinal medical records. This server provides tools to create, update, and retrieve patient health information including visits, prescriptions, lab results, and treatments, with an automatically maintained active health summary.

## Features

- **Patient Management**: Track patients with relationship field (e.g., "dad", "mom", "spouse")
- **Healthcare Entities**: Manage providers, visits, prescriptions, labs, and treatment plans
- **Active Health Summary**: Auto-injected MCP resource that provides current, relevant health context
- **Bulk Creation**: All create tools accept single objects or arrays for efficient batch data entry (perfect for PDF parsing!)
- **MongoDB Storage**: All data persisted in MongoDB with proper indexing
- **Type-Safe**: Built with TypeScript and Zod validation

## Prerequisites

- Node.js 18 or higher
- MongoDB (local or MongoDB Atlas)
- Claude Desktop or another MCP-compatible client

## Installation

### Option 1: Docker (Recommended)

1. Clone or download this repository

2. Start MongoDB with Docker:
```bash
docker compose up -d mongodb
```

3. Run the MCP server locally:
```bash
npm install
npm run dev
```

See [DOCKER.md](./DOCKER.md) for complete Docker documentation.

### Option 2: Local Installation

1. Clone or download this repository

2. Install MongoDB locally (see MongoDB Setup section below)

3. Install dependencies:
```bash
npm install
```

4. Create a `.env` file in the root directory:
```bash
cp .env.example .env
```

5. Configure your MongoDB connection in `.env`:
```
MONGO_URI=mongodb://localhost:27017
HEALTH_RECORD_DB_NAME=health_record
```

6. Build the project:
```bash
npm run build
```

## Usage

### Running the Server

For development:
```bash
npm run dev
```

For production:
```bash
npm start
```

### Claude Desktop Integration

**Quick Setup**: Copy the included `mcp.json` to your Claude Desktop or Cursor config:
- **Claude Desktop**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Cursor**: `~/.cursor/mcp.json`

Or manually add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**Recommended (with tsx for development)**:
```json
{
  "mcpServers": {
    "health-record-mcp": {
      "command": "/path/to/your/.nvm/versions/node/v24.5.0/bin/node",
      "args": [
        "/path/to/health-record-mcp/node_modules/.bin/tsx",
        "/path/to/health-record-mcp/src/index.ts"
      ],
      "env": {
        "MONGO_URI": "mongodb://localhost:27017",
        "HEALTH_RECORD_DB_NAME": "health_record"
      }
    }
  }
}
```

**Production (with compiled build)**:
```json
{
  "mcpServers": {
    "health-record-mcp": {
      "command": "node",
      "args": ["/path/to/health-record-mcp/dist/index.js"],
      "env": {
        "MONGO_URI": "mongodb://localhost:27017",
        "HEALTH_RECORD_DB_NAME": "health_record"
      }
    }
  }
}
```

**Important**: 
- Replace `/path/to/` with actual paths on your system
- If using Docker for MongoDB: Ensure `docker compose up -d mongodb` is running
- If using local MongoDB: Ensure `brew services start mongodb-community` is running

Restart Claude Desktop after making configuration changes.

## Available Tools

### Patient Tools
- `create_patient` - Create one or more patients (accepts single object or array)
- `update_patient` - Update patient information
- `get_patient` - Retrieve patient by ID
- `list_patients` - List/search patients by relationship or get all patients

### Provider Tools
- `create_provider` - Create a healthcare provider record
- `update_provider` - Update provider information
- `get_provider` - Retrieve provider by ID

### Visit Tools
- `create_visit` - Create one or more visits (accepts single object or array)
- `update_visit` - Update visit details
- `get_visit` - Retrieve visit by ID

### Prescription Tools
- `create_prescription` - Create one or more prescriptions (accepts single object or array)
- `update_prescription` - Update prescription (including status)
- `get_prescription` - Retrieve prescription by ID

### Lab Tools
- `create_lab` - Create one or more lab records (accepts single object or array)
- `update_lab` - Update lab information
- `get_lab` - Retrieve lab by ID

### Treatment Tools
- `create_treatment` - Create a treatment plan
- `update_treatment` - Update treatment plan
- `get_treatment` - Retrieve treatment by ID

### Condition Tools
- `create_condition` - Create one or more conditions (accepts single object or array)
- `update_condition` - Update condition (including status)
- `get_condition` - Retrieve condition by ID

### Allergy Tools
- `create_allergy` - Create one or more allergies (accepts single object or array)
- `update_allergy` - Update allergy information
- `get_allergy` - Retrieve allergy by ID

### Immunization Tools
- `create_immunization` - Create one or more immunizations (accepts single object or array)
- `update_immunization` - Update immunization record
- `get_immunization` - Retrieve immunization by ID

### Vital Signs Tools
- `create_vital_signs` - Create one or more vital signs records (accepts single object or array)
- `update_vital_signs` - Update vital signs
- `get_vital_signs` - Retrieve vital signs by ID

### Health Summary
- `update_health_summary` - Update the active health summary for a patient

## MCP Resources

### Active Health Summary
- **URI**: `summary://patient/{patient_id}`
- **Description**: Automatically injected into context when chatting about a patient
- **Purpose**: Provides concise, current health information without redundant full-record retrieval

The active health summary is a living document that should be updated by the LLM as new information is captured. It includes:
- Current conditions
- Active medications
- Recent visits
- Pending labs
- Upcoming follow-ups

## Example Workflows

### Recording a Visit

```
User: "My dad went to see Dr. Smith today for his blood pressure check. 
       They increased his Lisinopril to 20mg."

Assistant will:
1. Create/get patient (with relationship="dad")
2. Create/get provider (Dr. Smith)
3. Create visit record
4. Update prescription (Lisinopril)
5. Update health summary with current information
```

### Bulk Data Entry from PDF

```
User: "I just uploaded my dad's hospital discharge summary PDF. 
       Parse it and save all the relevant information."

Assistant will:
1. Parse the PDF to extract information
2. Call create_visit with an array of visits
3. Call create_prescription with an array of prescriptions
4. Call create_lab with an array of lab results
5. Call create_condition with an array of diagnoses
6. Update health summary with the new information
```

### Asking a Clinical Question

```
User: "Is his current blood pressure medication dosage normal for someone his age?"

Assistant will:
1. Access the active health summary (auto-injected)
2. Review current medications and conditions
3. Provide informed context based on complete picture
```

## Data Model

### Collections

- `patients` - Patient demographics and relationship
- `providers` - Healthcare providers
- `visits` - Medical visits/encounters
- `prescriptions` - Medication records
- `labs` - Lab orders and results
- `treatments` - Treatment plans
- `conditions` - Conditions and diagnoses
- `allergies` - Drug, food, and environmental allergies
- `immunizations` - Vaccination history
- `vital_signs` - Blood pressure, heart rate, temperature, weight, etc.
- `active_summaries` - Current health context per patient

### Key Fields

**Patient**
- `relationship`: User's relationship to patient (e.g., "dad", "mom", "spouse", "self")
- `name`, `dob`, `sex`, `contact`

**Prescription**
- `medication_name`, `dose`, `frequency`
- `status`: "active", "stopped", "completed"
- `start_date`, `stop_date`

**Lab**
- `test_name`: e.g., "CBC", "A1C"
- `components`: Array of results with values, units, reference ranges
- `status`: "pending", "final", "corrected"

**Visit**
- `type`: "office", "er", "telehealth", "inpatient", "other"
- `reason`, `notes`, `date`

**Condition**
- `name`: Condition/diagnosis name (e.g., "Type 2 Diabetes")
- `status`: "active", "resolved", "chronic"
- `severity`: "mild", "moderate", "severe"
- `diagnosed_date`, `resolved_date`

## Development

### Project Structure

```
health-record-mcp/
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── db.ts             # MongoDB connection and collections
│   ├── types.ts          # TypeScript types and Zod schemas
│   ├── prompts.ts        # Base prompt definition
│   └── tools/
│       ├── patients.ts   # Patient CRUD operations
│       ├── providers.ts  # Provider CRUD operations
│       ├── visits.ts     # Visit CRUD operations
│       ├── prescriptions.ts  # Prescription CRUD operations
│       ├── labs.ts       # Lab CRUD operations
│       ├── treatments.ts # Treatment CRUD operations
│       ├── conditions.ts # Condition CRUD operations
│       └── summary.ts    # Health summary operations
├── package.json
├── tsconfig.json
└── README.md
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

This will open a web interface where you can:
- List all available tools
- Test tool calls with sample data
- View prompts and resources
- Inspect responses

## MongoDB Setup

### Local MongoDB

Install and run MongoDB locally:
```bash
# macOS (with Homebrew)
brew install mongodb-community
brew services start mongodb-community

# Ubuntu/Debian
sudo apt-get install mongodb
sudo systemctl start mongodb
```

### MongoDB Atlas (Cloud)

1. Create a free account at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create a cluster
3. Get your connection string
4. Update `MONGO_URI` in `.env` with your Atlas connection string

## Design Rationale

### Why Active Health Summary as MCP Resource?

- **Auto-injected**: MCP client fetches it automatically when relevant
- **Token-efficient**: Small, curated context vs. hundreds of historical records
- **Living document**: LLM maintains it, keeps it current and relevant
- **Persistent**: Survives across chat sessions
- **Avoids redundancy**: No need for bulk retrieval when you already have incremental tool results + summary

### Why No `get_medical_record` Tool?

As the conversation progresses, the LLM will have already retrieved specific entities using individual tools. A large "get all" call would:
- Duplicate information already in context
- Waste tokens on irrelevant historical data
- Be slow and expensive as records grow

Instead, the active summary provides the essential current context, and specific tools fetch details as needed.

## Limitations & Future Enhancements

### Current Limitations
- No FHIR compliance (simplified schema)
- Basic deduplication (no sophisticated entity matching)
- No user authentication (single-user/trusted environment)
- No audit trail for changes
- No data export/import

### Potential Enhancements
- FHIR-compliant data model
- Multi-user support with permissions
- Change history and audit logs
- Data import from health records (HL7, FHIR, CSV)
- Reminder/alert system for follow-ups
- Analytics and trend visualization
- Integration with EHR systems

## License

MIT

## Support

For issues or questions, please open an issue on the GitHub repository.
