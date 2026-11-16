---
schemaVersion: 1
module: 'packages/core/tests/architecture'
sourceHash: '065bd11d3cd086a5b5e20eb604d142303c64ba12b5282928ffca37e03e3a57f4'
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
    'sort-results.test.ts',
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
import { ArchAllowanceSchema, ArchBaselineResolution, archAllowanceSlug, archAllowancesDir, filterDiffByAllowances, isWholeSnapshotContext, loadArchAllowances, resolveArchBaseline, writeArchAllowance } from '../../src/architecture/baseline-resolver'
import { clusterViolations } from '../../src/architecture/cluster-violations'
import '../../src/architecture/collectors/index'
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
import '../../src/architecture/sort-results'
import { SpecImpactEstimator } from '../../src/architecture/spec-impact-estimator'
import { ConstraintNodeStore, syncConstraintNodes } from '../../src/architecture/sync-constraints'
import { TimelineManager } from '../../src/architecture/timeline-manager'
import { DEFAULT_STABILITY_THRESHOLDS, TimelineFile, TimelineSnapshot } from '../../src/architecture/timeline-types'
import { ArchBaseline, ArchBaselineSchema, ArchConfig, ArchConfigSchema, ArchDiffResult, ArchDiffResultSchema, ArchMetricCategory, ArchMetricCategorySchema, CategoryBaselineSchema, CategoryRegressionSchema, Collector, ConstraintRule, MetricResult, MetricResultSchema, Violation, ViolationHistory, ViolationSchema, ViolationSnapshot } from '../../src/architecture/types'
import { ViolationHistoryManager } from '../../src/architecture/violation-history'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import * as os from 'node:os'
import { join } from 'node:path'
import * as path from 'node:path'
import { join } from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
