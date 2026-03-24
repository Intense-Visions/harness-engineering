# Architecture Assertion Framework

> Assertion library for structural testing — detect architectural regression by comparing codebase metrics against stored baselines. Fail CI on new violations while allowing pre-existing ones via ratchet.

**Keywords:** architecture-assertions, baselines, ratchet, structural-testing, regression-detection, coupling, complexity, layer-violations, circular-deps

**ADR:** `.harness/architecture/framework-gaps-assessment/ADR-001.md` (Tier 1.5, Gap L3)

## Overview

An assertion library that wraps existing harness detectors (constraints, entropy) in a normalized collector layer, adds baseline management with ratchet-style violation tracking, and exposes two surfaces: a `harness check-arch` CLI command for CI gates, and Vitest custom matchers for expressive structural tests.

### Goals

1. **Prevent architectural regression** — no PR introduces new layer violations, circular deps, or complexity spikes without explicit approval
2. **Enable incremental adoption** — projects with existing violations adopt immediately via the ratchet (baseline captures current state, only new violations fail)
3. **Provide two complementary interfaces** — config-driven CLI for CI, Vitest matchers for developers who want fine-grained structural tests
4. **Reuse existing infrastructure** — 5 metric categories wrap existing detectors; 2 new collectors (module size, dep depth) are thin implementations

### Non-Goals

