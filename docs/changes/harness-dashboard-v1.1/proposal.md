# Harness Dashboard v1.1 — Extended Observability

Extends the v1 dashboard with three new capabilities: expanded health metrics (security, performance, architecture), a dedicated CI checks page, and an interactive impact/blast radius explorer. All new data sources use startup-then-on-demand freshness — gathered once on server start, refreshed explicitly via action buttons.

**Keywords:** dashboard, security-scan, performance-metrics, architecture-baselines, blast-radius, anomaly-detection, CI-checks, on-demand-refresh

## Goals

- Surface security scan, performance metrics, and architecture baseline data on the Health page
- Provide a dedicated CI page showing pass/fail status for all `harness ci check` sub-commands
- Enable interactive blast radius exploration: anomaly list as default discovery, search box for targeted queries, shared propagation visualization
- Maintain the existing SSE polling model for cheap data; use on-demand refresh for expensive checks
- All new capabilities degrade gracefully when underlying tools are unavailable

## Out of Scope (v1.1)

- WebSocket upgrade (v2)
- Persistent check result storage across server restarts
- Custom check configurations or thresholds via the dashboard UI
- File watcher / auto-refresh on file change

## Decisions

| Decision                 | Choice                                                  | Rationale                                                         |
| ------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Spec boundary            | Separate v1.1 spec                                      | v1 is complete and reviewed; clean increment                      |
| Data freshness           | Startup + on-demand                                     | Expensive checks (security, perf, arch) shouldn't poll every 30s  |
| Health expansion         | Add security/perf/arch sections to existing Health page | Continuous health metrics belong together                         |
| CI page                  | Dedicated 5th page                                      | Pass/fail gate results are a distinct concept from health metrics |
| Impact page              | Anomaly list default + search + blast radius viz        | Discovery-first (anomalies) with power-user escape hatch (search) |
| Blast radius interaction | POST endpoint, synchronous response                     | Simplest model; mitigate latency with `maxDepth: 3` default       |
| Data source integration  | In-process imports from core/graph                      | Compile-time safety, no CLI JSON format coupling                  |
| Gather pattern           | Same as v1 with new "on-demand" variant                 | Consistent architecture; POST triggers re-gather + cache update   |
| Anomaly detection        | `GraphAnomalyAdapter` from `@harness-engineering/graph` | Already returns articulation points + statistical outliers        |
| Blast radius engine      | `CascadeSimulator` from `@harness-engineering/graph`    | Already returns layered propagation with probability scores       |

## Technical Design

### New Gatherers

```
gather/
  security.ts    — SecurityScanner from @harness-engineering/core → CheckSecurityResult
  perf.ts        — EntropyAnalyzer (structural mode) from core → CheckPerfResult
  arch.ts        — ArchBaselineManager from core → CheckArchResult
  anomalies.ts   — GraphAnomalyAdapter from @harness-engineering/graph → AnomalyReport
  blast-radius.ts — CascadeSimulator from @harness-engineering/graph → CascadeResult
```

Security, perf, and arch gatherers follow the existing v1 pattern: async function, try/catch, return `{ data } | { error }`. They run once during the first SSE tick, then only when triggered by a POST action.

Anomalies gatherer runs on startup (same as above). Blast radius gatherer is query-scoped — only runs when called with a specific `nodeId`.

### New API Routes

| Method | Route                         | Purpose                                                    |
| ------ | ----------------------------- | ---------------------------------------------------------- |
| GET    | `/api/ci`                     | Aggregated pass/fail for all check commands                |
| POST   | `/api/actions/refresh-checks` | Re-run security + perf + arch + CI checks                  |
| GET    | `/api/impact/anomalies`       | Top anomalies (articulation points + statistical outliers) |
| POST   | `/api/impact/blast-radius`    | On-demand blast radius query `{ nodeId, maxDepth? }`       |

### New/Modified Pages

- **Health.tsx** (modified) — Adds three new sections below existing entropy metrics:
  - Security: finding count by severity (error/warning/info), top findings list, category breakdown
  - Performance: violation count, complexity/coupling/size budget violations list
  - Architecture: passed/failed badge, regression count, new violations list

- **CI.tsx** (new) — Row of pass/fail badges for: validate, check-deps, check-arch, check-perf, check-security, check-docs, phase-gate. Each badge expandable to show violation details. "Run All Checks" action button triggers `POST /api/actions/refresh-checks`. "Last checked X ago" timestamp.

- **Impact.tsx** (new) — Two-panel layout:
  - **Left panel:** Anomaly list — articulation points sorted by `dependentCount`, statistical outliers sorted by z-score. Each row shows node name, type, key metric. Clickable.
  - **Right panel:** Blast radius visualization — layered SVG graph (reuses `DependencyGraph` layout approach). Node opacity proportional to `cumulativeProbability`. Depth rings labeled. Summary bar: total affected, high/medium/low risk counts.
  - **Top bar:** Search input for direct node query. Depth selector (1-5, default 3).

### New Shared Types

