# Performance Enforcement for Harness Engineering

**Date:** 2026-03-19
**Status:** Proposed
**Keywords:** performance, complexity, benchmarks, baselines, hotspots, budgets, entropy, regression, coupling, critical-paths

## Overview

Code performance is unmonitored and unenforced in the harness workflow. No structural complexity gates, no build size budgets, no runtime regression detection. Performance issues are discovered late (production) rather than early (commit/PR).

This proposal bakes performance enforcement into the harness workflow as a progressive, three-layer system that catches issues at the earliest possible point — from commit-time static analysis to PR-time benchmark regression detection.

### Approach: Hybrid

Structural complexity and size checks extend the entropy system (they ARE entropy — structural decay and bloat). Runtime benchmarks get a dedicated module (they require code execution, baseline tracking, and environment awareness).

**Boundary rule:** If it can be checked without executing code, it's entropy. If it requires running code, it's the perf module.

### Scope

- **Layer 1:** Structural complexity enforcement via entropy detection (static, fast, commit-blocking)
- **Layer 2:** Build/size budget enforcement via entropy detection (static, moderate, merge-blocking)
- **Layer 3:** Runtime benchmark regression detection via dedicated perf module (requires execution, baseline-tracked, merge-blocking after baseline established)

### Out of Scope

- Production monitoring / APM integration
- Load testing / stress testing
- Browser-specific performance (Lighthouse, Core Web Vitals)
- Hardware-specific baselines (all benchmarks run in CI environment)

---

## Decisions

| #   | Decision                                                                     | Rationale                                                                                                                           |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Three progressive layers: structural → build → runtime                       | Cheapest enforcement ships first. Each layer adds value independently.                                                              |
| 2   | Structural and size checks extend entropy system                             | Structural decay IS entropy. Reuses existing detectors, graph adapters, config patterns, and reporting.                             |
| 3   | Runtime benchmarks get a dedicated perf module                               | Benchmarks require code execution, baseline tracking, and environment awareness — fundamentally different from static analysis.     |
| 4   | Boundary rule: "runs code → perf module; no execution → entropy"             | Simple, defensible split that prevents ownership ambiguity between the two systems.                                                 |
| 5   | Critical paths identified via graph inference + `@perf-critical` annotations | Graph catches high-fan-in functions automatically. Annotations let developers flag domain-specific hot paths the graph can't infer. |
| 6   | Severity-tiered enforcement (Tier 1/2/3)                                     | Matches existing `check-mechanical-constraints` model. Tier 1 blocks commits, Tier 2 blocks merges, Tier 3 is informational.        |
| 7   | Vitest bench for authoring, custom harness runner for enforcement            | Familiar DX for writing benchmarks. Harness controls execution, baseline comparison, and regression thresholds.                     |
| 8   | Baselines checked in, auto-managed                                           | `.harness/perf/baselines.json` committed for transparency. `harness perf update-baselines` CLI + CI auto-update on merge to main.   |
| 9   | New `performance-guardian` persona for enforcement                           | Owns hard gates on PRs. Existing `code-reviewer` gets lightweight perf observations. `codebase-health-analyst` gets trend tracking. |
| 10  | Graph-enhanced metrics: hotspot score = churn × complexity                   | Leverages existing graph infrastructure. High-churn + high-complexity files are the highest-risk performance targets.               |

### Tier Assignment

| Metric                               | Tier      | Gate   | Default Threshold            |
| ------------------------------------ | --------- | ------ | ---------------------------- |
| Cyclomatic complexity per function   | 1 (error) | Commit | > 15                         |
| Cyclomatic complexity per function   | 2 (warn)  | Merge  | > 10                         |
| Nesting depth                        | 2 (warn)  | Merge  | > 4 levels                   |
| Function length                      | 2 (warn)  | Merge  | > 50 lines                   |
| Parameter count                      | 2 (warn)  | Merge  | > 5 params                   |
| Import fan-out per file              | 2 (warn)  | Merge  | > 15 imports                 |
| Import fan-in per file               | 3 (info)  | None   | > 20 importers               |
| File length                          | 3 (info)  | None   | > 300 lines                  |
| Coupling score (graph)               | 2 (warn)  | Merge  | > 0.7 ratio                  |
| Hotspot score (churn × complexity)   | 1 (error) | Commit | Top 5% flagged               |
| Transitive dep depth                 | 3 (info)  | None   | > 30 nodes                   |
| Bundle/package size                  | 2 (warn)  | Merge  | Per-package budget in config |
| Dependency weight                    | 3 (info)  | None   | > 500KB added                |
| Benchmark regression                 | 2 (warn)  | Merge  | > 10% slower than baseline   |
| Benchmark regression (critical path) | 1 (error) | Commit | > 5% slower than baseline    |

