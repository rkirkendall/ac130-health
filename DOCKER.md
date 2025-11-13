# Docker Guide

The `docker-compose.yml` in `ac130/` defines three services:
- `mongodb`: MongoDB 7 with persistent volumes and a health check
- `mcp-server`: a long-lived container that keeps Node, dependencies, and build output handy (it idles with `tail -f /dev/null`)
- `webapp`: the optional Next.js viewer published on http://localhost:3001

## Quick Start
```bash
# From ac130/
./start.sh                              # one-step bring-up (mongodb + mcp-server + webapp)
docker compose up -d mongodb            # database only
docker compose up -d webapp             # optional viewer
docker compose --profile mcp up -d      # build the runner container used by scripts/run-mcp-docker.sh
```

Once MongoDB is healthy you can either run the MCP server locally (`npm run dev`) or execute it inside the prepared container:

```bash
npm run build
./scripts/run-mcp-docker.sh             # streams stdio from the mcp-server container
```

## Common Commands
- Tail logs: `docker compose logs -f mongodb` or `docker compose logs -f webapp`
- Rebuild images after code changes: `docker compose build mcp-server webapp`
- Stop services but keep data: `docker compose down`
- Remove everything, including volumes: `docker compose down -v`

Volumes are automatically created (`mongodb_data`, `mongodb_config`). Back them up with `docker run --rm -v <volume>:/data -v $(pwd):/backup ubuntu tar czf /backup/mongodb.tar.gz /data`.

## Configuration
- Override `MONGO_URI` or `HEALTH_RECORD_DB_NAME` under the `mcp-server` service
- Change the host MongoDB port by editing the `mongodb` service `ports` mapping (e.g. `"27018:27017"`)
- Enable authentication by setting `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD`

## Troubleshooting
- **MongoDB connection refused**: wait for the health check (`docker compose ps`) or inspect logs (`docker compose logs mongodb`)
- **Port in use**: stop your local MongoDB service or remap the port inside `docker-compose.yml`
- **MCP server exits immediately**: confirm MongoDB is running before launching `npm run dev` or `./scripts/run-mcp-docker.sh`

Use Docker primarily for MongoDB and the viewer; keep the MCP server on the host when you need `stdio` transport to talk to Claude or Cursor.

