# ==============================================================================
# Stage: base
# Common Node.js base with pnpm enabled via corepack
# ==============================================================================
FROM node:22-slim AS base

RUN corepack enable && corepack prepare pnpm@8.15.4 --activate
WORKDIR /app

# ==============================================================================
# Stage: deps
# Install production + dev dependencies (needed for build)
# ==============================================================================
FROM base AS deps

# Copy workspace configuration files first for better layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/cli/package.json packages/cli/
COPY packages/core/package.json packages/core/
COPY packages/dashboard/package.json packages/dashboard/
COPY packages/eslint-plugin/package.json packages/eslint-plugin/
COPY packages/graph/package.json packages/graph/
COPY packages/intelligence/package.json packages/intelligence/
COPY packages/linter-gen/package.json packages/linter-gen/
COPY packages/orchestrator/package.json packages/orchestrator/
COPY packages/types/package.json packages/types/
COPY docs/package.json docs/
COPY agents/skills/package.json agents/skills/

# Install all dependencies (including dev for build)
RUN pnpm install --frozen-lockfile

# ==============================================================================
# Stage: build
# Full monorepo build via turbo
# ==============================================================================
FROM deps AS build

# Copy all source code
COPY . .

# Build all packages (turbo handles dependency ordering)
RUN pnpm build

# ==============================================================================
# Stage: cli
# Minimal runtime for the harness CLI
# ==============================================================================
FROM base AS cli

# CLI bundles its own code via tsup; workspace packages (core, graph, linter-gen, types,
# orchestrator, dashboard, intelligence) are copied as pre-built dist artifacts.
# eslint-plugin is referenced by package.json only (no dist needed at runtime).
COPY --from=build /app/packages/cli/dist /app/packages/cli/dist
COPY --from=build /app/packages/cli/package.json /app/packages/cli/

# Copy root package.json for version reference
COPY --from=build /app/package.json /app/

# Install only production dependencies for the CLI
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/
COPY --from=build /app/packages/core/package.json /app/packages/core/
COPY --from=build /app/packages/core/dist /app/packages/core/dist
COPY --from=build /app/packages/graph/package.json /app/packages/graph/
COPY --from=build /app/packages/graph/dist /app/packages/graph/dist
COPY --from=build /app/packages/linter-gen/package.json /app/packages/linter-gen/
COPY --from=build /app/packages/linter-gen/dist /app/packages/linter-gen/dist
COPY --from=build /app/packages/types/package.json /app/packages/types/
COPY --from=build /app/packages/types/dist /app/packages/types/dist
COPY --from=build /app/packages/orchestrator/package.json /app/packages/orchestrator/
COPY --from=build /app/packages/orchestrator/dist /app/packages/orchestrator/dist
COPY --from=build /app/packages/dashboard/package.json /app/packages/dashboard/
COPY --from=build /app/packages/dashboard/dist /app/packages/dashboard/dist
COPY --from=build /app/packages/intelligence/package.json /app/packages/intelligence/
COPY --from=build /app/packages/intelligence/dist /app/packages/intelligence/dist
COPY --from=build /app/packages/eslint-plugin/package.json /app/packages/eslint-plugin/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

USER node

ENTRYPOINT ["node", "packages/cli/dist/bin/harness.js"]

# ==============================================================================
# Stage: mcp-server
# MCP server for stdio-based tool access
# ==============================================================================
FROM cli AS mcp-server

ENTRYPOINT ["node", "packages/cli/dist/bin/harness-mcp.js"]

# ==============================================================================
# Stage: base-with-tools
# Base image with curl (used by dashboard stage)
# ==============================================================================
FROM base AS base-with-tools

RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# ==============================================================================
# Stage: orchestrator
# Long-lived orchestrator service with HTTP API and WebSocket
# ==============================================================================
FROM cli AS orchestrator

# Install git (needed for orchestrator operations) and curl (for healthcheck)
USER root
RUN apt-get update && apt-get install -y --no-install-recommends git curl && \
    rm -rf /var/lib/apt/lists/*

ENV HOST=0.0.0.0
EXPOSE 8080

# Create workspace directory
RUN mkdir -p /app/.harness/workspaces
RUN chown -R node:node /app/.harness/workspaces

USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/api/v1/state || exit 1

ENTRYPOINT ["node", "packages/cli/dist/bin/harness.js", "orchestrator", "run", "--headless"]

# ==============================================================================
# Stage: dashboard
# Web dashboard with Hono API server + Vite SPA
# ==============================================================================
FROM base-with-tools AS dashboard

# Copy dashboard dist (server + client)
COPY --from=build /app/packages/dashboard/dist /app/packages/dashboard/dist
COPY --from=build /app/packages/dashboard/package.json /app/packages/dashboard/

# Copy workspace deps needed by dashboard server at runtime
COPY --from=build /app/package.json /app/
COPY --from=build /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/
COPY --from=build /app/packages/core/package.json /app/packages/core/
COPY --from=build /app/packages/core/dist /app/packages/core/dist
COPY --from=build /app/packages/graph/package.json /app/packages/graph/
COPY --from=build /app/packages/graph/dist /app/packages/graph/dist
COPY --from=build /app/packages/types/package.json /app/packages/types/
COPY --from=build /app/packages/types/dist /app/packages/types/dist
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

ENV HOST=0.0.0.0
EXPOSE 3701

USER node

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3701/api/health-check || exit 1

ENTRYPOINT ["node", "packages/dashboard/dist/server/serve.js"]
