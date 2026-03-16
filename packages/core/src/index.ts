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

// Constraints module
export * from './constraints';

// Entropy module
export * from './entropy';

// Feedback module
export * from './feedback';

// Parsers
export { TypeScriptParser } from './shared/parsers';
export type { LanguageParser, AST, Import, Export, ParseError, HealthCheckResult } from './shared/parsers';
export { createParseError } from './shared/parsers';

// State module
export * from './state';

// Workflow module
export * from './workflow';

// Package version
export const VERSION = '0.5.0';
