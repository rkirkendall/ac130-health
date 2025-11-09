# Testing AC130 Health MCP Server

This document describes how to test the AC130 Health MCP Server using the MCP Inspector and other methods.

## Prerequisites

- Node.js 18+
- MongoDB running
- AC130 Health MCP Server built (`npm run build`)

## Method 1: MCP Inspector (Recommended)

The MCP Inspector provides a web-based UI for testing MCP servers.

### Installation & Usage

```bash
# Navigate to your project
cd /path/to/ac130-health-mcp

# Run the inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

This will:
1. Start the MCP Inspector web interface
2. Open your browser to `http://localhost:6274` (or similar)
3. Connect to your AC130 Health MCP Server

### What You Can Test

1. **List Tools**: View all available tools with their schemas
2. **Call Tools**: Test individual tool calls with custom parameters
3. **List Prompts**: See the care manager base prompt
4. **List Resources**: View the active health summary resource
5. **Read Resources**: Test fetching a patient's health summary

### Example Test Flow

1. **Create a Patient**
   - Tool: `create_patient`
   - Parameters:
     ```json
     {
       "name": {
         "given": "John",
         "family": "Smith"
       },
       "relationship": "dad",
       "dob": "1955-03-15"
     }
     ```
   - Note the returned `patient_id`

2. **Create a Provider**
   - Tool: `create_provider`
   - Parameters:
     ```json
     {
       "name": "Dr. Sarah Johnson",
       "specialty": "Cardiology",
       "organization": "Heart Health Clinic"
     }
     ```
   - Note the returned `provider_id`

3. **Create a Visit**
   - Tool: `create_visit`
   - Parameters (use IDs from above):
     ```json
     {
       "patient_id": "YOUR_PATIENT_ID",
       "provider_id": "YOUR_PROVIDER_ID",
       "date": "2025-01-15",
       "type": "office",
       "reason": "Annual checkup",
       "notes": "Blood pressure normal, cholesterol slightly elevated"
     }
     ```

4. **Create a Prescription**
   - Tool: `create_prescription`
   - Parameters:
     ```json
     {
       "patient_id": "YOUR_PATIENT_ID",
       "medication_name": "Atorvastatin",
       "dose": "20 mg",
       "frequency": "once daily",
       "start_date": "2025-01-15",
       "status": "active",
       "prescriber_id": "YOUR_PROVIDER_ID"
     }
     ```

5. **Update Health Summary**
   - Tool: `update_health_summary`
   - Parameters:
     ```json
     {
       "patient_id": "YOUR_PATIENT_ID",
       "summary_text": "John Smith, 69 years old. Active Medications: Atorvastatin 20mg daily for cholesterol management. Recent Visit: Annual checkup on 2025-01-15 with Dr. Johnson - BP normal, cholesterol slightly elevated. No pending labs. Follow-up in 6 months."
     }
     ```

6. **Read Health Summary Resource**
   - Resource URI: `summary://patient/YOUR_PATIENT_ID`
   - Should return the summary text you just created

7. **Get Patient**
   - Tool: `get_patient`
   - Parameters:
     ```json
     {
       "patient_id": "YOUR_PATIENT_ID"
     }
     ```

## Method 2: Direct Node Testing

Test the server directly from command line:

```bash
cd /path/to/health-record-mcp
node dist/index.js
```

The server will start and listen on stdio. You should see:
```
Connected to MongoDB
Database indexes created
Health Record MCP Server running on stdio
```

To send test commands, you'd need to send JSON-RPC messages via stdin. This is more complex, so the MCP Inspector is recommended instead.

## Method 3: Integration Testing with Claude Desktop

See [INTEGRATION.md](INTEGRATION.md) for setting up with Claude Desktop, then test:

1. Start a conversation
2. Say: "Create a patient record for my mom"
3. Verify Claude calls the `create_patient` tool
4. Continue with natural language to test other operations

## Automated Testing (Future)

For automated test suites, consider:

```bash
# Unit tests for tool functions
npm test

# Integration tests against test MongoDB instance
npm run test:integration
```

These would require adding test scripts and a test framework like Jest or Vitest.

## Verifying MongoDB Data

Check that data was actually persisted:

```bash
# Connect to MongoDB
mongosh mongodb://localhost:27017/health_record

# Show collections
show collections

# Query patients
db.patients.find().pretty()

# Query visits
db.visits.find().pretty()

# Query active summaries
db.active_summaries.find().pretty()

# Count documents
db.patients.countDocuments()
db.prescriptions.countDocuments()
```

## Common Issues

### "Database not connected" Error

Ensure MongoDB is running:
```bash
# Check if MongoDB is running (macOS/Linux)
ps aux | grep mongod

# Start MongoDB (macOS with Homebrew)
brew services start mongodb-community

# Start MongoDB (Linux)
sudo systemctl start mongodb
```

### Invalid ObjectId Errors

ObjectIds must be 24-character hex strings. If you're testing with hardcoded IDs, use valid MongoDB ObjectIds or create entities first and use the returned IDs.

### Tool Schema Validation Errors

If a tool call fails with a Zod validation error, check that:
- Required fields are provided
- Field types match the schema (e.g., strings, not numbers)
- Enum values are valid (e.g., `status: "active"` not `status: "inactive"`)

## Performance Testing

For large datasets:

1. Create multiple patients (e.g., 100)
2. Create multiple visits per patient (e.g., 10 each)
3. Test query performance with indexes
4. Monitor MongoDB with `mongotop` or `mongostat`

## Security Testing

Check that:
- Invalid ObjectIds are rejected
- Zod validation catches malformed input
- Database errors are caught and don't leak sensitive info
- All entities have provenance tracking (`created_by`, `updated_by`)

## Next Steps

After successful testing:
- Deploy to production MongoDB (Atlas recommended)
- Set up monitoring and alerting
- Consider adding authentication if multi-user
- Implement backup strategy for MongoDB