---

## Technical Design

### Layer 1 & 2: Entropy Extension (Structural + Size)

#### New Entropy Detectors

Location: `packages/core/src/entropy/detectors/`

```
detectors/
├── drift.ts              # existing
├── dead-code.ts          # existing
├── patterns.ts           # existing
├── complexity.ts         # NEW — cyclomatic complexity, nesting, function length, param count
├── coupling.ts           # NEW — fan-in, fan-out, coupling ratio
└── size-budget.ts        # NEW — package size, dependency weight
```

**`complexity.ts`** — Parses AST via existing `LanguageParser`. Computes per-function metrics. Returns violations against configured thresholds. Inputs: `CodebaseSnapshot` + optional `GraphComplexityData` (hotspot scores). Outputs: `ComplexityReport` with per-function metrics and tier-classified violations.

**`coupling.ts`** — Computes file-level coupling from import graph. Uses `GraphCouplingAdapter` for fan-in/fan-out/transitive depth. Falls back to filesystem-only analysis when graph is unavailable.

**`size-budget.ts`** — Measures build output directories against per-package budgets in config. Tracks dependency weight via package-lock parsing.

#### New Graph Adapters

Location: `packages/graph/src/adapters/`

```
adapters/
├── constraint.ts         # existing
├── entropy.ts            # existing
├── feedback.ts           # existing
├── complexity.ts         # NEW — hotspot scoring
└── coupling.ts           # NEW — fan-in, fan-out, transitive depth
```

**`GraphComplexityAdapter`** — Queries graph for function nodes with complexity metadata, commit frequency per file, computes `hotspotScore = changeFrequency × cyclomaticComplexity`.

**`GraphCouplingAdapter`** — Queries graph for `imports` edge counts (fan-out), reverse `imports` edges (fan-in), BFS traversal depth (transitive dependency depth), coupling ratio (external edges / total edges per module).

#### Code Ingestion Enhancement

Extend `CodeIngestor` to store complexity metrics as node metadata during ingestion:

```typescript
node.metadata.cyclomaticComplexity = computeCyclomaticComplexity(ast);
node.metadata.nestingDepth = computeMaxNesting(ast);
node.metadata.lineCount = endLine - startLine;
node.metadata.parameterCount = params.length;
```

Graph always has fresh complexity data after `harness graph scan`.

#### Config Extension

```jsonc
{
  "entropy": {
    "analyze": {
      "drift": true,
      "deadCode": true,
      "patterns": true,
      "complexity": {
        "enabled": true,
        "thresholds": {
          "cyclomaticComplexity": { "error": 15, "warn": 10 },
          "nestingDepth": { "warn": 4 },
          "functionLength": { "warn": 50 },
          "parameterCount": { "warn": 5 },
          "fileLength": { "info": 300 },
          "hotspotPercentile": { "error": 95 },
        },
      },
      "coupling": {
        "enabled": true,
        "thresholds": {
          "fanOut": { "warn": 15 },
          "fanIn": { "info": 20 },
          "couplingRatio": { "warn": 0.7 },
          "transitiveDependencyDepth": { "info": 30 },
        },
      },
      "sizeBudget": {
        "enabled": true,
        "budgets": {
          "packages/core": { "warn": "100KB" },
          "packages/cli": { "warn": "200KB" },
        },
        "dependencyWeight": { "info": "500KB" },
      },
    },
  },
}
```

### Layer 3: Runtime Performance Module

Location: `packages/core/src/performance/`

```
performance/
├── index.ts              # Public API
├── benchmark-runner.ts   # Wraps Vitest bench execution, captures results
├── baseline-manager.ts   # Read/write/compare .harness/perf/baselines.json
├── regression-detector.ts # Compare results against baselines, compute % change
├── critical-path.ts      # Resolve critical paths from graph + annotations
└── types.ts              # BenchmarkResult, Baseline, RegressionReport
```