- Real-time IDE feedback (that is the ESLint plugin's job)
- Architecture decay timeline or trend visualization (Tier 2.3)
- Auto-fixing violations (that is the `enforce-architecture` skill's job)
- Cross-project comparison

## Decisions

| Decision               | Choice                                                          | Rationale                                                                                                              |
| ---------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Assertion surfaces     | Config gates + Vitest matchers                                  | Config gates cover CI; matchers add expressiveness for power users                                                     |
| Baseline strategy      | Snapshot-on-command                                             | Mirrors existing `BaselineManager` pattern, zero CI changes for MVP                                                    |
| Violation tracking     | Allowlist with ratchet                                          | Painless adoption — existing violations are tracked, only new ones fail                                                |
| Metric categories      | 7 categories                                                    | Items 1-5 wrap existing detectors; 6-7 are new but trivial implementations that complete the structural health picture |
| Vitest API granularity | Project-wide + module-scoped                                    | Covers common case and precision case without over-engineering a query DSL                                             |
| Architecture           | Three-layer (collectors → baseline engine → assertion surfaces) | Clean separation enables reuse by Tier 2.3 decay timeline; each layer independently testable                           |

## Technical Design

### Collector Layer

Each collector implements a common interface:

```typescript
interface MetricResult {
  category: ArchMetricCategory;
  scope: string; // e.g., 'project', 'src/services', 'src/api/routes.ts'
  value: number; // numeric metric (violation count, complexity score, etc.)
  violations: Violation[]; // individual violations for ratchet tracking
  metadata?: Record<string, unknown>;
}

interface Violation {
  id: string; // stable hash: sha256(relativePath + ':' + category + ':' + normalizedDetail)
  file: string; // relative to project root
  detail: string; // human-readable description (line numbers excluded from ID hash)
  severity: 'error' | 'warning';
}

type ArchMetricCategory =
  | 'circular-deps'
  | 'layer-violations'
  | 'complexity'
  | 'coupling'
  | 'forbidden-imports'
  | 'module-size'
  | 'dependency-depth';

interface Collector {
  category: ArchMetricCategory;
  collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]>;
}
```

Seven collector implementations:

| Collector                  | Wraps                                                                          | Returns                             |
| -------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| `CircularDepsCollector`    | `detectCircularDeps()`                                                         | One result per cycle found          |
| `LayerViolationCollector`  | `validateDependencies()`                                                       | One result per violation            |
| `ComplexityCollector`      | entropy complexity detector                                                    | Per-file results, scoped to module  |
| `CouplingCollector`        | entropy fan-in/fan-out                                                         | Per-file coupling scores            |
| `ForbiddenImportCollector` | Filters `validateDependencies()` results where `reason === 'FORBIDDEN_IMPORT'` | One result per forbidden import hit |
| `ModuleSizeCollector`      | file system scan + LOC count                                                   | Per-module file count and LOC       |
| `DepDepthCollector`        | import chain traversal                                                         | Longest chain per module            |

### Baseline Engine

Adapts the `BaselineManager` pattern from `packages/core/src/performance/`:

```typescript
interface ArchBaseline {
  version: 1;
  updatedAt: string; // ISO 8601
  updatedFrom: string; // commit hash
  metrics: Record<ArchMetricCategory, CategoryBaseline>;
}

interface CategoryBaseline {
  value: number; // aggregate metric value at baseline time
  violationIds: string[]; // stable IDs of known violations (the allowlist)
}
```

Stored at `.harness/arch/baselines.json`.

**`ArchBaselineManager`** provides:

- `capture(results: MetricResult[]): ArchBaseline` — snapshot current state
- `load(): ArchBaseline | null` — read from disk
- `save(baseline: ArchBaseline): void` — write to disk
- `diff(current: MetricResult[], baseline: ArchBaseline): ArchDiffResult` — the core ratchet logic

**Ratchet diff logic:**

```typescript
interface ArchDiffResult {
  passed: boolean;
  newViolations: Violation[]; // in current but not in baseline -> FAIL
  resolvedViolations: string[]; // in baseline but not in current -> celebrate
  preExisting: string[]; // in both -> allowed, tracked
  regressions: CategoryRegression[]; // aggregate value exceeded baseline
}

interface CategoryRegression {
  category: ArchMetricCategory;
  baselineValue: number;
  currentValue: number;
  delta: number;
}
```

A check **fails** if `newViolations.length > 0` or any category's aggregate value exceeds its baseline.

### Config Schema

Extension to `harness.config.json`:

```json
{
  "architecture": {
    "enabled": true,
    "baselinePath": ".harness/arch/baselines.json",
    "thresholds": {
      "circular-deps": { "max": 0 },
      "layer-violations": { "max": 0 },
      "complexity": { "max": 15 },
      "coupling": { "maxFanIn": 10, "maxFanOut": 8 },
      "forbidden-imports": { "max": 0 },
      "module-size": { "maxFiles": 30, "maxLoc": 3000 },
      "dependency-depth": { "max": 7 }
    },
    "modules": {
      "src/services": { "complexity": { "max": 10 } },
      "src/api": { "coupling": { "maxFanOut": 5 } }
    }
  }
}
```

`thresholds` are hard limits (fail regardless of baseline). `modules` allows per-module overrides. The ratchet operates within the threshold — you can be under the threshold but still regress from baseline.

**Threshold vs. baseline precedence:** When both a threshold and a baseline exist for a category, the check fails if EITHER the threshold is exceeded OR the baseline is regressed. On initial adoption, run `--update-baseline` to capture current state; set thresholds at or above current values to avoid immediate failure.

**Missing baseline behavior:** When no baseline exists, `harness check-arch` runs in threshold-only mode — violations are checked against thresholds but no ratchet comparison occurs. A warning is emitted recommending `--update-baseline`. Exit code `0` if all thresholds pass.

### CLI Command

```
harness check-arch [--update-baseline] [--json] [--module <path>]
```

- Default: collect all metrics, compare against baseline, report pass/fail
- `--update-baseline`: capture current state as new baseline
- `--json`: machine-readable output for CI
- `--module <path>`: check a single module

Exit codes: `0` = pass, `1` = regression detected, `2` = config error.

### Vitest Matchers

```typescript
// Setup: import in vitest.setup.ts
import { archMatchers } from '@harness-engineering/core/architecture/matchers';
expect.extend(archMatchers);

// Project-wide
expect(architecture()).toHaveNoCircularDeps();
expect(architecture()).toHaveNoLayerViolations();
expect(architecture()).toMatchBaseline();
expect(architecture()).toMatchBaseline({ tolerance: 2 });

// Module-scoped
expect(module('src/services')).toHaveMaxComplexity(15);
expect(module('src/services')).toHaveMaxCoupling({ fanIn: 10, fanOut: 8 });
expect(module('src/services')).toHaveMaxFileCount(30);
expect(module('src/api')).toNotDependOn('src/types');
expect(module('src/api')).toHaveMaxDepDepth(5);
```

`architecture()` and `module()` are factory functions that return a handle carrying the root dir and scope. Matchers call collectors internally and format failures as readable Vitest error messages.

### File Layout

```
packages/core/src/architecture/
├── index.ts                    # public API
├── types.ts                    # MetricResult, Violation, ArchBaseline, etc.
├── collectors/
│   ├── index.ts                # registry, runAll()
│   ├── circular-deps.ts
│   ├── layer-violations.ts
│   ├── complexity.ts
│   ├── coupling.ts
│   ├── forbidden-imports.ts
│   ├── module-size.ts
│   └── dep-depth.ts
├── baseline-manager.ts         # ArchBaselineManager
├── diff.ts                     # ratchet diff logic
├── config.ts                   # schema parsing for architecture config section
└── matchers.ts                 # Vitest custom matchers + architecture()/module() factories

packages/cli/src/commands/
└── check-arch.ts               # CLI command
```

## Success Criteria

1. When `harness check-arch` exits non-zero, a new circular dependency, layer violation, or metric regression beyond baseline has been introduced
2. When `harness check-arch` exits zero on a codebase with pre-existing violations captured in the baseline, the ratchet correctly allows known violations
3. When `harness check-arch --update-baseline` runs, it captures current metrics and writes `.harness/arch/baselines.json` in the documented schema
4. When a pre-existing violation is fixed, `diff()` reports it as resolved and the next baseline update removes it from the allowlist
5. All 7 collectors return normalized `MetricResult[]` that conform to the type interface and produce stable violation IDs across runs
6. Vitest matchers produce readable failure messages — a failing `toHaveMaxComplexity(10)` reports which files exceeded the limit and by how much
7. Per-module config overrides work — `modules["src/api"].complexity.max = 10` is enforced independently of the project-wide threshold
8. Given an existing harness project with `harness.config.json`, adding `harness check-arch` to `.github/workflows/ci.yml` requires no other CI changes
9. All architecture module code has test coverage — collectors, baseline manager, diff logic, and matchers each have dedicated test files

## Risks and Mitigations

| Risk                                                                                                                                                                | Impact | Mitigation                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Collector performance on large monorepos** — running 7 collectors sequentially could be slow                                                                      | Medium | Run collectors in parallel; share the dependency graph across `CircularDepsCollector`, `LayerViolationCollector`, `CouplingCollector`, and `ForbiddenImportCollector` (single parse, multiple consumers) |
| **Flaky violation IDs** — if hashing includes volatile attributes (line numbers, absolute paths), pre-existing violations appear as "new" after unrelated refactors | High   | Violation IDs use `sha256(relativePath + ':' + category + ':' + normalizedDetail)` where `normalizedDetail` excludes line numbers and paths are relative to project root                                 |
| **Baseline merge conflicts** — multiple developers running `--update-baseline` on different branches creates conflicts in `baselines.json`                          | Low    | Document that baseline updates should happen on main only (post-merge). If conflict occurs, the stricter (lower-count) baseline wins                                                                     |
| **Adoption friction** — projects with many pre-existing violations fail immediately if thresholds are too strict by default                                         | Medium | `--update-baseline` is the recommended first step; threshold-only mode with a warning when no baseline exists; thresholds should be set at or above current values on initial setup                      |

## Implementation Order

1. **Types and collector interface** — `types.ts` with `MetricResult`, `Violation`, `ArchBaseline`, `Collector` interface
2. **Collectors** — Seven adapter implementations wrapping existing detectors (parallelizable)
3. **Baseline engine** — `ArchBaselineManager` (capture, load, save) + `diff()` with ratchet logic
4. **Config schema** — Parse `architecture` section from `harness.config.json`, wire threshold and module override resolution
5. **CLI command** — `harness check-arch` wiring collectors → baseline engine → output formatting → exit codes
6. **Vitest matchers** — `architecture()` / `module()` factories + custom matchers
7. **Integration** — Add `check-arch` to CI workflow, update config with default architecture section
