/**
 * Validation module for codebase standards, structure, and configuration.
 */

/**
 * Validates the file and directory structure against project conventions.
 */
export { validateFileStructure } from './file-structure';

/**
 * Validates the project configuration files (e.g., harness.config.json).
 */
export { validateConfig } from './config';

/**
 * Validates commit messages for compliance with conventional commit standards.
 */
export { validateCommitMessage } from './commit-message';

/**
 * Type definitions for validation results, conventions, and commit standards.
 */
export type {
  Convention,
  StructureValidation,
  ConfigError,
  CommitFormat,
  CommitValidation,
} from './types';

/**
 * Pulse config validation — validates `pulse:` block in `harness.config.json` if present.
 */
export { validatePulseConfig } from './pulse';
export type { PulseConfigValidation } from './pulse';

/**
 * Agent configuration validation (hybrid agnix binary + TypeScript fallback rules).
 */
export {
  validateAgentConfigs,
  runFallbackRules as runAgentConfigFallbackRules,
} from './agent-configs';
export type {
  AgentConfigFinding,
  AgentConfigValidation,
  AgentConfigOptions,
  AgentConfigSeverity,
  AgentConfigFallbackReason,
} from './agent-configs';
