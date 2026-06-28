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
 * STRATEGY.md validation — validates the repo-root strategic anchor when present.
 */
export { validateStrategy } from './strategy';
export type { StrategyValidation } from './strategy';

/**
 * Solutions directory validation — walks `docs/solutions/<track>/<category>/*.md` and
 * validates each frontmatter against `SolutionDocFrontmatterSchema`.
 */
export { validateSolutionsDir } from './solutions';
export type { SolutionsDirValidation } from './solutions';

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

/**
 * Roadmap-mode cross-cutting validation — Rules A (tracker presence) and B (file absence).
 */
export { validateRoadmapMode } from './roadmap-mode';
export type { RoadmapModeValidationConfig } from './roadmap-mode';

/**
 * Merge-driver doctor helper — warns when `merge=ours` is declared in
 * `.gitattributes` but the per-clone `merge.ours.driver` config is unset.
 */
export { needsMergeOursDriverWarning } from './merge-driver';

/**
 * Read-source invariant R — detector + allowlist for files that read the
 * generated roadmap aggregate (enforced by the repo guard test).
 */
export { findRoadmapReadSourceViolations, ROADMAP_READ_ALLOWLIST } from './roadmap-read-source';
