# Docker Setup for AC130 Health MCP Server

This guide explains how to run the AC130 Health MCP server and MongoDB using Docker.

## Prerequisites

- Docker Engine 20.10+ installed
- Docker Compose V2 installed
- 2GB free disk space (for MongoDB data)

## Quick Start

### 1. Start All Services

```bash
# Start MongoDB and MCP server
docker compose up -d

# View logs
docker compose logs -f
```

This will:
- Start MongoDB on port 27017
- Create a persistent volume for MongoDB data
- Build and start the MCP server
- Create database indexes automatically

### 2. Stop All Services

```bash
# Stop services (keeps data)
docker compose stop

# Stop and remove containers (keeps data)
docker compose down

# Stop, remove containers AND delete data
docker compose down -v
```

## Configuration

### Environment Variables

Edit `docker-compose.yml` to customize:

```yaml
services:
  mcp-server:
    environment:
      - MONGO_URI=mongodb://mongodb:27017
      - AC130_HEALTH_DB_NAME=ac130_health  # Change database name
```

### MongoDB Port

To change the MongoDB port exposed to your host:

```yaml
services:
  mongodb:
    ports:
      - "27018:27017"  # Host:Container
```

## Connecting Claude Desktop to Dockerized MCP Server

**Important**: The MCP server in Docker uses `stdio` transport, which requires the server to run locally (not in a container) when connecting to Claude Desktop.

### Recommended Approach: Hybrid Setup

Run **MongoDB in Docker** (for easy management) and the **MCP server locally**:

```bash
# 1. Start only MongoDB
docker compose up -d mongodb

# 2. In another terminal, run MCP server locally
npm run dev
```

### Claude Desktop Config

```json
{
  "mcpServers": {
    "health-record-mcp": {
      "command": "/Users/YOUR_USERNAME/.nvm/versions/node/v24.5.0/bin/node",
      "args": [
        "/path/to/health-record-mcp/node_modules/.bin/tsx",
        "/path/to/health-record-mcp/src/index.ts"
      ],
      "env": {
        "MONGO_URI": "mongodb://localhost:27017",
        "AC130_HEALTH_DB_NAME": "ac130_health"
      }
    }
  }
}
```

## Docker Commands Reference

### View Logs

```bash
# All services
docker compose logs

# Follow logs in real-time
docker compose logs -f

# Only MongoDB logs
docker compose logs mongodb

# Only MCP server logs
docker compose logs mcp-server
```

### Rebuild After Code Changes

```bash
# Rebuild MCP server image
docker compose build mcp-server

# Rebuild and restart
docker compose up -d --build mcp-server
```

### Database Management

```bash
# Access MongoDB shell
docker exec -it health-record-mongodb mongosh ac130_health

# Backup database
docker exec health-record-mongodb mongodump --out=/data/backup --db=ac130_health

# View MongoDB logs
docker compose logs mongodb
```

### Volume Management

```bash
# List volumes
docker volume ls | grep health-record

# Inspect MongoDB data volume
docker volume inspect health-record-mcp_mongodb_data

# Backup MongoDB data volume
docker run --rm -v health-record-mcp_mongodb_data:/data -v $(pwd):/backup ubuntu tar czf /backup/mongodb-backup.tar.gz /data
```

## Troubleshooting

### MongoDB Connection Refused

**Problem**: `ECONNREFUSED mongodb:27017`

**Solution**: MongoDB might still be starting. Wait 10-15 seconds and try again.

```bash
# Check MongoDB health
docker compose ps
# Should show "healthy" status

# View MongoDB logs
docker compose logs mongodb
```

### MCP Server Won't Start

**Problem**: Server exits immediately

**Solution**: Check if MongoDB is running first:

```bash
# Start MongoDB only
docker compose up -d mongodb

# Wait for health check
docker compose ps

# Then start MCP server
docker compose up -d mcp-server
```

### Port Already in Use

**Problem**: `Bind for 0.0.0.0:27017 failed: port is already allocated`

**Solution**: Either stop your local MongoDB:

```bash
# macOS with Homebrew
brew services stop mongodb-community

# Or change the port in docker-compose.yml
ports:
  - "27018:27017"
```

### Data Persistence Issues

MongoDB data persists in Docker volumes. To completely reset:

```bash
# Stop and remove everything including volumes
docker compose down -v

# Start fresh
docker compose up -d
```

## Production Deployment

For production use, consider:

1. **Use MongoDB Atlas** instead of local MongoDB:
   ```yaml
   environment:
     - MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/ac130_health
   ```

2. **Add resource limits**:
   ```yaml
   services:
     mcp-server:
       deploy:
         resources:
           limits:
             cpus: '0.5'
             memory: 512M
   ```

3. **Use Docker secrets** for sensitive data:
   ```yaml
   secrets:
     mongodb_uri:
       file: ./secrets/mongodb_uri.txt
   ```

4. **Enable MongoDB authentication**:
   ```yaml
   services:
     mongodb:
       environment:
         - MONGO_INITDB_ROOT_USERNAME=admin
         - MONGO_INITDB_ROOT_PASSWORD=securepw
   ```

## Development Workflow

### Recommended Setup

1. Use Docker for MongoDB (consistent, isolated)
2. Run MCP server locally (easier debugging, fast iteration)

```bash
# Terminal 1: Start MongoDB
docker compose up -d mongodb

# Terminal 2: Watch TypeScript compilation
npm run watch

# Terminal 3: Run MCP server
npm run dev
```

### Full Docker Development

If you prefer running everything in Docker:

```bash
# Edit code
vim src/index.ts

# Rebuild and restart
docker compose up -d --build mcp-server

# View logs
docker compose logs -f mcp-server
```

## Architecture

```
┌─────────────────────┐
│  Claude Desktop     │
│  (Host Machine)     │
└──────────┬──────────┘
           │ stdio
           │
┌──────────▼──────────┐
│  MCP Server         │
│  (Local Process)    │
│  Port: -            │
└──────────┬──────────┘
           │ TCP
           │
┌──────────▼──────────┐
│  MongoDB            │
│  (Docker Container) │
│  Port: 27017        │
└─────────────────────┘
```

## Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [MongoDB Docker Hub](https://hub.docker.com/_/mongo)
- [Model Context Protocol Docs](https://modelcontextprotocol.io/)

