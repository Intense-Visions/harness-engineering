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
