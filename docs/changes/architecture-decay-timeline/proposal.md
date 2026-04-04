# Architecture Decay Timeline

**Keywords:** architecture, decay, timeline, snapshots, stability-score, trends, metrics, time-series, CI, MCP

## Overview

Harness captures architectural health at a point in time via `check-arch` baselines, but there is no historical record. A team cannot answer "is our architecture getting healthier or sicker over the past 3 months?" — only "are we healthy right now?" This spec adds time-series tracking of architectural health metrics. A standalone `TimelineManager` captures category-level metric snapshots to `.harness/arch/timeline.json`, each tagged with timestamp, commit hash, and a composite 0-100 stability score. Users view trends via `harness snapshot` CLI commands, and agents query via a `get_decay_trends` MCP tool. A scheduled CI workflow ensures consistent weekly captures alongside on-demand CLI usage.

## Goals

1. **Historical visibility** — answer "are we getting healthier or sicker?" with concrete data over weeks and months
2. **Headline stability score** — composite 0-100 number for at-a-glance architectural health assessment
3. **Per-category trend analysis** — pinpoint which metric dimensions (complexity, coupling, dead code, etc.) are decaying
4. **Agent-queryable data** — MCP tool enables AI agents to reason about architectural trends, feeding into downstream Predictive Architecture Failure feature
5. **Zero-effort capture** — scheduled CI workflow ensures snapshots happen without human intervention

## Non-Goals

