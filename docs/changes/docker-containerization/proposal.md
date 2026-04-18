# Docker Containerization for Harness Engineering

## Overview

Provide Docker images for all four runtime components of the harness monorepo, enabling zero-dependency distribution of the CLI/MCP tools and production-grade deployment of the orchestrator/dashboard services.

### Goals

1. Users can run `harness` CLI and `harness-mcp` without installing Node.js, pnpm, or building from source
2. The orchestrator and dashboard can be deployed as long-lived containerized services with health checks, restart policies, and volume persistence
3. A single `docker compose up` brings up the full orchestrator + dashboard stack with correct networking
4. Images are automatically built and pushed to ghcr.io on tagged releases via GitHub Actions
5. Agent execution supports both host-process mode (default) and container-based mode (opt-in via Docker socket mount)

### Non-goals

- Kubernetes manifests or Helm charts (future consideration)
- Docs site containerization (better served by GitHub Pages)
- Building agent runtime images (the orchestrator uses existing Docker images or host processes for agents)

## Decisions

| #   | Decision                                                                          | Rationale                                                                                                                                                |
| --- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Dual-purpose images: distribution (CLI/MCP) + deployment (orchestrator/dashboard) | Different runtime profiles — stateless tools vs long-lived services — warrant different image optimizations                                              |
| 2   | Hybrid agent execution                                                            | The `ContainerRuntime` abstraction already exists. Default to host-process (mount Claude CLI), opt-in Docker socket for full isolation                   |
| 3   | ghcr.io as container registry                                                     | Native GitHub Actions integration, permissions mirror repo access, free for public repos                                                                 |
| 4   | Single multi-stage Dockerfile at repo root                                        | Shared pnpm install + turbo build stage, per-target slim runtime images. Maximizes layer caching, single source of truth for Node version                |
| 5   | 4 images: cli, mcp-server, orchestrator, dashboard                                | Maps to the codebase's runtime boundaries. CLI (interactive) and MCP (stdio) have different entry points. Orchestrator and dashboard scale independently |
| 6   | docker-compose.yml included                                                       | Low effort, high value. Documents deployment topology, handles networking, gives users a working starting point                                          |
| 7   | `node:22-slim` (Debian) as runtime base                                           | tree-sitter and other native modules require glibc. Alpine/musl compatibility issues not worth the ~100MB savings for a developer tool                   |

## Technical Design

### Dockerfile Structure

The repo root contains a single multi-stage `Dockerfile` with named build targets:

```
┌─────────────────────────────────────┐
│  Stage: base                        │
│  node:22-slim + corepack pnpm       │
├─────────────────────────────────────┤
│  Stage: deps                        │
│  COPY package.json files            │
│  pnpm install --frozen-lockfile     │
├─────────────────────────────────────┤
│  Stage: build                       │
│  COPY source + turbo build          │
├──────────┬──────────┬───────┬───────┤
│ cli      │ mcp-svr  │ orch  │ dash  │
│ dist/bin │ dist/bin  │ dist/ │ dist/ │
│ harness  │ harness-  │ +http │ +srv  │
│ .js      │ mcp.js   │ +ws   │ +spa  │
└──────────┴──────────┴───────┴───────┘
```

Build commands:

- `docker build --target cli .` → `ghcr.io/intense-visions/harness-cli`
- `docker build --target mcp-server .` → `ghcr.io/intense-visions/harness-mcp`
- `docker build --target orchestrator .` → `ghcr.io/intense-visions/harness-orchestrator`
- `docker build --target dashboard .` → `ghcr.io/intense-visions/harness-dashboard`

### Per-image Details

| Image        | Entry point                                            | Ports | Volumes                             | Health check                              | Extras                                                |
| ------------ | ------------------------------------------------------ | ----- | ----------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| cli          | `node dist/bin/harness.js`                             | none  | project root mount                  | none                                      | TTY support for interactive use                       |
| mcp-server   | `node dist/bin/harness-mcp.js`                         | none  | project root mount                  | none                                      | stdio mode, stateless                                 |
| orchestrator | `node dist/bin/harness.js orchestrator run --headless` | 8080  | `.harness/workspaces`, project root | `curl http://localhost:8080/api/v1/state` | Optional `/var/run/docker.sock` mount, git installed  |
| dashboard    | `node dist/server/serve.js`                            | 3701  | project root (read-only)            | `curl http://localhost:3701/health`       | `ORCHESTRATOR_URL` env var to connect to orchestrator |

