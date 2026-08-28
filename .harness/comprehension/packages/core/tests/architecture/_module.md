---
schemaVersion: 1
module: 'packages/core/tests/architecture'
sourceHash: '53d843d2eab93e9f083d212a58d49f1a0794c599729d1138e203a23ffd35d5f9'
compiledAt: '2026-08-28T01:22:10.750Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
