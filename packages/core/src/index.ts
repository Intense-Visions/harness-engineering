/**
 * @harness-engineering/core
 *
 * Core library for Harness Engineering toolkit
 */

export * from '@harness-engineering/types';

// Error types and helpers
export type {
  BaseError,
  ValidationError,
  ContextError,
  ConstraintError,
  EntropyError,
  FeedbackError,
} from './shared/errors';
export { createError } from './shared/errors';

// Validation module
export * from './validation';

// Context module
export * from './context';

// Constraints module
export * from './constraints';

// Entropy module
export * from './entropy';

// Performance module
export * from './performance';

// Feedback module
export * from './feedback';

// Architecture module
export * from './architecture';

// Parsers
export { TypeScriptParser } from './shared/parsers';
export type {
  LanguageParser,
  AST,
  Import,
  Export,
  ParseError,
  HealthCheckResult,
} from './shared/parsers';
export { createParseError } from './shared/parsers';

// State module
export * from './state';

// Workflow module
export * from './workflow';

// Pipeline module
export * from './pipeline';

// Security module
export * from './security';

// CI module
export * from './ci';

// Review pipeline module
export * from './review';

// Roadmap module
export * from './roadmap';

// Interaction module
export * from './interaction';

// Blueprint module
export * from './blueprint/types';
export { ProjectScanner } from './blueprint/scanner';
export { BlueprintGenerator } from './blueprint/generator';

// Update checker
export {
  isUpdateCheckEnabled,
  shouldRunCheck,
  readCheckState,
  spawnBackgroundCheck,
  getUpdateNotification,
} from './update-checker';
export type { UpdateCheckState } from './update-checker';

/**
 * @deprecated Read the CLI version from `@harness-engineering/cli/package.json`
 * instead. This hardcoded constant drifts from the actual CLI version on each
 * release. Kept only as a fallback for consumers that cannot resolve the CLI
 * package at runtime.
 */
export const VERSION = '1.8.2';
