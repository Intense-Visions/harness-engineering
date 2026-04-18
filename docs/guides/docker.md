# Docker Deployment

Harness Engineering provides four Docker images for containerized usage and deployment:

- **harness-cli** -- the full Harness CLI for validation, scanning, planning, and all other commands
- **harness-mcp** -- the MCP server for stdio-based tool access from AI agents and editors
- **harness-orchestrator** -- the long-lived orchestrator daemon with HTTP API and WebSocket
- **harness-dashboard** -- the web dashboard (Hono API server + Vite SPA) for monitoring orchestrator activity

All images are built from a single multi-stage `Dockerfile` and published to the GitHub Container Registry.

## Quick Start

The fastest way to run the orchestrator and dashboard together:

```bash
docker compose up
```

This brings up two services:

- **Orchestrator** on port `8080` -- polls for work, dispatches agents, exposes the HTTP API
- **Dashboard** on port `3701` -- web UI connected to the orchestrator

The dashboard waits for the orchestrator's health check to pass before starting. Both services mount the current directory as `/project` (read-only) for project context, and the orchestrator persists workspace data in a named Docker volume.

To run in the background:

```bash
docker compose up -d
```

To stop:

```bash
docker compose down
```

## Individual Image Usage

### CLI

Run any harness command against the current directory:

```bash
docker run --rm -v $(pwd):/project ghcr.io/intense-visions/harness-cli:latest --version
```

Interactive commands (validation, scanning):

```bash
docker run --rm -it -v $(pwd):/project ghcr.io/intense-visions/harness-cli:latest validate
```

The CLI image entry point is `node packages/cli/dist/bin/harness.js`, so arguments are passed directly after the image name.

### MCP Server

The MCP server image runs in stdio mode, accepting JSON-RPC messages on stdin:

```bash
docker run --rm -i -v $(pwd):/project ghcr.io/intense-visions/harness-mcp:latest
```

The entry point is `node packages/cli/dist/bin/harness-mcp.js`. Pipe JSON-RPC requests to stdin and read responses from stdout.

## Orchestrator Deployment

### Docker Run

```bash
docker run -d \
  --name harness-orchestrator \
  -p 8080:8080 \
  -v $(pwd):/project:ro \
  -v workspaces:/app/.harness/workspaces \
  -e HARNESS_PROJECT_PATH=/project \
  --restart unless-stopped \
  ghcr.io/intense-visions/harness-orchestrator:latest
```

### Volumes

| Mount                                 | Purpose                                                    |
| ------------------------------------- | ---------------------------------------------------------- |
| `./:/project:ro`                      | Project source mounted read-only for context               |
| `workspaces:/app/.harness/workspaces` | Named volume for persistent workspace data across restarts |

### Health Check

The orchestrator has a built-in health check:

- **Endpoint:** `GET http://localhost:8080/api/v1/state`
- **Interval:** 30s
- **Timeout:** 10s
- **Retries:** 3
- **Start period:** 10s

Verify manually:

```bash
curl -f http://localhost:8080/api/v1/state
```

### Entry Point

```
node packages/cli/dist/bin/harness.js orchestrator run --headless
```

The `--headless` flag disables the TUI and runs the orchestrator as a pure daemon suitable for containers.

## Dashboard Deployment

### Docker Run

```bash
docker run -d \
  --name harness-dashboard \
  -p 3701:3701 \
  -v $(pwd):/project:ro \
  -e HARNESS_PROJECT_PATH=/project \
  -e ORCHESTRATOR_URL=http://host.docker.internal:8080 \
  --restart unless-stopped \
  ghcr.io/intense-visions/harness-dashboard:latest
```

When running the dashboard standalone (outside Compose), set `ORCHESTRATOR_URL` to the orchestrator's reachable address. Inside Compose, Docker networking resolves `http://orchestrator:8080` automatically.

### Health Check

