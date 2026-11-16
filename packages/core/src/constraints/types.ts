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
  /** Extra glob patterns excluded from per-layer file discovery, stacked on
   *  top of core's DEFAULT_FIND_FILES_IGNORE (issue #1188). */
  extraIgnore?: readonly string[];
}

// Dependency Graph Types
export interface DependencyEdge {
  from: string;
  to: string;
  importType: 'static' | 'dynamic' | 'type-only';
  line: number;
}

/**
 * A source file the dependency analysis was handed but could not read imports
 * from — a syntax error, an unreadable file, or failed import extraction
 * (#2073). Its edges are absent from the graph, so any violation or cycle it
 * takes part in is invisible; consumers must report it rather than treat the
 * graph as complete.
 */
export interface UnparsedFile {
  /** Absolute path of the file, as discovered. */
  file: string;
  /** The parser's own reason, `CODE: message`. */
  reason: string;
}

export interface DependencyGraph {
  nodes: string[];
  edges: DependencyEdge[];
  /**
   * Source files that were dropped because they could not be parsed (#2073).
   * Absent (not an empty array) when every source file parsed, and when the
   * graph came from precomputed graph data rather than a parse.
   */
  unparsedFiles?: UnparsedFile[];
  /**
   * Number of source files whose imports were actually extracted — the real
   * denominator of the analysis, excluding directories and non-source files a
   * glob happened to match, and excluding {@link unparsedFiles} (#2073). Absent
   * when the graph came from precomputed graph data.
   */
  analyzedFiles?: number;
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
  /** Mirrors {@link DependencyGraph.unparsedFiles} (#2073). `valid` still
   *  speaks only to violations; a consumer deciding on a clean verdict must
   *  also check this list. */
  unparsedFiles?: UnparsedFile[];
  /** Mirrors {@link DependencyGraph.analyzedFiles} (#2073). */
  analyzedFiles?: number;
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
  /** Source files dropped from the cycle graph because they could not be
   *  parsed (#2073). Set only by `detectCircularDepsInFiles`. */
  unparsedFiles?: UnparsedFile[];
  /** Source files whose imports were actually extracted (#2073). Set only by
   *  `detectCircularDepsInFiles`. */
  analyzedFiles?: number;
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
