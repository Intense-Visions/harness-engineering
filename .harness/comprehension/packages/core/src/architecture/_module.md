---
schemaVersion: 1
module: 'packages/core/src/architecture'
sourceHash: 'a8106663c2a8d312b22ed60343e8049f64434c69c32a7f3dc0a7ccc454081ca1'
compiledAt: '2026-08-28T01:22:10.317Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'baseline-manager.ts',
    'baseline-resolver.ts',
    'cluster-violations.ts',
    'config.ts',
    'detect-emergence.ts',
    'detect-stale.ts',
    'diff.ts',
    'exclude.ts',
    'index.ts',
    'matchers.ts',
    'normalize-pattern.ts',
    'prediction-engine.ts',
    'prediction-types.ts',
    'regression.ts',
    'spec-impact-estimator.ts',
    'sync-constraints.ts',
    'timeline-manager.ts',
    'timeline-types.ts',
    'types.ts',
    'violation-history.ts',
  ]
---

## Summary

The `packages/core/src/architecture` module is the architectural governance layer for the monorepo. It detects, tracks, and gates regressions across multiple dimensions — circular dependencies, layer violations, coupling, complexity, module size, and dependency depth. The system captures snapshots of architectural metrics via collectors, stores them in a baseline file, and gates PRs against deltas from main. A key innovation is the **per-PR allowance pattern**: intentional regressions are explicitly acknowledged in unique per-PR files rather than rewriting the shared baseline on branches, eliminating the merge-conflict cascade. The module also includes a prediction engine that forecasts architectural drift and suggests emergent constraints based on historical trends and spec impact analysis.

## Invariants

- Single-writer snapshot: baselines.json is the authoritative snapshot and is only advanced by the post-merge refresh job on main, never rewritten on feature branches
- Base-ref resolution in PR context: When gating a PR, the baseline is read from origin/main (the merge target), not the working-tree, so the gate is a true delta and the branch's baselines.json never needs to change
- Per-PR allowances for intentional regressions: Feature branches acknowledge intentional regressions via unique per-PR allowance files (.harness/arch/allowances/\*.json), never by touching the shared snapshot
- Metrics are set-based, deterministically serialized: Violation IDs within each category are treated as an unordered set; they are deduplicated, sorted, and stored so an unchanged set always produces byte-identical output
- Volatile stamps preserved on no-op: When metric values don't change, updatedAt and updatedFrom are preserved rather than bumped, so PRs that don't move any metric produce no diff in baselines.json
- Fail-open on infrastructure gaps: Git read-only operations (fetching base ref, branch detection) always fall back to working-tree behavior if they fail, rather than raising a false gate failure
- Atomic writes with temp + rename: Baseline saves use a temporary file and atomic rename to prevent corruption if the process crashes mid-write
- Allowances and baselines are independent files: Allowances are never folded into the snapshot; they are acknowledged in CI and discarded, while the snapshot advances only through refresh jobs

## Interface Contract

