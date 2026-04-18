# Plan: Docker Documentation Guide

**Date:** 2026-04-17 | **Spec:** docs/changes/docker-containerization/proposal.md (Phase 5) | **Tasks:** 1 | **Time:** 5 min

## Goal

Provide a comprehensive Docker usage guide at `docs/guides/docker.md` that covers running, deploying, and building all Harness Docker images so users never need to read the Dockerfile or compose file directly.

## Observable Truths (Acceptance Criteria)

1. `docs/guides/docker.md` exists with sections: Quick Start, Individual Image Usage, Orchestrator Deployment, Dashboard Deployment, Agent Execution Modes, Environment Variables, Building from Source, Image Registry.
2. All code examples match the actual Dockerfile entry points (`node packages/cli/dist/bin/harness.js`, `node packages/cli/dist/bin/harness-mcp.js`, `node packages/cli/dist/bin/harness.js orchestrator run --headless`, `node packages/dashboard/dist/server/serve.js`), ports (8080, 3701), and compose configuration.
3. `docs/guides/index.md` includes a Docker Deployment entry linking to `./docker.md`.
4. `harness validate` passes.

## File Map

- CREATE `docs/guides/docker.md`
- MODIFY `docs/guides/index.md` (add Docker Deployment entry)

## Tasks

### Task 1: Create Docker documentation guide and update index

**Depends on:** none | **Files:** `docs/guides/docker.md`, `docs/guides/index.md`

1. Create `docs/guides/docker.md` with the following structure and content:
   - **Title and intro:** "Docker Deployment" -- brief paragraph explaining the 4 images (cli, mcp-server, orchestrator, dashboard) and their purpose.

   - **Quick Start** section:

     ```bash
     docker compose up
     ```

     Explain that this brings up the orchestrator (port 8080) and dashboard (port 3701) with correct networking, health checks, and volume mounts. Dashboard waits for orchestrator to be healthy before starting.

   - **Individual Image Usage** section covering:
     - CLI: `docker run --rm -v $(pwd):/project ghcr.io/intense-visions/harness-cli:latest --version`
     - CLI interactive: `docker run --rm -it -v $(pwd):/project ghcr.io/intense-visions/harness-cli:latest validate`
     - MCP server: `docker run --rm -i -v $(pwd):/project ghcr.io/intense-visions/harness-mcp:latest` (stdio mode, pipe JSON-RPC)

   - **Orchestrator Deployment** section:
     - Docker run command with port 8080, project mount (read-only), workspaces volume, `HARNESS_PROJECT_PATH=/project`, health check endpoint `GET /api/v1/state`
     - Volumes: `./:/project:ro` for project context, named `workspaces` volume for `.harness/workspaces` persistence
     - Health check: `curl -f http://localhost:8080/api/v1/state` (30s interval, 10s timeout, 3 retries, 10s start period)
     - Restart policy: `unless-stopped`

   - **Dashboard Deployment** section:
     - Docker run command with port 3701, project mount (read-only), `ORCHESTRATOR_URL=http://orchestrator:8080` (or host address when running standalone)
     - Health check: `curl -f http://localhost:3701/health`
     - Note about `depends_on: service_healthy` in compose vs manual orchestration

   - **Agent Execution Modes** section:
     - Host-process mode (default): agents spawn as child processes inside container, requires Claude CLI available in container or via volume mount
     - Container mode (opt-in): uncomment Docker socket mount `- /var/run/docker.sock:/var/run/docker.sock` in compose, orchestrator uses `docker.ts` runtime to spawn sibling containers on host daemon
     - Security note about Docker socket access

   - **Environment Variables** table:

     | Variable               | Used by                 | Default   | Description                                   |
     | ---------------------- | ----------------------- | --------- | --------------------------------------------- |
     | `HARNESS_PROJECT_PATH` | orchestrator, dashboard | none      | Path to mounted project root inside container |
     | `ORCHESTRATOR_URL`     | dashboard               | none      | URL of the orchestrator HTTP API              |
     | `HOST`                 | orchestrator, dashboard | `0.0.0.0` | Bind address for HTTP server                  |
     | `CI`                   | cli                     | none      | Set to `true` for headless CI mode            |

   - **Building from Source** section:

     ```bash
     docker build --target cli -t harness-cli .
     docker build --target mcp-server -t harness-mcp .
     docker build --target orchestrator -t harness-orchestrator .
     docker build --target dashboard -t harness-dashboard .
     ```

     Explain multi-stage build: `base` (node:22-slim + pnpm) -> `deps` (frozen lockfile install) -> `build` (turbo build) -> per-target slim images.

   - **Image Registry** section:
     - Registry: `ghcr.io/intense-visions/`
     - Images: `harness-cli`, `harness-mcp`, `harness-orchestrator`, `harness-dashboard`
     - Tagging: on git tag `v1.24.3` -> tags `1.24.3`, `1.24`, `1`, `latest`
     - Pull example: `docker pull ghcr.io/intense-visions/harness-cli:latest`
     - CI workflow: `.github/workflows/docker.yml` triggers on `v*` tag push

2. Add Docker Deployment entry to `docs/guides/index.md` after the Orchestrator Guide entry:

   ```markdown
   ### [Docker Deployment](./docker.md)

   Run and deploy harness via Docker containers:

   - Quick start with Docker Compose
   - Individual CLI and MCP server usage
   - Orchestrator and dashboard deployment
   - Agent execution modes and environment variables
   - Building images from source

   **Best for:** Teams deploying harness as containerized services or running without local Node.js
   ```

3. Run: `harness validate`
4. Commit: `docs(docker): add Docker deployment guide`
