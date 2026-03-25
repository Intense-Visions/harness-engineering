/**
 * Validation utilities for AGENTS.md and knowledge maps.
 */
export { validateAgentsMap, extractMarkdownLinks, extractSections } from './agents-map';

/**
 * Documentation coverage analysis to ensure all critical code is documented.
 */
export { checkDocCoverage } from './doc-coverage';

/**
 * Integrity validation for knowledge maps, ensuring they accurately reflect the codebase.
 */
export { validateKnowledgeMap } from './knowledge-map';

/**
 * Automated generation of AGENTS.md and knowledge maps from codebase structure.
 */
export { generateAgentsMap } from './generate';

/**
 * Token budget management for AI agent context windows.
 */
export { contextBudget } from './budget';
export type { TokenBudget, TokenBudgetOverrides } from './budget.types';

/**
 * Context filtering to select relevant files and information for specific workflow phases.
 */
export { contextFilter, getPhaseCategories } from './filter';
export type { WorkflowPhase, FileCategory, ContextFilterResult } from './filter.types';

/**
 * Type definitions for agent context, knowledge maps, and documentation coverage.
 */
export type {
  AgentMapLink,
  AgentMapSection,
  AgentMapValidation,
  DocumentationGap,
  CoverageReport,
  CoverageOptions,
  GraphCoverageData,
  BrokenLink,
  IntegrityReport,
  GenerationSection,
  AgentsMapConfig,
} from './types';

/**
 * The set of required sections that must be present in a valid AGENTS.md file.
 */
export { REQUIRED_SECTIONS } from './types';
