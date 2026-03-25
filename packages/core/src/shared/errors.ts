/**
 * Represents an error code for identifying specific error types.
 */
export type ErrorCode = string;

/**
 * Base interface for all Harness Engineering errors.
 * Provides a standardized structure for error reporting and suggestions.
 */
export interface BaseError {
  /** A unique code identifying the type of error. */
  code: ErrorCode;
  /** A human-readable message describing the error. */
  message: string;
  /** Additional structured data providing context about the error. */
  details: Record<string, unknown>;
  /** A list of suggested actions to resolve the error. */
  suggestions: string[];
}

// Module-specific error types
/**
 * Error type for validation failures.
 */
export interface ValidationError extends BaseError {
  /** Validation-specific error codes. */
  code: 'INVALID_TYPE' | 'MISSING_FIELD' | 'VALIDATION_FAILED' | 'PARSE_ERROR';
}

/**
 * Error type for context-related issues.
 */
export interface ContextError extends BaseError {
  /** Context-specific error codes. */
  code: 'PARSE_ERROR' | 'SCHEMA_VIOLATION' | 'MISSING_SECTION' | 'BROKEN_LINK';
}

/**
 * Error type for architectural constraint violations.
 */
export interface ConstraintError extends BaseError {
  /** Constraint-specific error codes. */
  code:
    | 'WRONG_LAYER'
    | 'CIRCULAR_DEP'
    | 'FORBIDDEN_IMPORT'
    | 'BOUNDARY_ERROR'
    | 'PARSER_UNAVAILABLE';
}

/**
 * Error type for entropy and drift-related issues.
 */
export interface EntropyError extends BaseError {
  /** Entropy-specific error codes. */
  code:
    | 'SNAPSHOT_BUILD_FAILED'
    | 'PARSE_ERROR'
    | 'ENTRY_POINT_NOT_FOUND'
    | 'INVALID_CONFIG'
    | 'CONFIG_VALIDATION_ERROR'
    | 'FIX_FAILED'
    | 'BACKUP_FAILED';
  /** Entropy-specific error details. */
  details: {
    /** Path to the file where the error occurred. */
    file?: string;
    /** Reason for the error. */
    reason?: string;
    /** List of issues detected. */
    issues?: unknown[];
    /** The original Error object, if any. */
    originalError?: Error;
  };
}

/**
 * Error type for agent feedback and review issues.
 */
export interface FeedbackError extends BaseError {
  /** Feedback-specific error codes. */
  code:
    | 'AGENT_SPAWN_ERROR'
    | 'AGENT_TIMEOUT'
    | 'TELEMETRY_ERROR'
    | 'TELEMETRY_UNAVAILABLE'
    | 'REVIEW_ERROR'
    | 'DIFF_PARSE_ERROR'
    | 'SINK_ERROR';
  /** Feedback-specific error details. */
  details: {
    /** ID of the agent involved. */
    agentId?: string;
    /** Name of the service where the error occurred. */
    service?: string;
    /** Reason for the error. */
    reason?: string;
    /** The original Error object, if any. */
    originalError?: Error;
  };
}

/**
 * Creates a standardized error object.
 *
 * @template T - The specific error type to create.
 * @param code - The error code identifying the type of error.
 * @param message - A human-readable message describing the error.
 * @param details - Additional structured data providing context (default: empty record).
 * @param suggestions - A list of suggested actions to resolve the error (default: empty array).
 * @returns A new error object of the specified type.
 */
export function createError<T extends BaseError>(
  code: T['code'],
  message: string,
  details: Record<string, unknown> = {},
  suggestions: string[] = []
): T {
  return { code, message, details, suggestions } as T;
}

/**
 * Creates a standardized EntropyError object.
 *
 * @param code - The entropy-specific error code.
 * @param message - A human-readable message describing the error.
 * @param details - Entropy-specific error details (default: empty object).
 * @param suggestions - A list of suggested actions to resolve the error (default: empty array).
 * @returns A new EntropyError object.
 */
export function createEntropyError(
  code: EntropyError['code'],
  message: string,
  details: EntropyError['details'] = {},
  suggestions: string[] = []
): EntropyError {
  return { code, message, details, suggestions };
}
