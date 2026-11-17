/**
 * Architectural layer validation.
 * Note: buildDependencyGraph is exported as an addition beyond spec for advanced use cases.
 */
export { defineLayer, validateDependencies, buildDependencyGraph } from './dependencies';
export type { ParserLookup, BareSpecifierResolver } from './dependencies';

/**
 * The one mapping from `harness.config.json` to a `LayerConfig`, shared by
 * `harness check-deps` and the `harness ci check` deps step (#2606).
 */
export { resolveDepsSettings, toLayerConfig } from './layer-config';
export type { DepsSettings, DepsFallbackBehavior } from './layer-config';

/**
 * The one verdict on what a dependency analysis could not cover — engine
 * unavailable, unparseable files, layers with no source modules — shared by
 * `harness check-deps`, `harness ci check` and the `check_dependencies` MCP
 * tool so they agree on the same tree (#2671).
 */
export { assessDepsCoverage, unparsedFileGaps, toUnavailableCheck } from './deps-coverage';
export type {
  DepsCoverage,
  DepsCoverageGap,
  DepsCoverageGapKind,
  DepsUnavailableCheck,
} from './deps-coverage';

/**
 * Layer resolution utilities.
 */
export { resolveFileToLayer } from './layers';

/**
 * Circular dependency detection for modules and files.
 */
export { detectCircularDeps, detectCircularDepsInFiles } from './circular-deps';

/**
 * Boundary validation to enforce encapsulation and prevent illegal access between domains.
 */
export { createBoundaryValidator, validateBoundaries } from './boundary';

/**
 * Type definitions for constraints, layers, and dependency graphs.
 */
export type {
  Layer,
  LayerConfig,
  DependencyEdge,
  DependencyGraph,
  DependencyViolation,
  DependencyValidation,
  CircularDependency,
  CircularDepsResult,
  BoundaryDefinition,
  BoundaryValidator,
  BoundaryViolation,
  BoundaryValidation,
  GraphDependencyData,
  UnparsedFile,
} from './types';

/**
 * Utilities for sharing constraints across projects via manifest, bundle, or lockfile.
 */
export * from './sharing';

/**
 * Opt-in constraint packs: named bundles of blocking rules with per-stage
 * enforcement, layered over the existing security rule sets.
 */
export { BUILT_IN_CONSTRAINT_PACKS, getConstraintPack, resolveConstraintPacks } from './packs';
export type { ConstraintPack, ConstraintPackStageSpec, ResolvedConstraintPacks } from './packs';
