import type { ValidationError } from '../shared/errors';

// File Structure Validation
export interface Convention {
  pattern: string; // Glob pattern, e.g., "docs/**/*.md"
  required: boolean; // Must files exist matching this pattern?
  description: string; // Human-readable description
  examples: string[]; // Example valid paths
}

export interface StructureValidation {
  valid: boolean;
  missing: string[]; // Required files/patterns that don't exist
  unexpected: string[]; // Files that violate conventions
  /**
   * Percentage of the REQUIRED conventions that were satisfied, or `null` when
   * no convention was marked required — there is no population to be a
   * percentage of, so there is no percentage (#1530). Previously `100` in that
   * case, which read as a perfect score for a project that had configured
   * nothing to conform to.
   */
  conformance: number | null; // 0-100%, or null when the audit abstained
  /**
   * True when no convention was marked required, so the check examined an empty
   * population and verified nothing (#1530). Carried separately from `valid` so
   * a consumer can say "abstained" rather than having to choose between a
   * misleading pass and an unexplained failure.
   */
  abstained: boolean;
}

// Config Validation
export interface ConfigError extends ValidationError {
  code:
    | 'INVALID_TYPE'
    | 'MISSING_FIELD'
    | 'VALIDATION_FAILED'
    | 'ROADMAP_MODE_MISSING_TRACKER'
    | 'ROADMAP_MODE_FILE_PRESENT';
  details: {
    zodError?: unknown; // Zod's detailed error (avoid importing zod types here)
    path?: string[]; // Path to invalid field
    issues?: Array<{ file: string; message: string }>; // Per-file validation issues (e.g., solutions dir)
  };
}

// Commit Message Validation
export type CommitFormat = 'conventional' | 'angular' | 'custom';

export interface CommitValidation {
  valid: boolean;
  type?: string; // e.g., 'feat', 'fix', 'docs'
  scope?: string; // e.g., 'core', 'validation'
  breaking: boolean; // Does commit contain breaking changes?
  issues: string[]; // What's wrong (if invalid)
}
