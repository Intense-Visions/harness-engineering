---
schemaVersion: 1
module: 'packages/core/tests/architecture'
sourceHash: '53d843d2eab93e9f083d212a58d49f1a0794c599729d1138e203a23ffd35d5f9'
compiledAt: '2026-08-28T01:22:10.750Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'baseline-manager.test.ts',
    'baseline-resolver.test.ts',
    'cluster-violations.test.ts',
    'config.test.ts',
    'detect-emergence.test.ts',
    'detect-stale.test.ts',
    'diff.test.ts',
    'exclude.test.ts',
    'matchers.test.ts',
    'normalize-pattern.test.ts',
    'prediction-engine.test.ts',
    'prediction-types.test.ts',
    'regression.test.ts',
    'spec-impact-estimator.test.ts',
    'sync-constraints.test.ts',
    'timeline-manager.test.ts',
    'types.test.ts',
    'violation-history.test.ts',
  ]
---

## Summary

The `packages/core/tests/architecture` module is a comprehensive test suite (~4,800 lines, 20 test files) for the harness architecture checker—a system tracking code quality metrics (circular dependencies, complexity, coupling, layer violations, etc.) over time and gating changes on regressions.

The suite tests six core subsystems: (1) baseline management with git-aware resolution to prevent merge cascades, (2) diff/gate logic comparing metrics against baselines with regression tolerance, (3) time-series tracking and 4/8/12-week forecasting, (4) constraint lifecycle management in the graph database, (5) pattern detection for emergent violations, and (6) type safety and utility functions.

Critical design: baseline files committed to `main` are read-only on feature branches to avoid cascading merge conflicts. Updates only occur on the base branch itself or in forced whole-snapshot contexts. Byte-stable files when metrics are unchanged prevent spurious conflict markers. Partial metric results must preserve existing categories to prevent silent collector failures.

## Invariants

- Byte-stable baseline on unchanged metrics: Re-running the check against identical metrics must produce byte-identical baseline files (updatedAt/updatedFrom unchanged) to prevent spurious merge conflicts when committed.
- Category preservation under partial results: Updating a baseline with a subset of metric categories must preserve pre-existing categories; silently dropping a category hides collector failures.
- Base-ref aware resolution on feature branches: resolveArchBaseline() reads committed baseline from the base branch (e.g., origin/main), never the working-tree copy, to prevent feature rewrites from triggering false regressions.
- Fail-open on corrupt committed baseline: Invalid JSON or schema violations in the base-ref baseline must gracefully fall back to the working-tree copy; a corrupt merge artifact on main must not hard-fail the gate.
- Regression tolerance is floored: Tolerance computed as floor(baseline × tolerance) ensures shallow integer metrics (depth ≤5) remain strict even with 1% tolerance.
- Whole-snapshot write safety: The --update-baseline flow must never write a partial baseline on feature branches (where base-ref is readable); only single-writer contexts (base branch, HARNESS_ARCH_FORCE_WORKING_TREE, non-git dirs) may rewrite committed snapshots.
- Violation clustering is deterministic: Violations clustered by (category, layer-pattern, file-scope-prefix) for emergence detection; cluster key must be stable across runs so the same pattern is always merged.
- Constraint node timestamps are immutable except lastViolatedAt: createdAt is set once and never updated on re-sync; only lastViolatedAt is bumped when a matching violation reappears, keeping stale-detection windows clean.
- Timeline snapshots are append-only: Once written, snapshot capturedAt/metrics are never mutated; trend analysis and forecasting depend on immutability across re-runs.
- Emergence confidence bands are tiered: Suggestions map violation count and file diversity to confidence tiers (high ≥ 2× minOccurrences + 3 files; medium ≥ 1× minOccurrences + 2 files; low otherwise); confidence drives auto-create vs. advisory action.

## Interface Contract

```ts

```

## Dependency Slice

```
import { ArchBaselineManager } from '../../src/architecture/baseline-manager'
import { ArchBaselineResolution, archAllowanceSlug, archAllowancesDir, filterDiffByAllowances, isWholeSnapshotContext, loadArchAllowances, resolveArchBaseline, writeArchAllowance } from '../../src/architecture/baseline-resolver'
import { clusterViolations } from '../../src/architecture/cluster-violations'
import { resolveThresholds } from '../../src/architecture/config'
import { detectEmergentConstraints } from '../../src/architecture/detect-emergence'
import { detectStaleConstraints } from '../../src/architecture/detect-stale'
import { diff } from '../../src/architecture/diff'
import { isExcluded, resolveExcludePatterns } from '../../src/architecture/exclude'
import { archMatchers, archModule, architecture } from '../../src/architecture/matchers'
import { extractDirectoryScope, normalizeViolationPattern } from '../../src/architecture/normalize-pattern'
import { PredictionEngine } from '../../src/architecture/prediction-engine'
import { AdjustedForecastSchema, CategoryForecastSchema, ConfidenceTierSchema, PredictionOptionsSchema, PredictionResultSchema, PredictionWarningSchema, RegressionResultSchema, SpecImpactEstimateSchema, StabilityForecastSchema } from '../../src/architecture/prediction-types'
import { DataPoint, RegressionFit, applyRecencyWeights, classifyConfidence, projectValue, weeksUntilThreshold, weightedLinearRegression } from '../../src/architecture/regression'
import { SpecImpactEstimator } from '../../src/architecture/spec-impact-estimator'
import { ConstraintNodeStore, syncConstraintNodes } from '../../src/architecture/sync-constraints'
import { TimelineManager } from '../../src/architecture/timeline-manager'
import { DEFAULT_STABILITY_THRESHOLDS, TimelineFile, TimelineSnapshot } from '../../src/architecture/timeline-types'
import { ArchBaseline, ArchBaselineSchema, ArchConfig, ArchConfigSchema, ArchDiffResult, ArchDiffResultSchema, ArchMetricCategory, ArchMetricCategorySchema, CategoryBaselineSchema, CategoryRegressionSchema, Collector, ConstraintRule, MetricResult, MetricResultSchema, Violation, ViolationHistory, ViolationSchema, ViolationSnapshot } from '../../src/architecture/types'
import { ViolationHistoryManager } from '../../src/architecture/violation-history'
import { execFileSync } from 'node:child_process'
import * as fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import * as os, { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
