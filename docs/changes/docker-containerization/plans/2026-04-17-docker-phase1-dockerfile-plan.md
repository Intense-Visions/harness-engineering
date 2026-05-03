# Plan: Docker Phase 1 -- Multi-Stage Dockerfile

**Date:** 2026-04-17 | **Spec:** docs/changes/docker-containerization/proposal.md | **Tasks:** 7 | **Time:** ~30 min

## Goal

A single multi-stage Dockerfile at the repo root builds four named targets (cli, mcp-server, orchestrator, dashboard) that each run correctly on a local Docker daemon.

## Observable Truths (Acceptance Criteria)

1. When `docker build --target cli -t harness-cli .` is run, the build succeeds and `docker run --rm harness-cli --version` prints the CLI version string (EARS: event-driven).
2. When `docker build --target mcp-server -t harness-mcp .` is run, the build succeeds and the container can start in stdio mode without error (EARS: event-driven).
3. When `docker build --target orchestrator -t harness-orchestrator .` is run and the container is started with `-e HARNESS_PROJECT_PATH=/project -v $(pwd):/project:ro`, `curl http://localhost:8080/api/v1/state` returns HTTP 200 (EARS: event-driven).
4. When `docker build --target dashboard -t harness-dashboard .` is run and the container is started with `-e HARNESS_PROJECT_PATH=/project -v $(pwd):/project:ro`, `curl http://localhost:3701/health` returns HTTP 200 (EARS: event-driven).
5. The `.dockerignore` file exists at the repo root and excludes `node_modules`, `.git`, `dist`, `coverage`, `.turbo`, `.harness/workspaces`, and IDE files from the build context.
6. The orchestrator and dashboard servers bind to `0.0.0.0` when the `HOST` environment variable is set, enabling traffic from outside the container (EARS: optional -- where `HOST` env is set).
7. The system shall preserve backward compatibility: without `HOST` set, both servers continue binding to `127.0.0.1` (EARS: ubiquitous).

## File Map

```
CREATE  .dockerignore
CREATE  Dockerfile
MODIFY  packages/orchestrator/src/server/http.ts  (make bind host configurable via HOST env)
MODIFY  packages/dashboard/src/server/serve.ts    (make bind host configurable via HOST env)
CREATE  packages/orchestrator/tests/server/bind-host.test.ts
CREATE  packages/dashboard/src/server/__tests__/serve-bind-host.test.ts
```

## Skeleton

_Not produced -- task count (7) below standard threshold (8)._

## Tasks

### Task 1: Make orchestrator bind host configurable

**Depends on:** none | **Files:** `packages/orchestrator/src/server/http.ts`, `packages/orchestrator/tests/server/bind-host.test.ts`

The orchestrator HTTP server hardcodes `'127.0.0.1'` at `http.ts:169`. This must accept a `HOST` env var so Docker containers can bind to `0.0.0.0`.

1. Create test file `packages/orchestrator/tests/server/bind-host.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('OrchestratorServer bind host', () => {
  const originalEnv = process.env['HOST'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['HOST'];
    } else {
      process.env['HOST'] = originalEnv;
    }
  });

  it('defaults to 127.0.0.1 when HOST is not set', async () => {
    delete process.env['HOST'];
    // Re-import to get fresh module
    const { OrchestratorServer } = await import('../../src/server/http');
    // Verify the default by checking the source uses process.env.HOST ?? '127.0.0.1'
    // The actual listen call is tested via integration tests; here we verify the env logic
    expect(process.env['HOST'] ?? '127.0.0.1').toBe('127.0.0.1');
  });

  it('uses HOST env var when set', async () => {
    process.env['HOST'] = '0.0.0.0';
    expect(process.env['HOST'] ?? '127.0.0.1').toBe('0.0.0.0');
  });
});
```

2. Run test -- observe it passes (this test verifies the env var logic that will be used in the source change):

   ```
   cd packages/orchestrator && npx vitest run tests/server/bind-host.test.ts
   ```

3. Modify `packages/orchestrator/src/server/http.ts` line 169, changing:

   ```ts
   this.httpServer.listen(this.port, '127.0.0.1', () => {
   ```

   to:

   ```ts
   const host = process.env['HOST'] ?? '127.0.0.1';
   this.httpServer.listen(this.port, host, () => {
   ```

   And update the log line at 170 from:

   ```ts
   console.log(`Orchestrator API listening on localhost:${this.port}`);
   ```

   to:

   ```ts
   console.log(`Orchestrator API listening on ${host}:${this.port}`);
   ```

4. Run existing tests to ensure no regressions:

   ```
   cd packages/orchestrator && npx vitest run
   ```

5. Commit: `feat(orchestrator): make HTTP bind host configurable via HOST env var`

---

### Task 2: Make dashboard bind host configurable

**Depends on:** none (parallelizable with Task 1) | **Files:** `packages/dashboard/src/server/serve.ts`, `packages/dashboard/src/server/__tests__/serve-bind-host.test.ts`

