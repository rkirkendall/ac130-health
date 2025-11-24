#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔧 Rebuilding Docker images..."
docker compose build

echo "♻️ Restarting containers..."
docker compose up -d --force-recreate

echo "✅ Docker services rebuilt and restarted."

