# Use Node.js 24 LTS
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Copy package files from ac130 project
COPY ac130/package*.json ./
COPY ac130/tsconfig.json ./

# Install all dependencies (including dev dependencies for build) without running lifecycle scripts yet
RUN apk add --no-cache git && \
    npm install --ignore-scripts && \
    npm install -g tsx typescript

# Copy source code after dependencies to leverage layer caching
COPY ac130/src ./src

# Run package prepare/build now that sources are present
RUN npm run prepare

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build to reduce image size
RUN npm prune --production

# Expose port (not used for stdio transport, but good practice)
EXPOSE 3000

# Run the MCP server
CMD ["node", "dist/index.js"]

