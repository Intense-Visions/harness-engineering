/**
 * @harness-engineering/core
 *
 * Core library for Harness Engineering toolkit.
 * This library provides the fundamental building blocks for codebase analysis,
 * validation, entropy management, and agent-driven workflows.
 */

/**
 * Re-export all fundamental types from the types package.
 */
export * from '@harness-engineering/types';

/**
 * Error types and helper functions for standardized error handling across the toolkit.
 */
export type {
  BaseError,
  ValidationError,
  ContextError,
  ConstraintError,
  EntropyError,
  FeedbackError,
} from './shared/errors';
export { createError } from './shared/errors';

/**
 * Validation module for verifying project structure, configuration, and conventions.
 */
export * from './validation';

/**
 * Context module for managing AI agent context and knowledge maps.
 */
export * from './context';

/**
 * Constraints module for enforcing architectural boundaries and dependency rules.
 */
export * from './constraints';

/**
 * Entropy module for detecting and remediating codebase drift, dead code, and complexity.
 */
export * from './entropy';

/**
 * Performance module for benchmarking and regression detection.
 */
export * from './performance';

/**
 * Feedback module for agent-driven code review and telemetry.
 */
export * from './feedback';

/**
 * Architecture module for analyzing and visualizing codebase structure.
 */
export * from './architecture';

/**
 * Language parsers and AST utilities.
 */
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

/**
 * State management module for tracking project health, learnings, and transitions.
 */
export * from './state';

/**
 * Workflow module for executing multi-step tasks and agent chains.
 */
export * from './workflow';

/**
 * Pipeline module for orchestrating skill execution and turn-based interactions.
 */
export * from './pipeline';

/**
 * Security module for secret detection and vulnerability scanning.
 */
export * from './security';

/**
 * CI module for integrating with continuous integration systems.
 */
export * from './ci';

/**
 * Review pipeline module for automated code review workflows.
 */
export * from './review';

/**
 * Roadmap module for parsing, serializing, and syncing project roadmaps.
 */
export * from './roadmap';

/**
 * Interaction module for managing agent-to-human interactions.
 */
export * from './interaction';

/**
 * Blueprint module for scanning projects and generating codebase blueprints.
 */
export * from './blueprint/types';
export { ProjectScanner } from './blueprint/scanner';
export { BlueprintGenerator } from './blueprint/generator';

/**
 * Update checker utilities for checking for new versions of the toolkit.
 */
export {
  isUpdateCheckEnabled,
  shouldRunCheck,
  readCheckState,
  spawnBackgroundCheck,
  getUpdateNotification,
} from './update-checker';
export type { UpdateCheckState } from './update-checker';

/**
 * Code navigation module for AST-based exploration (outline, search, unfold).
 */
export * from './code-nav';

/**
 * Pricing module for model cost lookup and calculation.
 */
export * from './pricing';

/**
 * Usage module for aggregating token usage and cost data.
 */
export * from './usage';

/**
 * Adoption telemetry module for tracking and aggregating skill invocations.
 */
export {
  readAdoptionRecords,
  aggregateBySkill,
  topSkills,
  aggregateByDay as aggregateAdoptionByDay,
  type DailyAdoption,
} from './adoption';

/**
 * Compaction module for reducing MCP tool response token consumption.
 */
export * from './compaction';

/**
 * The current version of the Harness Engineering core library.
 *
 * @deprecated Read the CLI version from `@harness-engineering/cli/package.json`
 * instead. This hardcoded constant drifts from the actual CLI version on each
 * release. Kept only as a fallback for consumers that cannot resolve the CLI
 * package at runtime.
 */
export const VERSION = '0.21.1';
