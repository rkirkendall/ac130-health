# Health Record MCP Server - Quick Start Guide

Get up and running with the Health Record MCP Server in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- Docker installed (recommended) OR MongoDB installed locally

## Option A: Docker Setup (Recommended)

### 1. Install Dependencies

```bash
npm install
```

### 2. Start MongoDB with Docker

```bash
docker compose up -d mongodb
```

This starts MongoDB in a Docker container with persistent storage.

### 3. Test the Server

```bash
npm run dev
```

You should see:
```
Connected to MongoDB
Database indexes created
Health Record MCP Server running on stdio
```

## Option B: Local MongoDB Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` if needed (defaults work for local MongoDB):
```
MONGO_URI=mongodb://localhost:27017
HEALTH_RECORD_DB_NAME=health_record
```

### 3. Start MongoDB

```bash
# macOS with Homebrew
brew services start mongodb-community

# Or use Docker
docker compose up -d mongodb
```

### 4. Build the Project

```bash
npm run build
```

### 5. Test the Server

```bash
npm start
```

You should see:
```
Connected to MongoDB
Database indexes created
Health Record MCP Server running on stdio
```

Press `Ctrl+C` to stop.

## 5. Configure Claude Desktop

Edit your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add this configuration (replace `YOUR_USERNAME` with your actual path):

```json
{
  "mcpServers": {
    "health-record-mcp": {
      "command": "node",
      "args": [
        "/Users/YOUR_USERNAME/path/to/health-record-mcp/dist/index.js"
      ],
      "env": {
        "MONGO_URI": "mongodb://localhost:27017",
        "HEALTH_RECORD_DB_NAME": "health_record"
      }
    }
  }
}
```

## 6. Restart Claude Desktop

Completely quit and restart Claude Desktop.

## 7. Test It Out

Start a new conversation in Claude Desktop and try:

```
Create a patient record for my dad, John Smith.
```

Claude should use the `create_patient` tool and create a record in your MongoDB database.

## What's Next?

### Try More Features

- Record a visit: "My dad saw Dr. Johnson today for his annual checkup"
- Add a prescription: "The doctor prescribed Lisinopril 10mg once daily"
- Create a health summary: "Update the health summary for my dad"
- Ask clinical questions: "Is this medication dosage normal?"

### View Your Data

Connect to MongoDB to see the records:

```bash
mongosh mongodb://localhost:27017/health_record

# List all patients
db.patients.find().pretty()

# List all visits
db.visits.find().pretty()

# View health summary
db.active_summaries.find().pretty()
```

### Learn More

- [README.md](README.md) - Full documentation and features
- [INTEGRATION.md](INTEGRATION.md) - Detailed integration guide
- [TESTING.md](TESTING.md) - Testing with MCP Inspector

## Troubleshooting

### MongoDB Not Running

Start MongoDB:

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Linux (systemd)
sudo systemctl start mongodb

# Or run manually
mongod --dbpath /path/to/data/directory
```

### Server Not Showing in Claude

1. Check the path in your config is correct (use absolute path)
2. Verify the build succeeded (`dist/index.js` exists)
3. Check Claude Desktop logs for errors
4. Try the dev mode config with `tsx` instead

### Can't Find Claude Config File

The config file may not exist yet. Create it:

```bash
# macOS
mkdir -p ~/Library/Application\ Support/Claude
touch ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Then edit it with your favorite editor
```

## Development Mode

For active development, use:

```bash
npm run dev
```

And configure Claude Desktop with the tsx variant (see [INTEGRATION.md](INTEGRATION.md)).

## Need Help?

- Check the [README.md](README.md) for comprehensive documentation
- Review [TESTING.md](TESTING.md) for using the MCP Inspector
- Look at the plan file: `care.plan.md`