### docker-compose.yml

```yaml
services:
  orchestrator:
    build:
      context: .
      target: orchestrator
    ports:
      - '8080:8080'
    volumes:
      - ./:/project:ro
      - workspaces:/app/.harness/workspaces
      # Uncomment for container-based agent execution:
      # - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - HARNESS_PROJECT_PATH=/project
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/api/v1/state']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    restart: unless-stopped

  dashboard:
    build:
      context: .
      target: dashboard
    ports:
      - '3701:3701'
    volumes:
      - ./:/project:ro
    environment:
      - HARNESS_PROJECT_PATH=/project
      - ORCHESTRATOR_URL=http://orchestrator:8080
    depends_on:
      orchestrator:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3701/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
    restart: unless-stopped

volumes:
  workspaces:
```

### Tagging Strategy

- On git tag `v1.24.3` → images tagged `1.24.3`, `1.24`, `1`, `latest`
- Branch builds (optional) → tagged with commit SHA for testing

### CI Workflow

`.github/workflows/docker.yml`:

- **Trigger:** push tag `v*`
- **Steps:** checkout → setup Docker BuildKit → build all 4 targets → push to ghcr.io
- **Action:** `docker/build-push-action` with matrix strategy for targets
- **Caching:** GitHub Actions cache for Docker layers

### Agent Execution Modes

The orchestrator image supports two agent execution modes, selectable at runtime:

1. **Host-process mode (default):** The orchestrator spawns agents as child processes inside the container. Requires agent tools (e.g., Claude CLI) to be available in the container or mounted via volume.

2. **Container mode (opt-in):** Mount the Docker socket (`/var/run/docker.sock`) into the orchestrator container. The orchestrator uses the existing `docker.ts` runtime to spawn agent containers as siblings on the host Docker daemon. Provides full isolation but requires Docker socket access.

## Success Criteria

| #   | Criterion                                                                                        | Verification                                                       |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1   | All 4 images build successfully from a single `docker build` with `--target`                     | CI builds pass for all targets on tagged release                   |
| 2   | `docker run ghcr.io/.../harness-cli harness --version` prints correct version                    | Manual smoke test + CI validation                                  |
| 3   | `docker run -i ghcr.io/.../harness-mcp` accepts stdio and responds with MCP protocol             | Pipe JSON-RPC initialize request, verify response                  |
| 4   | `docker compose up` brings orchestrator + dashboard up with dashboard connecting to orchestrator | Health checks pass for both services within 30s                    |
| 5   | Orchestrator health check (`/api/v1/state`) returns 200                                          | Automated in docker-compose healthcheck                            |
| 6   | Dashboard health check (`/health`) returns 200                                                   | Automated in docker-compose healthcheck                            |
| 7   | Orchestrator reads project context from mounted volume                                           | Run with project mount, verify `/api/roadmap` returns data         |
| 8   | Orchestrator workspace state persists across container restarts                                  | Create workspace, restart container, verify workspace exists       |
| 9   | Agent execution works in host-process mode                                                       | Dispatch a task with Claude CLI available in container             |
| 10  | Agent execution works in container mode                                                          | Dispatch a task with Docker socket mount, verify sibling container |
| 11  | Images pushed to ghcr.io with semver tags on release                                             | Verify tags `X.Y.Z`, `X.Y`, `X`, `latest` exist after CI run       |
| 12  | Final image size under 400MB per image                                                           | `docker images` check in CI                                        |

## Implementation Order

| Phase | Scope                                                                                                                                         | Depends on |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1     | **Dockerfile** — multi-stage build with all 4 targets, verify each builds and runs locally                                                    | —          |
| 2     | **docker-compose.yml** — orchestrator + dashboard stack with networking, volumes, health checks                                               | Phase 1    |
| 3     | **CI workflow** — GitHub Actions to build + push to ghcr.io on tag push                                                                       | Phase 1    |
| 4     | **Smoke tests** — scripts to validate each image (version check, health endpoints, MCP stdio, project mount)                                  | Phases 1-2 |
| 5     | **Documentation** — usage guide in `docs/guides/docker.md` covering run commands, compose usage, agent execution modes, environment variables | Phases 1-3 |