- **Endpoint:** `GET http://localhost:3701/health`
- **Interval:** 30s
- **Timeout:** 10s
- **Retries:** 3
- **Start period:** 10s

### Entry Point

```
node packages/dashboard/dist/server/serve.js
```

### Compose Dependency

In `docker-compose.yml`, the dashboard uses `depends_on` with `condition: service_healthy` to wait for the orchestrator:

```yaml
depends_on:
  orchestrator:
    condition: service_healthy
```

When running services manually (without Compose), start the orchestrator first and confirm its health check passes before starting the dashboard.

## Agent Execution Modes

The orchestrator supports two modes for running agents:

### Host-Process Mode (Default)

Agents spawn as child processes inside the orchestrator container. This is the default behavior and requires no additional configuration. The agent CLI (e.g., Claude CLI) must be available inside the container or mounted via a volume.

### Container Mode (Opt-In)

The orchestrator can spawn agents as sibling containers on the host Docker daemon. To enable this, uncomment the Docker socket mount in `docker-compose.yml`:

```yaml
volumes:
  - ./:/project:ro
  - workspaces:/app/.harness/workspaces
  - /var/run/docker.sock:/var/run/docker.sock # Enable container mode
```

Or add it to your `docker run` command:

```bash
docker run -d \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ...
  ghcr.io/intense-visions/harness-orchestrator:latest
```

> **Security note:** Mounting the Docker socket grants the container full control over the host Docker daemon. Only enable this in trusted environments.

## Environment Variables

| Variable               | Used by                 | Default   | Description                                                         |
| ---------------------- | ----------------------- | --------- | ------------------------------------------------------------------- |
| `HARNESS_PROJECT_PATH` | orchestrator, dashboard | none      | Path to the mounted project root inside the container               |
| `ORCHESTRATOR_URL`     | dashboard               | none      | URL of the orchestrator HTTP API (e.g., `http://orchestrator:8080`) |
| `HOST`                 | orchestrator, dashboard | `0.0.0.0` | Bind address for the HTTP server                                    |
| `CI`                   | cli                     | none      | Set to `true` for headless CI mode                                  |

## Building from Source

All four images are built from the repository root using Docker multi-stage targets:

```bash
docker build --target cli -t harness-cli .
docker build --target mcp-server -t harness-mcp .
docker build --target orchestrator -t harness-orchestrator .
docker build --target dashboard -t harness-dashboard .
```

The build stages are:

1. **base** -- `node:22-slim` with pnpm enabled via corepack
2. **deps** -- frozen lockfile install of all workspace dependencies
3. **build** -- full monorepo build via turbo (handles dependency ordering)
4. **Per-target images** -- slim runtime images copying only the required `dist/` artifacts and production dependencies

## Image Registry

All images are published to the GitHub Container Registry under the `intense-visions` organization:

| Image        | Registry Path                                  |
| ------------ | ---------------------------------------------- |
| CLI          | `ghcr.io/intense-visions/harness-cli`          |
| MCP Server   | `ghcr.io/intense-visions/harness-mcp`          |
| Orchestrator | `ghcr.io/intense-visions/harness-orchestrator` |
| Dashboard    | `ghcr.io/intense-visions/harness-dashboard`    |

### Tagging

When a git tag `v1.24.3` is pushed, the CI workflow (`.github/workflows/docker.yml`) builds and pushes each image with four tags:

- `1.24.3` (full version)
- `1.24` (minor)
- `1` (major)
- `latest`

### Pulling Images

```bash
docker pull ghcr.io/intense-visions/harness-cli:latest
docker pull ghcr.io/intense-visions/harness-mcp:latest
docker pull ghcr.io/intense-visions/harness-orchestrator:latest
docker pull ghcr.io/intense-visions/harness-dashboard:latest
```

Pin to a specific version for production:

```bash
docker pull ghcr.io/intense-visions/harness-orchestrator:1.24.3
```

---

_Last Updated: 2026-04-17_
