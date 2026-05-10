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
  conformance: number; // 0-100%
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
