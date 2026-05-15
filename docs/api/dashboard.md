# @harness-engineering/dashboard

Local web dashboard for harness project health, roadmap visualization, orchestrator monitoring, and knowledge graph exploration. Built with React 18 + Hono, with Server-Sent Events for live updates.

**Version:** 0.6.1

## Installation

```bash
npm install @harness-engineering/dashboard
```

## Quick Start

```bash
# From any harness-enabled project:
harness dashboard

# Or during development (from packages/dashboard):
pnpm dev
```

The dashboard opens at `http://localhost:3701` by default. The `harness dashboard` command auto-opens the browser (pass `--no-open` to suppress).

## CLI Options

```bash
harness dashboard [options]

  --port <port>      Client dev server port (default: 3700)
  --api-port <port>  API server port (default: 3701)
  --no-open          Do not automatically open browser
  --cwd <path>       Project directory (defaults to cwd)
```

## Pages

The dashboard has 10 pages:

| Page             | Route           | Description                                                                                                      |
| ---------------- | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Overview**     | `/`             | At-a-glance project summary: roadmap progress, health score, graph stats, security/perf/arch check results       |
| **Attention**    | `/attention`    | Escalated interactions from the orchestrator requiring human review, with enriched specs and concern signals     |
| **Adoption**     | `/adoption`     | Skill usage metrics: invocation counts, success rates, average duration, and last-used timestamps                |
| **Health**       | `/health`       | Entropy-based project health with collapsible sections for security findings, perf checks, and arch violations   |
| **Analyze**      | `/analyze`      | Interactive intelligence pipeline: submit a task description and stream SEL, CML, and PESL results in real time  |
| **Roadmap**      | `/roadmap`      | Stats bar, milestone-grouped feature table with claim workflow, dependency graph, and assignment history         |
| **Orchestrator** | `/orchestrator` | Live orchestrator state: running agents, rate limits, concurrency, token usage, tick activity, and agent streams |
| **Impact**       | `/impact`       | Graph anomaly detection (articulation points, outliers) and interactive blast radius visualization               |
| **Graph**        | `/graph`        | Knowledge graph statistics: node/edge counts, type breakdown, density, connected components                      |
| **Chat**         | `/chat`         | Full-screen AI chat interface with skill-aware context, command palette, and session management                  |

## API Routes

The Hono server registers 12 routers that expose the following endpoints:

| Method | Endpoint                      | Description                                                    |
| ------ | ----------------------------- | -------------------------------------------------------------- |
| GET    | `/api/health-check`           | Server liveness check (`{ status: "ok" }`)                     |
| GET    | `/api/overview`               | Combined roadmap + health + graph snapshot                     |
| GET    | `/api/roadmap`                | Parsed roadmap data (milestones, features)                     |
| GET    | `/api/roadmap/charts`         | Chart-specific data (milestones, features, blocker edges)      |
| GET    | `/api/health`                 | Health result with optional security/perf/arch data            |
| GET    | `/api/graph`                  | Knowledge graph statistics                                     |
| GET    | `/api/adoption`               | Skill adoption snapshot                                        |
| GET    | `/api/ci`                     | CI check data from gather cache                                |
| GET    | `/api/impact/anomalies`       | Graph anomalies (articulation points, outliers)                |
| POST   | `/api/impact/blast-radius`    | Compute blast radius for a node (`{ nodeId, maxDepth? }`)      |
| GET    | `/api/sse`                    | SSE event stream (overview + checks events)                    |
| POST   | `/api/actions/roadmap-status` | Update a feature's status in roadmap.md                        |
| POST   | `/api/actions/validate`       | Run `harness validate` and return output                       |
| POST   | `/api/actions/regen-charts`   | Invalidate caches and regenerate chart markers                 |
| POST   | `/api/actions/refresh-checks` | Re-run security/perf/arch/anomaly checks and broadcast via SSE |

### Registered Routers

The server entry point (`src/server/index.ts`) registers these routers under the `/api` prefix:

