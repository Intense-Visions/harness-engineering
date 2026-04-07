# Harness Dashboard

A local web dashboard served by `harness dashboard` that provides at-a-glance project health, roadmap progress, and codebase metrics. Built as a Hono API backend + React SPA frontend in a single `packages/dashboard` package.

## Goals

- Single command (`harness dashboard`) starts a local server showing project status
- Three data domains: roadmap progress, codebase health, knowledge graph metrics
- Real-time updates via SSE with 30-60s background polling
- Light actions: roadmap status updates, trigger validation, regenerate charts
- Three visualization types: Tremor components for standard metrics, custom SVG for Gantt and dependency graph
- Graceful degradation when graph database is unavailable

## Versioning Roadmap

- **v1: Personal dev dashboard (this spec)** — Single developer, single project, local only
- **v2: Orchestrator observability** — Real-time agent monitoring via existing orchestrator HTTP API, WebSocket upgrade for live agent status
- **v3: Team/stakeholder views** — Persistent hosting option, multi-project aggregation, presentation polish

## Out of Scope (v1)

- Orchestrator agent monitoring (v2)
- Multi-project aggregation (v3)
- Persistent/hosted deployment (v3)
- Custom design system
- Git activity analysis
- Real calendar dates or duration tracking for Gantt

## Decisions

| Decision              | Choice                                                           | Rationale                                                                    |
| --------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| v1 use case           | Personal dev dashboard                                           | Smallest useful scope, establishes infrastructure for v2/v3                  |
| v2 use case           | Orchestrator observability                                       | Real-time agent monitoring via existing HTTP API                             |
| v3 use case           | Team/stakeholder views                                           | Polish, persistent hosting, multi-project                                    |
| Tech stack            | Hono API + React SPA                                             | Hono already in project, React for rich UI, clean API boundary               |
| Package structure     | Single `packages/dashboard` with `server/`, `client/`, `shared/` | Simplest operational model, internal boundaries enable future split          |
| Data sources          | Roadmap + codebase health + graph metrics                        | Full picture with graceful graph degradation                                 |
| Refresh model         | Background polling via SSE (30-60s)                              | Establishes real-time infrastructure v2 needs                                |
| Interactivity         | Light actions (status updates, validate, chart regen)            | Useful without being a full mutation surface                                 |
| Standard UI           | Tremor + Tailwind                                                | Dashboard components out of the box, minimal design decisions                |
| Custom charts         | Hand-rolled SVG React components                                 | Full control for Gantt and dependency graph without D3 overhead              |
| Charting for progress | Tremor/Recharts bar chart                                        | Standard component, no custom work needed                                    |
| Design system         | Not needed for v1                                                | One developer, one project — Tremor provides visual consistency              |
| Gantt timeline model  | Milestone-based sequential layout                                | No real dates in data model; synthetic layout shows ordering and grouping    |
| Gantt feature filter  | Non-done features, all milestones in progress chart              | Keeps Gantt readable, progress chart shows full picture                      |
| Blocker visualization | Separate dependency graph                                        | Cleaner than Gantt dependency chains; conditionally omitted when no blockers |

## Technical Design

### Package Structure

```
packages/dashboard/
  src/
    server/
      index.ts              — Hono app, route registration, SSE setup
      routes/
        roadmap.ts          — Roadmap data + actions endpoints
        health.ts           — Codebase health endpoints
        graph.ts            — Graph metrics endpoints (graceful degradation)
        actions.ts          — Mutation endpoints (status update, validate, regen)
      gather/
        roadmap.ts          — Calls parseRoadmap, generateRoadmapCharts
        health.ts           — Calls detect_entropy, check_docs, check_dependencies
        graph.ts            — Calls query_graph, get_decay_trends, get_critical_paths
      sse.ts                — SSE manager, polling loop, broadcast to clients
      cache.ts              — In-memory cache with timestamps
    client/
      index.html            — SPA entry
      main.tsx              — React root, router setup
      pages/
        Overview.tsx         — Landing page with KPI cards and summary
        Roadmap.tsx          — Progress chart, Gantt, dependency graph
        Health.tsx           — Entropy, coverage, doc drift, dependency health
        Graph.tsx            — Node/edge counts, connector status, decay trends, critical paths
      components/
        GanttChart.tsx       — Custom SVG Gantt with milestone sections, status styling
        DependencyGraph.tsx  — Custom SVG directed graph of blocker relationships
        StatusBadge.tsx      — Reusable status indicator
        RefreshIndicator.tsx — "Last updated X ago" with manual refresh trigger
        ActionButton.tsx     — Mutation trigger with loading/success/error states
      hooks/
        useSSE.ts            — EventSource hook, reconnect logic
        useApi.ts            — Fetch wrapper for action endpoints
      lib/
        types.ts             — Client-side type re-exports
    shared/
      types.ts              — API response shapes, SSE event types
      constants.ts          — Polling interval, port defaults, route paths
  vite.config.ts            — Client build config, dev proxy to Hono
  tailwind.config.ts
  package.json
```

### API Routes

