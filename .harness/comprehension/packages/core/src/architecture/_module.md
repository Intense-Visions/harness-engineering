---
schemaVersion: 1
module: 'packages/core/src/architecture'
sourceHash: '5e3334fe38b719e320c5e6316e82b0c022173023dd8627a1096a9c98d3e52b70'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'baseline-manager.ts',
    'baseline-resolver.ts',
    'cluster-violations.ts',
    'config.ts',
    'dependency-rules.ts',
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
export ArchDependencyRules
export ArchDiffResult
export ArchDiffResultSchema
export ArchForbiddenImportRule
export ArchHandle
export ArchLayerRule
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
export DependencyRuleSource
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
export readDependencyRules
export resolveArchBaseline
export resolveExcludePatterns
export resolveThresholds
export runAll
export syncConstraintNodes
export violationId
export weeksUntilThreshold
export weightedLinearRegression
export withDependencyRules
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
import { ArchBaseline, ArchBaselineSchema, ArchConfig, ArchConfigSchema, ArchDependencyRules, ArchDiffResult, ArchForbiddenImportRule, ArchLayerRule, ArchMetricCategory, ArchMetricCategorySchema, CategoryBaseline, CategoryRegression, ConstraintRule, EmergenceConfidence, EmergenceResult, EmergentConstraintSuggestion, MetricResult, ThresholdConfig, Violation, ViolationHistory, ViolationSnapshot } from './types'
import { minimatch } from 'minimatch'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import * as fs, { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import * as path, { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
```
