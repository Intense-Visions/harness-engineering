/**
 * @harness-engineering/core
 *
 * Core library for Harness Engineering toolkit
 */

export * from '@harness-engineering/types';

// Result type and helpers
export type { Result } from './shared/result';
export { Ok, Err, isOk, isErr } from './shared/result';

// Error types and helpers
export type { BaseError, ValidationError, ContextError, ConstraintError, EntropyError, FeedbackError } from './shared/errors';
export { createError } from './shared/errors';

// Validation module
export * from './validation';

// Context module
export * from './context';

// Package version
export const VERSION = '0.2.0';
