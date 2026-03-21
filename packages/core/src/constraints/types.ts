import type { z } from 'zod';
import type { LanguageParser } from '../shared/parsers';

// Layer Types
export interface Layer {
  name: string;
  patterns: string[];
  allowedDependencies: string[];
}

export interface LayerConfig {
  layers: Layer[];
  rootDir: string;
  parser: LanguageParser;
  fallbackBehavior?: 'skip' | 'error' | 'warn';
  graphDependencyData?: GraphDependencyData;
}

// Dependency Graph Types
export interface DependencyEdge {
  from: string;
  to: string;
  importType: 'static' | 'dynamic' | 'type-only';
  line: number;
}

export interface DependencyGraph {
  nodes: string[];
  edges: DependencyEdge[];
}

export interface DependencyViolation {
  file: string;
  imports: string;
  fromLayer: string;
  toLayer: string;
  reason: 'WRONG_LAYER' | 'CIRCULAR_DEP' | 'FORBIDDEN_IMPORT';
  line: number;
  suggestion: string;
}

export interface DependencyValidation {
  valid: boolean;
  violations: DependencyViolation[];
  graph: DependencyGraph;
  skipped?: boolean;
  reason?: string;
}

// Forbidden Import Config Types
export interface ForbiddenImportRule {
  from: string;
  disallow: string[];
  message: string;
  alternative?: string;
}

// Circular Dependency Types
export interface CircularDependency {
  cycle: string[];
  severity: 'error' | 'warning';
  size: number;
}

export interface CircularDepsResult {
  hasCycles: boolean;
  cycles: CircularDependency[];
  largestCycle: number;
}

// Boundary Types
export interface BoundaryDefinition {
  name: string;
  layer: string;
  schema: z.ZodSchema<unknown>;
  direction: 'input' | 'output';
}

export interface BoundaryViolation {
  boundary: string;
  direction: 'input' | 'output';
  error: z.ZodError;
  data: unknown;
}

export interface BoundaryValidation {
  valid: boolean;
  violations: BoundaryViolation[];
}

export interface BoundaryValidator<T> {
  name: string;
  parse(
    input: unknown
  ): import('../shared/result').Result<T, import('../shared/errors').ConstraintError>;
  validate(
    input: unknown
  ): import('../shared/result').Result<boolean, import('../shared/errors').ConstraintError>;
  schema: z.ZodSchema<T>;
}

/**
 * Pre-computed dependency data from graph — avoids file parsing.
 * Compatible with DependencyGraph shape.
 */
export interface GraphDependencyData {
  nodes: string[];
  edges: Array<{
    from: string;
    to: string;
    importType: 'static' | 'dynamic' | 'type-only';
    line: number;
  }>;
}