```ts
export AdjustedForecast
export AdjustedForecastSchema
export AllowanceFilteredDiff
export ArchAllowance
export ArchAllowanceCoverage
export ArchAllowanceSchema
export ArchBaseline
export ArchBaselineFallback
export ArchBaselineManager
export ArchBaselineResolution
export ArchBaselineSchema
export ArchBaselineSource
export ArchConfig
export ArchConfigSchema
export ArchDiffResult
export ArchDiffResultSchema
export ArchHandle
export ArchMetricCategory
export ArchMetricCategorySchema
export ArchitectureOptions
export CategoryBaseline
export CategoryBaselineSchema
export CategoryForecast
export CategoryForecastSchema
export CategoryRegression
export CategoryRegressionSchema
export CategorySnapshotSchema
export CircularDepsCollector
export Collector
export ComplexityCollector
export ConfidenceTier
export ConfidenceTierSchema
export ConstraintNodeStore
export ConstraintRule
export ConstraintRuleSchema
export ContributingFeatureSchema
export CouplingCollector
export DEFAULT_STABILITY_THRESHOLDS
export DataPoint
export DepDepthCollector
export DetectStaleResult
export Direction
export DirectionSchema
export EmergenceConfidence
export EmergenceConfidenceSchema
export EmergenceResult
export EmergenceResultSchema
export EmergentConstraintSuggestion
export EmergentConstraintSuggestionSchema
export EstimatorCoefficients
export ForbiddenImportCollector
export LayerViolationCollector
export LoadAllowancesOptions
export MetricResult
export MetricResultSchema
export ModuleSizeCollector
export PredictionEngine
export PredictionOptions
export PredictionOptionsSchema
export PredictionRegressionResult
export PredictionRegressionResultSchema
export PredictionResult
export PredictionResultSchema
export PredictionWarning
export PredictionWarningSchema
export RegressionFit
export ResolveArchBaselineOptions
export SpecImpactEstimate
export SpecImpactEstimateSchema
export SpecImpactEstimator
export SpecImpactSignalsSchema
export StabilityForecast
export StabilityForecastSchema
export StaleConstraint
export ThresholdConfig
export ThresholdConfigSchema
export TimelineCategorySnapshot
export TimelineFile
export TimelineFileSchema
export TimelineManager
export TimelineSnapshot
export TimelineSnapshotSchema
export TrendLine
export TrendLineSchema
export TrendResult
export TrendResultSchema
export Violation
export ViolationCluster
export ViolationHistory
export ViolationHistoryManager
export ViolationHistorySchema
export ViolationSchema
export ViolationSnapshot
export ViolationSnapshotSchema
export applyRecencyWeights
export archAllowanceSlug
export archAllowancesDir
export archMatchers
export archModule
export architecture
export classifyConfidence
export clusterViolations
export constraintRuleId
export defaultCollectors
export detectEmergentConstraints
export detectStaleConstraints
export diff
export extractDirectoryScope
export filterDiffByAllowances
export isExcluded
export isWholeSnapshotContext
export loadArchAllowances
export normalizeViolationPattern
export projectValue
export resolveArchBaseline
export resolveExcludePatterns
export resolveThresholds
export runAll
export syncConstraintNodes
export violationId
export weeksUntilThreshold
export weightedLinearRegression
export writeArchAllowance
```

## Dependency Slice

```
import { resolveRoadmapStore } from '../roadmap/store/factory'
import { relativePosix } from '../shared/fs-utils'
import { ArchBaselineManager } from './baseline-manager'
import { clusterViolations } from './cluster-violations'
import { CircularDepsCollector } from './collectors/circular-deps'
import { ComplexityCollector } from './collectors/complexity'
import { CouplingCollector } from './collectors/coupling'
import { DepDepthCollector } from './collectors/dep-depth'
import { ForbiddenImportCollector } from './collectors/forbidden-imports'
import { constraintRuleId } from './collectors/hash'
import { runAll } from './collectors/index'
import { LayerViolationCollector } from './collectors/layer-violations'
import { ModuleSizeCollector } from './collectors/module-size'
import { diff } from './diff'
import { extractDirectoryScope, normalizeViolationPattern } from './normalize-pattern'
import { AdjustedForecast, CategoryForecast, ConfidenceTier, Direction, PredictionOptions, PredictionResult, PredictionWarning, SpecImpactEstimate, StabilityForecast } from './prediction-types'
import { RegressionFit, applyRecencyWeights, classifyConfidence, projectValue, weeksUntilThreshold, weightedLinearRegression } from './regression'
import { SpecImpactEstimator } from './spec-impact-estimator'
import { ConstraintNodeStore } from './sync-constraints'
import { TimelineManager } from './timeline-manager'
import { CategorySnapshot, DEFAULT_STABILITY_THRESHOLDS, TimelineFile, TimelineFileSchema, TimelineSnapshot, TrendLine, TrendResult } from './timeline-types'
import { ArchBaseline, ArchBaselineSchema, ArchConfig, ArchConfigSchema, ArchDiffResult, ArchMetricCategory, ArchMetricCategorySchema, CategoryBaseline, CategoryRegression, ConstraintRule, EmergenceConfidence, EmergenceResult, EmergentConstraintSuggestion, MetricResult, ThresholdConfig, Violation, ViolationHistory, ViolationSnapshot } from './types'
import { minimatch } from 'minimatch'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import * as fs, { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import * as path, { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
```
