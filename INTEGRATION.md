# Claude Desktop Integration Guide

This guide walks you through integrating the Health Record MCP Server with Claude Desktop.

## Prerequisites

1. Claude Desktop installed
2. MongoDB running (local or Atlas)
3. Health Record MCP Server built (`npm run build`)

## Step 1: Locate Claude Desktop Config File

The configuration file location depends on your operating system:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

## Step 2: Edit Configuration

Add the Health Record MCP server to your `claude_desktop_config.json`:

### Option A: Using Built JavaScript (Production)

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

**Important**: Replace `/Users/YOUR_USERNAME/path/to/ac130-2` with the actual absolute path to your project directory.

### Option B: Using TypeScript with tsx (Development)

```json
{
  "mcpServers": {
    "health-record-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/Users/YOUR_USERNAME/path/to/health-record-mcp/src/index.ts"
      ],
      "env": {
        "MONGO_URI": "mongodb://localhost:27017",
        "HEALTH_RECORD_DB_NAME": "health_record"
      }
    }
  }
}
```

### MongoDB Atlas Configuration

If you're using MongoDB Atlas instead of local MongoDB, update the `MONGO_URI`:

```json
{
  "mcpServers": {
    "health-record-mcp": {
      "command": "node",
      "args": [
        "/Users/YOUR_USERNAME/path/to/health-record-mcp/dist/index.js"
      ],
      "env": {
        "MONGO_URI": "mongodb+srv://username:password@cluster.mongodb.net/",
        "HEALTH_RECORD_DB_NAME": "health_record"
      }
    }
  }
}
```

## Step 3: Restart Claude Desktop

After saving the configuration file, completely quit and restart Claude Desktop for the changes to take effect.

## Step 4: Verify Integration

Once Claude Desktop restarts:

1. Start a new conversation
2. Look for the MCP tools indicator
3. Try asking: "Can you show me what tools are available?"
4. You should see Health Record MCP tools like `create_patient`, `create_visit`, etc.

## Step 5: Test Basic Functionality

Try a simple workflow:

```
You: "Create a patient record for my dad, John Smith, born March 15, 1955"
```

Claude should call `create_patient` with the appropriate parameters.

## Troubleshooting

### Server Not Appearing

1. **Check the logs**: Claude Desktop logs MCP server errors to the console
   - macOS: Open Console.app and filter for "Claude"
   - Windows: Check Event Viewer
   - Linux: Check `~/.config/Claude/logs/`

2. **Verify the path**: Make sure the absolute path in your config is correct
   ```bash
   # Test that the file exists
   ls -la /path/to/health-record-mcp/dist/index.js
   ```

3. **Check MongoDB**: Ensure MongoDB is running
   ```bash
   # For local MongoDB
   mongosh --eval "db.version()"
   ```

4. **Test the server directly**:
   ```bash
   cd /path/to/health-record-mcp
   node dist/index.js
   # Should show: "Health Record MCP Server running on stdio"
   ```

### Permission Errors

If you get permission errors, ensure:
- The `node` command is in your PATH
- The project directory has read permissions
- MongoDB connection string is correct

### MongoDB Connection Issues

Test your MongoDB connection:
```bash
# Local MongoDB
mongosh mongodb://localhost:27017

# MongoDB Atlas
mongosh "mongodb+srv://username:password@cluster.mongodb.net/"
```

## Viewing Server Output

Claude Desktop captures server stderr output. To see what your MCP server is logging:

- Check Claude Desktop's developer console (if available)
- Or add file logging to your server temporarily

## Next Steps

Once integrated, you can:

1. Create patient records with relationships
2. Log medical visits
3. Track prescriptions and medications
4. Record lab results
5. Maintain treatment plans
6. Let the active health summary auto-update

See the main [README.md](README.md) for usage examples and workflows.

## Example Configuration with Multiple MCP Servers

If you have other MCP servers, your config might look like:

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
    },
    "other-server": {
      "command": "node",
      "args": ["/path/to/other-server/index.js"]
    }
  }
}
```

Each server runs independently and provides its own set of tools and resources.