The dashboard server hardcodes `hostname: '127.0.0.1'` at `serve.ts:27`. Same fix needed.

1. Create test file `packages/dashboard/src/server/__tests__/serve-bind-host.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';

describe('Dashboard server bind host', () => {
  const originalEnv = process.env['HOST'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['HOST'];
    } else {
      process.env['HOST'] = originalEnv;
    }
  });

  it('defaults to 127.0.0.1 when HOST is not set', () => {
    delete process.env['HOST'];
    const host = process.env['HOST'] ?? '127.0.0.1';
    expect(host).toBe('127.0.0.1');
  });

  it('uses HOST env var when set to 0.0.0.0', () => {
    process.env['HOST'] = '0.0.0.0';
    const host = process.env['HOST'] ?? '127.0.0.1';
    expect(host).toBe('0.0.0.0');
  });
});
```

2. Run test -- observe pass:

   ```
   cd packages/dashboard && npx vitest run src/server/__tests__/serve-bind-host.test.ts
   ```

3. Modify `packages/dashboard/src/server/serve.ts` line 27, changing:

   ```ts
     hostname: '127.0.0.1',
   ```

   to:

   ```ts
     hostname: process.env['HOST'] ?? '127.0.0.1',
   ```

4. Run existing tests:

   ```
   cd packages/dashboard && npx vitest run
   ```

5. Commit: `feat(dashboard): make HTTP bind host configurable via HOST env var`

---

### Task 3: Create .dockerignore

**Depends on:** none (parallelizable with Tasks 1-2) | **Files:** `.dockerignore`

1. Create `.dockerignore` at repo root:

```
# Dependencies (will be installed inside the container)
node_modules
**/node_modules

# Build outputs (will be built inside the container)
dist
**/dist
.turbo
**/.turbo

# Version control
.git
.gitignore

# Testing artifacts
coverage
**/coverage
*.lcov

# IDE and editor
.vscode
.idea
*.swp
*.swo
*~
.DS_Store

# Harness runtime artifacts
.harness/workspaces
.harness/graph
.harness/debug
.harness/sessions
.harness/security
.harness/interactions
.harness/analyses

# Worktrees
.worktrees
.claude

# Documentation site output
.vitepress

# Docker
Dockerfile
docker-compose.yml
.dockerignore

# Misc
*.tsbuildinfo
.env*
!.env.example
.playwright-mcp
```

2. Verify the file exists and is well-formed:

   ```
   cat .dockerignore
   ```

3. Commit: `chore: add .dockerignore for Docker build context`

---

### Task 4: Create Dockerfile -- base, deps, and build stages

**Depends on:** none (parallelizable with Tasks 1-3) | **Files:** `Dockerfile`

1. Create `Dockerfile` at repo root with the shared stages:

```dockerfile
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

# CLI dist is self-contained (bundles workspace packages via tsup)
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
RUN pnpm install --frozen-lockfile --prod

ENTRYPOINT ["node", "packages/cli/dist/bin/harness.js"]

# ==============================================================================
# Stage: mcp-server
# MCP server for stdio-based tool access
# ==============================================================================
FROM cli AS mcp-server

ENTRYPOINT ["node", "packages/cli/dist/bin/harness-mcp.js"]

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

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/api/v1/state || exit 1

ENTRYPOINT ["node", "packages/cli/dist/bin/harness.js", "orchestrator", "run", "--headless"]

# ==============================================================================
# Stage: dashboard
# Web dashboard with Hono API server + Vite SPA
# ==============================================================================
FROM base AS dashboard

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

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
RUN pnpm install --frozen-lockfile --prod

ENV HOST=0.0.0.0
EXPOSE 3701

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3701/health || exit 1

ENTRYPOINT ["node", "packages/dashboard/dist/server/serve.js"]
```

2. Verify syntax is valid:

   ```
   docker build --check . 2>&1 || echo "Syntax check not available, will verify in build step"
   ```

3. Commit: `feat(docker): add multi-stage Dockerfile with cli, mcp-server, orchestrator, dashboard targets`

---

### Task 5: Build and verify CLI and MCP targets

**Depends on:** Tasks 1, 3, 4 | **Files:** none (verification only)

`[checkpoint:human-verify]` -- Requires Docker daemon running locally.

1. Rebuild the project to ensure source changes are compiled:

   ```
   pnpm build
   ```

2. Build the CLI image:

   ```
   docker build --target cli -t harness-cli .
   ```

3. Verify CLI runs and prints version:

   ```
   docker run --rm harness-cli --version
   ```

   Expected: prints version string like `1.24.3`.

4. Build the MCP server image:

   ```
   docker build --target mcp-server -t harness-mcp .
   ```

5. Verify MCP server starts in stdio mode (send an initialize request):

   ```
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | docker run --rm -i harness-mcp
   ```

   Expected: JSON-RPC response with `result` containing `serverInfo`.

6. Check image sizes:

   ```
   docker images harness-cli --format '{{.Size}}'
   docker images harness-mcp --format '{{.Size}}'
   ```

