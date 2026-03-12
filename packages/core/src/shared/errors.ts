import type { EntropyError } from '../entropy/types';

export type ErrorCode = string;

export interface BaseError {
  code: ErrorCode;
  message: string;
  details: Record<string, unknown>;
  suggestions: string[];
}

// Module-specific error types
export interface ValidationError extends BaseError {
  code: 'INVALID_TYPE' | 'MISSING_FIELD' | 'VALIDATION_FAILED' | 'PARSE_ERROR';
}

export interface ContextError extends BaseError {
  code: 'PARSE_ERROR' | 'SCHEMA_VIOLATION' | 'MISSING_SECTION' | 'BROKEN_LINK';
}

export interface ConstraintError extends BaseError {
  code: 'WRONG_LAYER' | 'CIRCULAR_DEP' | 'FORBIDDEN_IMPORT' | 'BOUNDARY_ERROR' | 'PARSER_UNAVAILABLE';
}

// EntropyError is imported from '../entropy/types' for detailed typing
export type { EntropyError };

export interface FeedbackError extends BaseError {
  code: 'AGENT_SPAWN_ERROR' | 'TELEMETRY_ERROR' | 'REVIEW_ERROR';
}

export function createError<T extends BaseError>(
  code: T['code'],
  message: string,
  details: Record<string, unknown> = {},
  suggestions: string[] = []
): T {
  return { code, message, details, suggestions } as T;
}

export function createEntropyError(
  code: EntropyError['code'],
  message: string,
  details: EntropyError['details'] = {},
  suggestions: string[] = []
): EntropyError {
  return { code, message, details, suggestions };
}
