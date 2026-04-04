export {
  ArchMetricCategorySchema,
  ViolationSchema,
  MetricResultSchema,
  CategoryBaselineSchema,
  ArchBaselineSchema,
  CategoryRegressionSchema,
  ArchDiffResultSchema,
  ThresholdConfigSchema,
  ArchConfigSchema,
  ConstraintRuleSchema,
} from './types';

export type {
  ArchMetricCategory,
  Violation,
  MetricResult,
  CategoryBaseline,
  ArchBaseline,
  CategoryRegression,
  ArchDiffResult,
  ThresholdConfig,
  ArchConfig,
  ConstraintRule,
  Collector,
} from './types';

export {
  defaultCollectors,
  runAll,
  CircularDepsCollector,
  LayerViolationCollector,
  ComplexityCollector,
  CouplingCollector,
  ForbiddenImportCollector,
  ModuleSizeCollector,
  DepDepthCollector,
  violationId,
  constraintRuleId,
} from './collectors/index';

export { syncConstraintNodes } from './sync-constraints';
export type { ConstraintNodeStore } from './sync-constraints';
export { detectStaleConstraints } from './detect-stale';
export type { StaleConstraint, DetectStaleResult } from './detect-stale';

export { ArchBaselineManager } from './baseline-manager';
export { diff } from './diff';
export { resolveThresholds } from './config';

export { archMatchers, architecture, archModule } from './matchers';
export type { ArchHandle, ArchitectureOptions } from './matchers';

export {
  CategorySnapshotSchema,
  TimelineSnapshotSchema,
  TimelineFileSchema,
  TrendLineSchema,
  TrendResultSchema,
  DEFAULT_STABILITY_THRESHOLDS,
} from './timeline-types';

export type {
  CategorySnapshot as TimelineCategorySnapshot,
  TimelineSnapshot,
  TimelineFile,
  TrendLine,
  TrendResult,
} from './timeline-types';

export { TimelineManager } from './timeline-manager';

export {
  ConfidenceTierSchema,
  RegressionResultSchema as PredictionRegressionResultSchema,
  DirectionSchema,
  CategoryForecastSchema,
  SpecImpactSignalsSchema,
  SpecImpactEstimateSchema,
  ContributingFeatureSchema,
  AdjustedForecastSchema,
  PredictionWarningSchema,
  StabilityForecastSchema,
  PredictionResultSchema,
  PredictionOptionsSchema,
} from './prediction-types';

export type {
  ConfidenceTier,
  RegressionResult as PredictionRegressionResult,
  Direction,
  CategoryForecast,
  SpecImpactEstimate,
  AdjustedForecast,
  PredictionWarning,
  StabilityForecast,
  PredictionResult,
  PredictionOptions,
} from './prediction-types';

export {
  weightedLinearRegression,
  applyRecencyWeights,
  projectValue,
  weeksUntilThreshold,
  classifyConfidence,
} from './regression';

export type { DataPoint, RegressionFit } from './regression';

export { PredictionEngine } from './prediction-engine';
