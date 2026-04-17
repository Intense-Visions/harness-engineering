// packages/core/src/annotations/types.ts

/** Scope categories for protection annotations. */
export type ProtectionScope = 'entropy' | 'architecture' | 'security' | 'all';

/** Valid scope values for parsing. */
export const VALID_SCOPES: ReadonlySet<string> = new Set<string>([
  'entropy',
  'architecture',
  'security',
  'all',
]);

/** A single protected region in a file. */
export interface ProtectedRegion {
  /** Relative file path. */
  file: string;
  /** 1-indexed start line (inclusive). */
  startLine: number;
  /** 1-indexed end line (inclusive). Same as startLine for line-level. */
  endLine: number;
  /** Which subsystems this region is protected from. */
  scopes: ProtectionScope[];
  /** Human-readable reason for the protection, or null if not provided. */
  reason: string | null;
  /** Whether this is a line-level or block-level annotation. */
  type: 'line' | 'block';
}

/** Map of protected regions with lookup methods. */
export interface ProtectedRegionMap {
  /** All regions across all files. */
  regions: ProtectedRegion[];
  /** Check if a specific file:line is protected for a given scope. */
  isProtected(file: string, line: number, scope: ProtectionScope): boolean;
  /** Get all regions for a specific file. */
  getRegions(file: string): ProtectedRegion[];
}

/** Validation issue types for annotation parsing. */
export type AnnotationIssueType =
  | 'unclosed-block'
  | 'orphaned-end'
  | 'missing-reason'
  | 'unknown-scope';

/** A validation issue found during annotation parsing. */
export interface AnnotationIssue {
  file: string;
  line: number;
  type: AnnotationIssueType;
  message: string;
}
