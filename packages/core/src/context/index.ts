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
 * Context-surface attribution — classify the always-loaded surface, rank
 * contributors, and flag over-budget classes via the contextBudget() allocator.
 */
export {
  buildAttributionReport,
  heuristicTokenCounter,
  CONTEXT_CLASSES,
  CLASS_TO_BUDGET_CATEGORY,
} from './attribution';
export type {
  ContextClass,
  ContextSurfaceEntry,
  TokenCounter,
  AttributedContributor,
  ClassAttribution,
  CounterMode,
  AttributionReport,
  BuildAttributionReportOptions,
} from './attribution';

/**
 * Exact token counting via Anthropic's /v1/messages/count_tokens, with a
 * graceful fallback to the chars/4 heuristic when no API key / offline.
 */
export {
  createAnthropicTokenCounter,
  resolveTokenCounter,
  DEFAULT_COUNT_TOKENS_MODEL,
} from './count-tokens';
export type {
  AnthropicTokenCounterOptions,
  FetchLike,
  ResolvedCounterMode,
  ResolvedTokenCounter,
} from './count-tokens';

/**
 * Section parser for progressive skill content loading.
 */
export { parseSections, extractLevel } from './section-parser';

/**
 * Instruction-density estimation — imperative-instruction count per SKILL.md
 * packing level, validating the progressive-disclosure mitigation against the
 * HumanLayer instruction-follow budget ([HORTHY-2]).
 */
export {
  countImperativeInstructions,
  analyzeSkillInstructionDensity,
  DEFAULT_INSTRUCTION_BUDGET,
} from './instruction-density';
export type { LevelInstructionDensity, SkillInstructionDensityReport } from './instruction-density';
export type { ParsedSection } from './section-parser';

/**
 * Mid-phase context-budget trip wire — classifies a turn's resident-token count
 * as ok | warn | trip against absolute, window-keyed anchors, the intra-turn
 * complement to autopilot's between-phase cold dispatch ([HORTHY-1]).
 */
export {
  resolveContextBudgetThresholds,
  evaluateContextBudget,
  EFFECTIVE_WINDOW_RATIO,
} from './context-budget-trip-wire';
export type {
  ContextBudgetVerdict,
  ContextWindowBand,
  ContextBudgetThresholds,
  ContextBudgetEvaluation,
} from './context-budget-trip-wire';

/**
 * Progressive skill loading with token budget management.
 */
export { computeLoadPlan, DEFAULT_LOADER_CONFIG } from './progressive-loader';
export type { LoaderConfig, SkillLoadPlan } from './progressive-loader';

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