| Router                    | Domain                                       |
| ------------------------- | -------------------------------------------- |
| `buildHealthCheckRouter`  | Liveness check                               |
| `buildOverviewRouter`     | Combined overview snapshot                   |
| `buildRoadmapRouter`      | Roadmap data and charts                      |
| `buildHealthRouter`       | Project health and entropy                   |
| `buildGraphRouter`        | Knowledge graph statistics                   |
| `buildSseRouter`          | Server-Sent Events stream                    |
| `buildAdoptionRouter`     | Skill adoption metrics                       |
| `buildActionsRouter`      | Mutation actions (status, validate, refresh) |
| `buildCIRouter`           | CI check results                             |
| `buildImpactRouter`       | Anomaly detection and blast radius           |
| `buildDecayTrendsRouter`  | Decay trend analysis                         |
| `buildTraceabilityRouter` | Traceability queries                         |

## Architecture

```
packages/dashboard/
  src/
    client/              React SPA (Vite + Tailwind CSS)
      pages/             10 page components (one per route)
      components/        Shared UI: KpiCard, BlastRadiusGraph, chat system, roadmap components
      hooks/             useSSE, useOrchestratorSocket, useApi, useChatContext, etc.
      utils/             Type guards, chat streaming, context-to-prompt
    server/              Hono API server
      routes/            Route handlers (one file per domain)
      gather/            Data gatherers: roadmap, health, graph, security, perf, arch, anomalies
      sse.ts             SSEManager: shared polling loop, broadcast to all connected clients
      cache.ts           In-memory cache with configurable TTL (default 60s)
      gather-cache.ts    Cache for expensive one-shot gatherers (security, perf, arch, anomalies)
      context.ts         ServerContext: project path, cache, SSE manager
    shared/              Types, constants, and type guards shared between client and server
```

### Client-Server Communication

The dashboard uses three communication patterns:

**SSE (Server-Sent Events)** -- The Overview, Health, Roadmap, and Graph pages subscribe to `/api/sse`. The server runs a shared polling loop (default 30s interval) that gathers roadmap, health, and graph data and broadcasts to all connected clients. Expensive checks (security, perf, arch, anomalies) run once on first connection and are cached for subsequent clients.

**WebSocket** -- The Orchestrator and Attention pages connect to the orchestrator's WebSocket at `/ws` for real-time snapshots of running agents, pending interactions, rate limits, and agent streaming events.

**REST** -- All pages can also fetch data via REST endpoints. The Adoption, Impact, and Chat pages use direct API calls.

### Configuration

#### Environment Variables

| Variable                | Default | Description                     |
| ----------------------- | ------- | ------------------------------- |
| `DASHBOARD_API_PORT`    | `3701`  | Hono API server port            |
| `DASHBOARD_CLIENT_PORT` | `3700`  | Vite dev server port            |
| `HARNESS_PROJECT_PATH`  | `cwd()` | Project root for data gathering |

#### Constants

| Constant                   | Value            | Description                       |
| -------------------------- | ---------------- | --------------------------------- |
| `API_PORT`                 | `3701`           | Default API server port           |
| `DASHBOARD_PORT`           | `3700`           | Default client dev server port    |
| `DEFAULT_POLL_INTERVAL_MS` | `30000`          | SSE polling interval (30 seconds) |
| `GRAPH_DIR`                | `.harness/graph` | Knowledge graph directory path    |

## Dependencies

| Dependency                   | Purpose                               |
| ---------------------------- | ------------------------------------- |
| `@harness-engineering/core`  | Project health, entropy detection     |
| `@harness-engineering/graph` | Knowledge graph queries, blast radius |
| `@harness-engineering/types` | Shared type definitions               |
| `hono`                       | API server framework                  |
| `@hono/node-server`          | Node.js adapter for Hono              |
| `react` / `react-dom`        | UI framework (React 18)               |
| `react-router`               | Client-side routing                   |
| `tailwindcss`                | Utility-first CSS                     |
| `framer-motion`              | Animations                            |
| `lucide-react`               | Icons                                 |
| `react-virtuoso`             | Virtualized lists (Attention page)    |
| `react-markdown`             | Markdown rendering (Chat, Attention)  |
| `react-syntax-highlighter`   | Code block highlighting               |

## Development

```bash
# Install dependencies
pnpm install

# Start dev mode (Vite client + tsx server, hot reload)
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

In dev mode, `pnpm dev` runs the Vite client dev server (port 3700) and the Hono API server (port 3701) concurrently. In production, the Hono server serves both the API and the built client assets from a single port (3701).
