# Use Node.js 24 LTS
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Copy package files from ac130 project
COPY ac130/package*.json ./
COPY ac130/tsconfig.json ./

# Copy shared package locally for installation
COPY ac130-shared /ac130-shared

# Install all dependencies (including dev dependencies for build)
RUN apk add --no-cache git && \
    npm pkg set dependencies.@ac130/mcp-core="file:/ac130-shared" && \
    npm install && \
    npm install -g tsx typescript

# Copy source code
COPY ac130/src ./src

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build to reduce image size
RUN npm prune --production

# Expose port (not used for stdio transport, but good practice)
EXPOSE 3000

# Run the MCP server
CMD ["node", "dist/index.js"]

