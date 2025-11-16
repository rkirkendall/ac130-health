#!/bin/bash
# Start script for Health Record MCP Server
# Ensures MongoDB is running, then provides instructions for MCP client

set -e

echo "🚀 Starting Health Record MCP Server Stack..."

# Start full docker compose stack (MongoDB + MCP server + Webapp)
echo "📦 Bringing up MongoDB, MCP server, and Webapp..."
docker compose --profile mcp up -d mongodb mcp-server webapp

echo "⏳ Waiting for MongoDB to report healthy..."
for _ in {1..10}; do
    if docker compose ps mongodb | grep -q "healthy"; then
        break
    fi
    sleep 2
done

echo ""
echo "✅ Stack is ready!"
echo ""
echo "MongoDB:      docker compose logs mongodb"
echo "MCP Server:   docker compose logs mcp-server"
echo "MCP SSE:      http://localhost:3002"
echo "Webapp:       http://localhost:3001"
echo ""
echo "To stop all services:        docker compose --profile mcp stop"
echo "To stop and remove services: docker compose --profile mcp down"


