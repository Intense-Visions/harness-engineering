// Layer validation
// Note: buildDependencyGraph is exported as an addition beyond spec for advanced use cases
export { defineLayer, validateDependencies, buildDependencyGraph } from './dependencies';
export { resolveFileToLayer } from './layers';

// Circular dependency detection
export { detectCircularDeps, detectCircularDepsInFiles } from './circular-deps';

// Boundary validation
export { createBoundaryValidator, validateBoundaries } from './boundary';

// Types
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

// Constraint sharing (manifest, bundle, lockfile)
export * from './sharing';
