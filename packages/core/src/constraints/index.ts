/**
 * Architectural layer validation.
 * Note: buildDependencyGraph is exported as an addition beyond spec for advanced use cases.
 */
export { defineLayer, validateDependencies, buildDependencyGraph } from './dependencies';
export type { ParserLookup } from './dependencies';

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
} from './types';

/**
 * Utilities for sharing constraints across projects via manifest, bundle, or lockfile.
 */
export * from './sharing';