```typescript
// --- CI Page ---

interface CIData {
  checks: CheckResult[];
  lastRun: string | null;
}

interface CheckResult {
  name: string; // 'validate' | 'check-deps' | 'check-arch' | ...
  passed: boolean;
  errorCount: number;
  warningCount: number;
  details?: string; // summary line
}

// --- Health Expansion ---

interface SecurityData {
  valid: boolean;
  findings: SecurityFindingSummary[];
  stats: { filesScanned: number; errorCount: number; warningCount: number; infoCount: number };
}

interface SecurityFindingSummary {
  ruleId: string;
  category: string;
  severity: string;
  file: string;
  line: number;
  message: string;
}

interface PerfData {
  valid: boolean;
  violations: PerfViolationSummary[];
  stats: { filesAnalyzed: number; violationCount: number };
}

interface PerfViolationSummary {
  metric: string;
  file: string;
  value: number;
  threshold: number;
  severity: string;
}

interface ArchData {
  passed: boolean;
  totalViolations: number;
  regressions: { category: string; delta: number }[];
  newViolations: { file: string; detail: string; severity: string }[];
}

// --- Impact Page ---

interface AnomalyData {
  outliers: AnomalyOutlier[];
  articulationPoints: AnomalyArticulationPoint[];
  overlapCount: number;
}

interface AnomalyOutlier {
  nodeId: string;
  name: string;
  type: string;
  metric: string;
  value: number;
  zScore: number;
}

interface AnomalyArticulationPoint {
  nodeId: string;
  name: string;
  componentsIfRemoved: number;
  dependentCount: number;
}

interface BlastRadiusData {
  sourceNodeId: string;
  sourceName: string;
  layers: BlastRadiusLayer[];
  summary: {
    totalAffected: number;
    maxDepth: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
  };
}

interface BlastRadiusLayer {
  depth: number;
  nodes: BlastRadiusNode[];
}

interface BlastRadiusNode {
  nodeId: string;
  name: string;
  type: string;
  probability: number;
  parentId: string;
}
```

### SSE Event Updates

Add `security`, `perf`, `arch`, and `ci` event types to the `SSEEvent` discriminated union. These are only emitted after an on-demand refresh, not during regular polling ticks. The `overview` event gains optional `securityStatus`, `perfStatus`, `archStatus` summary fields for the KPI cards.

### Graceful Degradation

- Graph unavailable → Impact page shows "Graph not connected" (same as existing Graph page). CI page still works (non-graph checks pass).
- Individual check failure → That section shows error state, badge shows "error" instead of pass/fail. Other sections unaffected.

## Success Criteria

1. Health page displays security scan results: finding count by severity, category breakdown, and top findings list
2. Health page displays performance metrics: violation count with complexity/coupling/size details
3. Health page displays architecture baseline status: passed/failed, regression count, new violations
4. CI page displays pass/fail badges for all 7 check commands (validate, check-deps, check-arch, check-perf, check-security, check-docs, phase-gate)
5. CI page "Run All Checks" button triggers all checks and updates badges with loading → result states
6. CI page shows "Last checked X ago" timestamp that updates after each refresh
7. Each CI badge is expandable to show violation/finding details
8. Impact page loads with anomaly list: articulation points sorted by dependent count, statistical outliers sorted by z-score
9. Impact page: clicking an anomaly node renders its blast radius visualization in the right panel
10. Impact page: search box accepts a file path or node name and renders the blast radius for the matching node
11. Impact page: depth selector (1-5, default 3) controls blast radius `maxDepth` parameter
12. Blast radius visualization renders layered SVG with node opacity proportional to cumulative probability and depth rings labeled
13. Blast radius summary bar shows total affected, high/medium/low risk counts
14. All new data sources gather once on server startup and refresh only via explicit action buttons
15. When the graph is unavailable, the Impact page shows "Graph not connected" while CI and Health pages function normally
16. When an individual check fails, that section shows an error state while other sections continue displaying data
17. Overview page KPI cards include security status, perf status, and arch status summaries
18. Navigation includes 6 pages: Overview, Roadmap, Health, Graph, CI, Impact

## Implementation Order

1. **Shared types + new gatherers** — Add all new types to `shared/types.ts`. Implement `gather/security.ts`, `gather/perf.ts`, `gather/arch.ts`, `gather/anomalies.ts`, `gather/blast-radius.ts`. Unit tests for each gatherer with mocked core/graph imports.
2. **On-demand gather infrastructure** — Add a `GatherCache` layer that tracks per-gatherer last-run timestamps and supports explicit refresh triggers. Wire into `ServerContext`. Update the SSE manager to run new gatherers once on first tick only.
3. **CI route + page** — `GET /api/ci`, `POST /api/actions/refresh-checks`. New `CI.tsx` page with pass/fail badges, expandable details, Run All Checks button. Add to nav.
4. **Health page expansion** — `GET /api/health` response extended with security/perf/arch data. Health page gains three new collapsible sections. Overview KPI cards updated.
5. **Impact routes + anomaly list** — `GET /api/impact/anomalies`, `POST /api/impact/blast-radius`. New `Impact.tsx` page with left-panel anomaly list, search box, depth selector. Add to nav.
6. **Blast radius visualization** — New `BlastRadiusGraph.tsx` SVG component. Layered layout with probability-based opacity, depth rings, summary bar. Wire into Impact page right panel.