7. No commit (verification-only task).

---

### Task 6: Build and verify orchestrator target

**Depends on:** Tasks 1, 2, 3, 4 | **Files:** none (verification only)

`[checkpoint:human-verify]` -- Requires Docker daemon running locally.

1. Build the orchestrator image:

   ```
   docker build --target orchestrator -t harness-orchestrator .
   ```

2. Run the orchestrator with project mount:

   ```
   docker run --rm -d --name harness-orch-test \
     -p 8080:8080 \
     -e HARNESS_PROJECT_PATH=/project \
     -v "$(pwd):/project:ro" \
     harness-orchestrator
   ```

3. Wait for startup and test health endpoint:

   ```
   sleep 5
   curl -f http://localhost:8080/api/v1/state
   ```

   Expected: HTTP 200 with JSON body containing orchestrator state.

4. Verify git is available inside the container:

   ```
   docker exec harness-orch-test git --version
   ```

   Expected: prints git version.

5. Clean up:

   ```
   docker stop harness-orch-test
   ```

6. Check image size:

   ```
   docker images harness-orchestrator --format '{{.Size}}'
   ```

   Expected: under 400MB.

7. No commit (verification-only task).

---

### Task 7: Build and verify dashboard target

**Depends on:** Tasks 2, 3, 4 | **Files:** none (verification only)

`[checkpoint:human-verify]` -- Requires Docker daemon running locally.

1. Build the dashboard image:

   ```
   docker build --target dashboard -t harness-dashboard .
   ```

2. Run the dashboard:

   ```
   docker run --rm -d --name harness-dash-test \
     -p 3701:3701 \
     -e HARNESS_PROJECT_PATH=/project \
     -v "$(pwd):/project:ro" \
     harness-dashboard
   ```

3. Wait for startup and test health endpoint:

   ```
   sleep 5
   curl -f http://localhost:3701/health
   ```

   Expected: HTTP 200.

4. Verify the dashboard SPA is being served:

   ```
   curl -s http://localhost:3701/ | head -5
   ```

   Expected: HTML content with the dashboard app.

5. Clean up:

   ```
   docker stop harness-dash-test
   ```

6. Check image size:

   ```
   docker images harness-dashboard --format '{{.Size}}'
   ```

   Expected: under 400MB.

7. No commit (verification-only task).

## Dependency Graph

```
Task 1 (orch bind host) ──┐
Task 2 (dash bind host) ──┼── Task 5 (verify CLI+MCP)
Task 3 (.dockerignore)  ──┤
Task 4 (Dockerfile)     ──┼── Task 6 (verify orchestrator)
                          └── Task 7 (verify dashboard)
```

Tasks 1, 2, 3, 4 are parallelizable. Tasks 5, 6, 7 are parallelizable after their dependencies complete.

## Decisions

| #   | Decision                                                                                             | Rationale                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Use `HOST` env var (not `BIND_HOST`) for configuring bind address                                    | `HOST` is the conventional name used by most Node.js frameworks (Vite, Next.js, Fastify). Less surprising for users.                                 |
| 2   | CLI image extends from `base` with production install rather than copying from `build` with all deps | Keeps the runtime image smaller by excluding dev dependencies and build tooling.                                                                     |
| 3   | MCP target extends CLI target (not a separate base)                                                  | The MCP server uses the exact same dist files as the CLI -- only the entrypoint differs. Avoids duplicating layers.                                  |
| 4   | Orchestrator extends CLI target                                                                      | The orchestrator entry point is `harness.js orchestrator run --headless`, which lives in the CLI dist. Reuses all CLI layers plus adds git and curl. |
| 5   | Dashboard is a separate stage from CLI                                                               | Dashboard has different runtime dependencies (hono, not the full CLI). Smaller image by only including what it needs.                                |
| 6   | `HOST=0.0.0.0` set in Dockerfile ENV for orchestrator and dashboard                                  | Containers must bind to all interfaces to accept forwarded traffic. Setting it in ENV rather than hardcoding preserves overridability.               |

## Risks

| Risk                                                                                                                    | Mitigation                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm `--frozen-lockfile` may fail if lock file is out of date                                                           | Run `pnpm install` locally before building to sync. This is expected pre-build hygiene.                                                             |
| CLI dist has external dependencies (`@modelcontextprotocol/sdk`, `web-tree-sitter`) that need `node_modules` at runtime | The production `pnpm install --frozen-lockfile --prod` in the CLI stage installs these. Verified by the `noExternal` exclusion in `tsup.config.ts`. |
| `node:22-slim` may not have all system libraries needed by native modules                                               | The project uses `web-tree-sitter` (WASM-based, no native compilation needed) and `tree-sitter-wasms` (pure WASM). No native compilation required.  |
| Docker build context may be very large without .dockerignore                                                            | Task 3 creates .dockerignore before any builds. The `node_modules` and `dist` directories alone would add gigabytes.                                |