- File-level per-snapshot detail (use current baseline/graph for point-in-time drill-down)
- HTML/visual chart rendering (data is available for later visualization layers)
- Automatic remediation or fix suggestions based on decay trends
- Graph node storage of snapshots (timeline file is authoritative store)
- Predictive failure analysis (downstream feature #80 builds on this data)
- Custom weighting configuration for stability score (start with equal weights; configurable weights are a future enhancement)

## Decisions

| #   | Decision                                                                   | Rationale                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Dedicated timeline file** (not graph nodes)                              | Extends existing `.harness/arch/baselines.json` pattern. No graph bloat — timeline is separate. Easy to prune, export, and visualize. Graph integration can be added later if Predictive Architecture Failure needs it.                                                   |
| D2  | **Category-level granularity** (not project-level or file-level)           | Maps 1:1 to existing `MetricResult` category structure (~7 categories per snapshot). Actionable signal ("complexity is decaying") without file-level bloat. File detail already available via baseline/graph.                                                             |
| D3  | **CLI command + scheduled CI workflow** (not CI-only or CLI-only)          | CLI command is the core deliverable — CI just calls it on a schedule. On-demand captures for before/after comparisons. Deduplicate by commit hash.                                                                                                                        |
| D4  | **CLI text + MCP tool** (not HTML visualization)                           | CLI covers human use case, MCP tool covers agent use case. Critical for downstream Predictive Architecture Failure. HTML can be layered on later without changing the data model.                                                                                         |
| D5  | **Composite 0-100 stability score with equal weights** (not category-only) | ADR-001 explicitly envisions "Your architecture stability: 95% -> 78%." Equal weights across categories are simple to compute and explain. Configurable weights are a future enhancement.                                                                                 |
| D6  | **Standalone TimelineManager** (not extending ArchBaselineManager)         | Timeline ("how has architecture changed over months") is a different concern from baseline ("current state vs last known good"). Independent evolution avoids risking baseline regression logic. ~10 lines of shared collector orchestration is not worth an abstraction. |

## Technical Design

### Timeline Data Model

**New file:** `packages/core/src/architecture/timeline-types.ts`

```typescript
export interface TimelineSnapshot {
  /** ISO 8601 timestamp of capture */
  capturedAt: string;
  /** Git commit hash at capture time */
  commitHash: string;
  /** Composite stability score (0-100, higher is healthier) */
  stabilityScore: number;
  /** Per-category metric aggregates */
  metrics: Record<ArchMetricCategory, CategorySnapshot>;
}

export interface CategorySnapshot {
  /** Aggregate metric value (e.g., violation count, avg complexity) */
  value: number;
  /** Count of violations in this category */
  violationCount: number;
}

export interface TimelineFile {
  version: 1;
  snapshots: TimelineSnapshot[];
}
```

**Storage location:** `.harness/arch/timeline.json`

### TimelineManager

**New file:** `packages/core/src/architecture/timeline-manager.ts`

```typescript
export class TimelineManager {
  constructor(private rootDir: string) {}

  /** Capture a new snapshot from current metric results */
  capture(results: MetricResult[], commitHash: string): TimelineSnapshot;

  /** Load timeline from disk */
  load(): TimelineFile;

  /** Save timeline to disk (atomic write) */
  save(timeline: TimelineFile): void;

  /** Compute trends between snapshots over a window */
  trends(options?: { last?: number; since?: string }): TrendResult;

  /** Compute composite stability score from metric results */
  computeStabilityScore(metrics: Record<ArchMetricCategory, CategorySnapshot>): number;
}
```

**`capture()` flow:**

1. Aggregate `MetricResult[]` by category (same aggregation logic as `ArchBaselineManager.capture()`, but producing `CategorySnapshot` instead of `CategoryBaseline`)
2. Compute stability score via `computeStabilityScore()`
3. Create `TimelineSnapshot` with current timestamp and commit hash
4. Load existing timeline, append snapshot, save

**`computeStabilityScore()` formula:**

- For each category, normalize the value to a 0-1 "health" score where 0 = worst observed, 1 = no violations
- Categories with 0 violations get a health score of 1.0
- Categories with violations: `health = max(0, 1 - (value / threshold))` where threshold is a reasonable ceiling per category (configurable, defaults provided)
- Stability score = `round(mean(categoryHealthScores) * 100)`
- Equal weight across all categories (7 categories, each ~14.3% weight)

**Deduplication:** If the latest snapshot has the same `commitHash` as the new capture, replace it instead of appending.

### Trend Computation

**New type in `timeline-types.ts`:**

```typescript
export interface TrendResult {
  /** Overall stability trend */
  stability: TrendLine;
  /** Per-category trends */
  categories: Record<ArchMetricCategory, TrendLine>;
  /** Number of snapshots analyzed */
  snapshotCount: number;
  /** Time range covered */
  from: string;
  to: string;
}

export interface TrendLine {
  /** Current value */
  current: number;
  /** Previous value (from comparison snapshot) */
  previous: number;
  /** Absolute delta (current - previous) */
  delta: number;
  /** Direction indicator */
  direction: 'improving' | 'stable' | 'declining';
}
```

**Direction thresholds:** `|delta| < 2` = stable, positive delta on stability = improving, negative = declining. For violation categories, direction is inverted (fewer violations = improving).

### CLI Commands

**New file:** `packages/cli/src/commands/snapshot.ts`

Subcommands under `harness snapshot`:

#### `harness snapshot capture`

1. Run `runAll(archConfig, cwd)` to collect current metrics
2. Get commit hash via `git rev-parse HEAD`
3. Call `TimelineManager.capture(results, commitHash)`
4. Print summary: stability score, category values, delta from previous snapshot

**Output format:**

```
Architecture Snapshot captured (2026-04-04, abc1234)

  Stability: 82/100 (+3 from last)

  Category          Value   Delta   Trend
  circular-deps         0      0    =
  layer-violations      2     -1    improving
  complexity           47     +5    declining
  coupling           0.38   -0.02   improving
  forbidden-imports     0      0    =
  module-size           1      0    =
  dependency-depth      4     +1    declining
```

#### `harness snapshot trends`

Options:

- `--last <N>` — show trends over last N snapshots (default: 10)
- `--since <date>` — show trends since ISO date
- `--json` — output as JSON for programmatic consumption

1. Load timeline
2. Call `TimelineManager.trends(options)`
3. Print trend table with directional arrows

**Output format:**

```
Architecture Trends (last 10 snapshots, 2026-01-15 to 2026-04-04)

  Stability: 82/100 (was 71 on 2026-01-15, +11)

  Category          Current   Start   Delta   Trend
  circular-deps         0       3      -3     improving
  layer-violations      2       5      -3     improving
  complexity           47      38      +9     declining
  coupling           0.38    0.45    -0.07    improving
  forbidden-imports     0       0       0     =
  module-size           1       2      -1     improving
  dependency-depth      4       3      +1     declining
```

#### `harness snapshot list`

Lists all captured snapshots with date, commit, and stability score. Useful for selecting comparison points.

### MCP Tool

**New file:** `packages/cli/src/mcp/tools/decay-trends.ts`

Tool name: `get_decay_trends`

**Input schema:**

```typescript
{
  last?: number;     // Number of recent snapshots (default: 10)
  since?: string;    // ISO date filter
  category?: string; // Filter to single category
}
```

**Output:** Structured `TrendResult` JSON for agent consumption. Agents can use this to answer questions like "is the architecture decaying?" or "which metrics are getting worse?"

**Registration:** Add to MCP tool registry in `packages/cli/src/mcp/tools/index.ts` following existing patterns.

### CI Workflow

**New file:** `.github/workflows/snapshot.yml`

```yaml
name: Architecture Snapshot
on:
  schedule:
    - cron: '0 6 * * 1' # Every Monday at 06:00 UTC
  workflow_dispatch: {} # Manual trigger

jobs:
  snapshot:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      - run: node packages/cli/dist/bin/harness.js snapshot capture
      - name: Commit snapshot
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .harness/arch/timeline.json
          git diff --cached --quiet || git commit -m "chore: architecture snapshot $(date +%Y-%m-%d)"
          git push
```

### File Layout

| File                                                 | Action | Description                 |
| ---------------------------------------------------- | ------ | --------------------------- |
| `packages/core/src/architecture/timeline-types.ts`   | New    | Timeline data model types   |
| `packages/core/src/architecture/timeline-manager.ts` | New    | TimelineManager class       |
| `packages/core/src/architecture/index.ts`            | Modify | Export new timeline modules |
| `packages/cli/src/commands/snapshot.ts`              | New    | CLI snapshot subcommands    |
| `packages/cli/src/commands/index.ts`                 | Modify | Register snapshot command   |
| `packages/cli/src/mcp/tools/decay-trends.ts`         | New    | get_decay_trends MCP tool   |
| `packages/cli/src/mcp/tools/index.ts`                | Modify | Register MCP tool           |
| `.github/workflows/snapshot.yml`                     | New    | Weekly CI snapshot workflow |

## Success Criteria

| #    | Criterion                                                                     | Verification                                                          |
| ---- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| SC1  | `harness snapshot capture` creates/appends to `.harness/arch/timeline.json`   | Unit test: capture writes valid TimelineFile; CLI integration test    |
| SC2  | Each snapshot contains all 7 metric categories with value and violation count | Unit test: capture aggregates all categories from MetricResult[]      |
| SC3  | Stability score is 0-100 computed from equal-weighted category health         | Unit test: known inputs produce expected scores                       |
| SC4  | Duplicate commit hash replaces existing snapshot instead of appending         | Unit test: capture with same commit deduplicates                      |
| SC5  | `harness snapshot trends` computes deltas and direction between snapshots     | Unit test: trends() with known timeline produces expected TrendResult |
| SC6  | `harness snapshot trends --json` outputs structured JSON                      | CLI integration test                                                  |
| SC7  | `get_decay_trends` MCP tool returns TrendResult for agent consumption         | MCP tool test with mock timeline                                      |
| SC8  | CI workflow captures weekly snapshot and commits to repo                      | Workflow file exists; manual dispatch works                           |
| SC9  | Atomic file writes (temp file + rename) prevent corruption                    | Unit test: concurrent captures don't corrupt timeline                 |
| SC10 | `harness validate` passes after snapshot capture                              | Integration test                                                      |

## Implementation Order

1. **Phase 1: Core types and TimelineManager** — timeline-types.ts, timeline-manager.ts with capture/load/save/trends, unit tests. This is the foundation everything else builds on.
2. **Phase 2: CLI commands** — `harness snapshot capture`, `harness snapshot trends`, `harness snapshot list`. Integration tests.
3. **Phase 3: MCP tool** — `get_decay_trends` tool registration and implementation. Tool test.
4. **Phase 4: CI workflow** — `.github/workflows/snapshot.yml` with weekly cron and manual dispatch.
