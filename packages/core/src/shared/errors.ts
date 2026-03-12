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

export interface EntropyError extends BaseError {
  code: 'DOC_DRIFT' | 'PATTERN_VIOLATION' | 'DEAD_CODE_FOUND';
}

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
