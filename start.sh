#!/bin/bash
# Start script for Health Record MCP Server
# Ensures MongoDB is running, then provides instructions for MCP client

set -e

echo "🚀 Starting Health Record MCP Server Stack..."

# Start MongoDB if not already running
if ! docker compose ps mongodb | grep -q "Up"; then
    echo "📦 Starting MongoDB..."
    docker compose up -d mongodb
    echo "⏳ Waiting for MongoDB to be healthy..."
    docker compose ps mongodb | grep -q "healthy" || sleep 5
else
    echo "✅ MongoDB is already running"
fi

echo ""
echo "✅ Stack is ready!"
echo ""
echo "MongoDB: Running in Docker"
echo "MCP Server: Will be started by Cursor/Claude Desktop via mcp.json"
echo ""
echo "To stop MongoDB: docker compose stop mongodb"
echo "To stop and remove: docker compose down"

