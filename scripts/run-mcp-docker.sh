#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

# Ensure MongoDB and MCP runner container are up
docker compose up -d mongodb mcp-server >/dev/null 2>&1 || {
  echo "Failed to start required docker compose services" >&2
  exit 1
}

# Determine container ID for the long-running MCP server container
container_id=$(docker compose ps -q mcp-server)
if [[ -z "${container_id}" ]]; then
  echo "Unable to determine mcp-server container ID" >&2
  exit 1
fi

# Execute the MCP server inside the existing container, wiring stdio
exec docker exec -i "${container_id}" node dist/index.js "$@"