**`benchmark-runner.ts`** — Executes `.bench.ts` files via Vitest bench mode. Captures structured output (ops/sec, mean, p99, margin of error). Supports filtering by file glob or critical-path membership.

**`baseline-manager.ts`** — Manages `.harness/perf/baselines.json`:

```jsonc
{
  "version": 1,
  "updatedAt": "2026-03-19T...",
  "updatedFrom": "abc1234",
  "benchmarks": {
    "packages/core/src/entropy/analyzer.bench.ts::analyze-large-project": {
      "opsPerSec": 1250,
      "meanMs": 0.8,
      "p99Ms": 1.2,
      "marginOfError": 0.03,
    },
  },
}
```

**`regression-detector.ts`** — Compares current run against baselines. Computes regression percentage. Classifies: critical path + >5% = Tier 1, non-critical + >10% = Tier 2. Regressions within `marginOfError × 2` are not flagged.

**`critical-path.ts`** — Resolves critical functions via:

1. `@perf-critical` annotations in source (JSDoc tag or magic comment)
2. Graph query for high-fan-in functions (configurable, default top 10%)
3. Merged and deduplicated with source attribution

#### Benchmark Convention

Co-located with source: `analyzer.ts` → `analyzer.bench.ts`. Discovered via `**/*.bench.ts`.

### Check Orchestrator Integration

```
validate → deps → docs → entropy(+complexity,coupling,size) → perf → phase-gate
```

Entropy check includes complexity, coupling, and size detectors automatically. The `perf` check runs benchmarks and regression detection only when `.bench.ts` files exist (graceful no-op otherwise).

### MCP Tools

| Tool                    | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `check_performance`     | Run all perf checks (structural via entropy + runtime benchmarks) |
| `get_perf_baselines`    | Read current baselines                                            |
| `update_perf_baselines` | Regenerate baselines from fresh benchmark run                     |
| `get_critical_paths`    | List current critical path set (graph + annotations)              |

### CLI Commands

| Command                           | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| `harness check-perf`              | Run all three layers                           |
| `harness check-perf --structural` | Layer 1 only                                   |
| `harness check-perf --size`       | Layer 2 only                                   |
| `harness check-perf --runtime`    | Layer 3 only                                   |
| `harness perf bench [glob]`       | Run benchmarks (no regression check)           |
| `harness perf baselines update`   | Regenerate baselines from current run          |
| `harness perf baselines show`     | Display current baselines                      |
| `harness perf report`             | Full perf report (metrics + trends + hotspots) |
| `harness perf critical-paths`     | Show resolved critical path set                |

### Persona Integration

**New: `performance-guardian`**

```yaml
version: 1
name: Performance Guardian
description: Enforces performance budgets and detects regressions
role: performance-enforcement
skills: [harness-perf, harness-tdd]
triggers:
  - event: on_pr
    conditions:
      paths: ['src/**', 'packages/**']
  - event: scheduled
    cron: '0 6 * * 1'
config:
  severity: error
  autoFix: false
  timeout: 300000
outputs:
  agents-md: true
  ci-workflow: true
  runtime-config: true
```

**Extended:**

- `code-reviewer` — lightweight complexity observations (non-blocking)
- `codebase-health-analyst` — hotspot trend tracking over time

### Skills

**`harness-perf`** — Performance enforcement and benchmark management. Rigid skill with phases: analyze → benchmark → report → enforce.

**`harness-perf-tdd`** — TDD variant including benchmark in red-green-refactor: RED (failing test + benchmark assertion) → GREEN (pass both) → REFACTOR (optimize) → VALIDATE (`harness check-perf`).

### ESLint Rules via Linter-Gen

Statically detectable perf anti-patterns:

- `no-sync-io-in-async` — Block synchronous fs calls in async functions
- `no-nested-loops-in-critical` — Flag nested loops in `@perf-critical` files
- `no-unbounded-array-operations` — Warn on 3+ chained array operations

---

## Success Criteria

### Layer 1 — Structural