| Method | Route                         | Purpose                                                                   |
| ------ | ----------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/overview`               | KPI summary (feature counts by status, health score, graph node count)    |
| GET    | `/api/roadmap`                | Full roadmap data (milestones, features, progress per milestone)          |
| GET    | `/api/roadmap/charts`         | Generated chart data (progress, dependencies, gantt)                      |
| GET    | `/api/health`                 | Codebase health metrics (entropy, coverage, doc drift, dep health)        |
| GET    | `/api/graph`                  | Graph metrics (node/edge counts, connector status, decay, critical paths) |
| GET    | `/api/sse`                    | SSE stream — pushes updated snapshots on poll interval                    |
| POST   | `/api/actions/roadmap-status` | Update feature status via manage_roadmap                                  |
| POST   | `/api/actions/validate`       | Trigger harness validate                                                  |
| POST   | `/api/actions/regen-charts`   | Regenerate roadmap charts page                                            |

### Data Gathering

Each gatherer imports directly from `@harness-engineering/core` and `@harness-engineering/graph`. No MCP or HTTP calls — in-process function calls.

- `gather/roadmap.ts` — Reads `docs/roadmap.md`, calls `parseRoadmap()`, computes per-milestone progress, calls `generateRoadmapCharts()` for chart data
- `gather/health.ts` — Calls entropy detection, doc drift check, dependency health from core
- `gather/graph.ts` — Wraps graph queries in try/catch, returns `null` sections when graph unavailable

### SSE Flow

1. Server starts a polling loop at configurable interval (default 30s)
2. Each tick runs all gatherers, diffs against cache
3. If data changed, broadcasts an SSE event with the updated section(s)
4. Client `useSSE` hook receives events, updates React state
5. Client shows "Last updated Xs ago" from the latest event timestamp

### Graceful Degradation

- Graph unavailable — Graph page shows "Graph not connected" with setup instructions, other pages unaffected
- Individual gatherer failure — That section shows error state, others continue
- SSE disconnect — Client auto-reconnects with exponential backoff, shows stale data with warning

### CLI Entry Point

`harness dashboard` added to the CLI package:

- `--port` — Override default port (default: 3700)
- `--no-open` — Don't auto-open browser
- Dev mode: Vite dev server with proxy to Hono
- Production mode: Hono serves Vite-built static assets from `dist/`

### Gantt Chart Component

- Milestone sections as labeled row groups
- Features as horizontal bars, uniform width (synthetic duration)
- Status determines bar color: done=green, active=blue, planned=gray, blocked=red
- Non-done features by default, filterable by milestone/status via dropdown

### Dependency Graph Component

- Nodes positioned via simple force-directed or layered layout
- Node color by status, edges from blocker to blocked feature
- Omitted entirely when no blocker relationships exist

### Progress Chart

- Tremor `BarChart` component, one bar group per milestone, done vs remaining segments

### Chart Generation Core Function

The earlier Roadmap Gantt Visualization spec is absorbed into this dashboard. The core chart generation logic (`generateRoadmapCharts()` in `packages/core/src/roadmap/charts.ts`) is still built as a pure function for reuse:

```typescript
interface ChartOptions {
  filter?: {
    status?: FeatureStatus[];
    milestone?: string[];
  };
}

interface RoadmapCharts {
  progress: MilestoneProgress[]; // Per-milestone done/total counts
  dependencies: DepEdge[] | null; // Blocker relationships, null if none
  gantt: GanttSection[]; // Milestone-grouped feature list with status
}

function generateRoadmapCharts(roadmap: Roadmap, options?: ChartOptions): RoadmapCharts;
```

This function returns structured data (not Mermaid strings) that the React components consume directly. A separate `generateRoadmapChartsPage()` can still produce a Mermaid markdown page for `docs/roadmap-charts.md` if desired.

## Success Criteria

1. `harness dashboard` starts a local server and opens a browser to the overview page
2. Overview page displays KPI cards: total features, done count, in-progress count, planned count, health score summary, graph node count (or "unavailable")
3. Roadmap page renders a progress bar chart (per-milestone done vs remaining), a Gantt chart of non-done features grouped by milestone with status styling, and a dependency graph when blocker relationships exist
4. Health page displays entropy score, coverage baselines, doc drift status, and dependency health metrics
5. Graph page displays node/edge counts, connector status, decay trends, and critical paths — or a "Graph not connected" message when unavailable
6. SSE stream delivers data updates to the browser without manual refresh within the configured polling interval
7. Light actions work: updating a feature's roadmap status, triggering `harness validate`, and regenerating charts — each with loading/success/error feedback in the UI
8. When the graph database is unavailable, all non-graph pages function normally
9. When an individual gatherer fails, that section shows an error state while other sections continue to display data
10. SSE client auto-reconnects after disconnect and shows stale data with a warning indicator
11. Gantt chart and dependency graph are filterable by milestone and status
12. The `packages/dashboard` internal boundary (`server/`, `client/`, `shared/`) is respected — no direct imports from `server/` in `client/` or vice versa

## Implementation Order

1. **Package scaffolding** — `packages/dashboard` with Vite + React + Tailwind + Tremor setup, Hono server skeleton, dev proxy config. Verify `harness dashboard` starts and serves a hello-world page.
2. **Shared types + data gathering layer** — Shared API types, cache, and all three gatherers (roadmap, health, graph) with graceful degradation. Unit tests for gatherers.
3. **API routes** — Hono routes serving gathered data. SSE endpoint with polling loop and broadcast. Verify data flows from gatherers through API to browser.
4. **Overview page** — KPI cards pulling from `/api/overview`. SSE integration via `useSSE` hook. Refresh indicator.
5. **Roadmap page** — Progress bar chart (Tremor), custom SVG Gantt chart, custom SVG dependency graph. Milestone/status filters. Absorbs the earlier Gantt spec work.
6. **Health page** — Entropy, coverage, doc drift, dependency health displays using Tremor components.
7. **Graph page** — Graph metrics displays with "not connected" fallback.
8. **Action endpoints + UI** — Mutation routes, ActionButton component, wiring into roadmap page for status updates, validate trigger, chart regeneration.
9. **CLI integration + polish** — `harness dashboard` command with `--port` and `--no-open` flags, production build serving, auto-open browser.