1. `harness ci check` includes complexity and coupling violations in its report
2. A function with cyclomatic complexity > 15 produces a Tier 1 error that blocks commit
3. A function with complexity 11-15 produces a Tier 2 warning visible in PR checks
4. Hotspot scores computed from graph data — top percentile files flagged
5. All thresholds configurable in `harness.config.json`
6. `harness check-perf --structural` runs in < 5 seconds on a 10K-line codebase

### Layer 2 — Build/Size

7. Per-package size budgets enforced — exceeding produces Tier 2 warning
8. `harness check-perf --size` reports current size vs. budget
9. New dependencies exceeding weight threshold produce Tier 3 info
10. Size trends trackable via `harness perf report`

### Layer 3 — Runtime

11. `*.bench.ts` files discovered and executed via `harness perf bench`
12. Baselines stored in `.harness/perf/baselines.json` and committed
13. `harness perf baselines update` regenerates from fresh run
14. Regression > 10% on non-critical path produces Tier 2 warning
15. Regression > 5% on `@perf-critical` path produces Tier 1 error
16. Regressions within margin of error not flagged
17. `harness perf critical-paths` shows graph-inferred and annotated paths

### Integration

18. `performance-guardian` persona triggers on PRs touching source
19. `code-reviewer` includes complexity observations in review
20. `codebase-health-analyst` tracks hotspot trends
21. `harness-perf` skill walks through all three layers
22. `check_performance` MCP tool available with structured results
23. ESLint rules catch sync I/O and nested loops in critical paths
24. All three layers run as part of `harness ci check`

---

## Implementation Order

### Phase 1: Structural Complexity (Layer 1)

- Complexity entropy detector + thresholds config
- CodeIngestor enhancement (complexity metadata on function nodes)
- GraphComplexityAdapter (hotspot scoring)
- Wire into entropy analyzer and check orchestrator
- `harness check-perf --structural` CLI command
- Tests for all detectors and adapters

### Phase 2: Coupling Metrics (Layer 1 continued)

- Coupling entropy detector
- GraphCouplingAdapter (fan-in, fan-out, transitive depth, coupling ratio)
- Wire into entropy analyzer
- Tests

### Phase 3: Size Budgets (Layer 2)

- Size budget entropy detector
- Config schema for per-package budgets
- `harness check-perf --size` CLI command
- Tests

### Phase 4: Runtime Benchmark Infrastructure (Layer 3)

- `packages/core/src/performance/` module: types, benchmark-runner, baseline-manager, regression-detector, critical-path resolver
- `.harness/perf/baselines.json` management
- `harness perf bench`, `harness perf baselines update/show` CLI commands
- `@perf-critical` annotation scanning
- Tests

### Phase 5: Integration & Enforcement

- MCP tools: `check_performance`, `get_perf_baselines`, `update_perf_baselines`, `get_critical_paths`
- `performance-guardian` persona
- Extend `code-reviewer` and `codebase-health-analyst` personas
- `harness-perf` and `harness-perf-tdd` skills
- `harness perf report` and `harness perf critical-paths` CLI commands
- CI pipeline update

### Phase 6: Static Lint Rules

- Linter-gen rule types for perf anti-patterns
- ESLint plugin integration
- Tests

---

## File Layout

```
packages/core/src/
├── entropy/detectors/
│   ├── complexity.ts          # NEW
│   ├── coupling.ts            # NEW
│   └── size-budget.ts         # NEW
├── performance/               # NEW module
│   ├── index.ts
│   ├── benchmark-runner.ts
│   ├── baseline-manager.ts
│   ├── regression-detector.ts
│   ├── critical-path.ts
│   └── types.ts
packages/graph/src/adapters/
│   ├── complexity.ts          # NEW
│   └── coupling.ts            # NEW
packages/graph/src/ingest/
│   └── CodeIngestor.ts        # MODIFIED
packages/mcp-server/src/tools/
│   └── performance.ts         # NEW
packages/cli/src/commands/
│   ├── check-perf.ts          # NEW
│   └── perf.ts                # NEW
agents/personas/
│   └── performance-guardian.yaml  # NEW
agents/skills/claude-code/
│   ├── harness-perf/          # NEW
│   │   ├── SKILL.md
│   │   └── skill.yaml
│   └── harness-perf-tdd/      # NEW
│       ├── SKILL.md
│       └── skill.yaml
.harness/perf/
│   └── baselines.json         # NEW
```
