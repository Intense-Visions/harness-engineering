import type { ToolDefinition } from './tool-types.js';

/**
 * Abstract MCP tool tier. Higher tiers include more tools.
 *
 * Policy:
 *  - core: smallest useful set for validation, state, and navigation.
 *  - standard: core + review/scan/analysis tools for day-to-day work.
 *  - full: every tool in the registry.
 */
export type McpToolTier = 'core' | 'standard' | 'full';

/**
 * Tool-name allow-lists per tier. `standard` is a superset of `core`.
 *
 * Unknown tools (added after this table was last maintained) are
 * included in `full` only, so adding a tool can never silently enter
 * the `core` or `standard` set.
 */
export const CORE_TOOL_NAMES: readonly string[] = [
  'validate_project',
  'check_dependencies',
  'check_docs',
  'query_graph',
  'get_impact',
  'list_gateway_tokens',
  'manage_state',
  'run_skill',
  'code_search',
  'code_outline',
  'compact',
  // Hermes Phase 1 — read-only, cheap, high-value
  'search_sessions',
  'insights_summary',
];

const STANDARD_EXTRA: readonly string[] = [
  // Review / scan / analysis
  'run_code_review',
  'run_security_scan',
  'detect_entropy',
  'check_performance',
  'review_changes',
  'analyze_diff',
  // Graph navigation
  'find_context_for',
  'get_relationships',
  'search_similar',
  'compute_blast_radius',
  'ask_graph',
  // Workflow
  'manage_roadmap',
  'check_phase_gate',
  'gather_context',
  'assess_project',
  'recommend_skills',
  'search_skills',
  'code_unfold',
  // Gateway tools (Phase 2 Task 11 + Phase 3 Task 9)
  'trigger_maintenance_job',
  'subscribe_webhook',
  // Hermes Phase 1 — has LLM-spend implication, kept out of core
  'summarize_session',
];

export const STANDARD_TOOL_NAMES: readonly string[] = [...CORE_TOOL_NAMES, ...STANDARD_EXTRA];

/**
 * Default tokens-per-character heuristic — roughly 4 chars per token.
 * Exposed so callers/tests can override deterministically.
 */
export const DEFAULT_CHARS_PER_TOKEN = 4;

/**
 * Estimate baseline tokens consumed by registering the given tool definitions.
 * Uses a deterministic char-length / CHARS_PER_TOKEN heuristic.
 *
 * @param definitions Tools the server would expose.
 * @param charsPerToken Override the default heuristic (e.g. for tests).
 */
export function estimateBaselineTokens(
  definitions: readonly ToolDefinition[],
  charsPerToken = DEFAULT_CHARS_PER_TOKEN
): number {
  if (charsPerToken <= 0) {
    throw new Error('charsPerToken must be > 0');
  }
  let totalChars = 0;
  for (const def of definitions) {
    totalChars += def.name.length;
    totalChars += def.description.length;
    totalChars += JSON.stringify(def.inputSchema).length;
  }
  return Math.ceil(totalChars / charsPerToken);
}

/**
 * Default token budget thresholds. Under each threshold the corresponding
 * tier is selected. Callers can override via SelectTierOptions.
 */
export const DEFAULT_BUDGETS = {
  coreMax: 4_000,
  standardMax: 12_000,
} as const;

export interface SelectTierOptions {
  /** Measured or configured token budget. Undefined means "use full". */
  tokenBudget?: number;
  /** Explicit tier override — skips automatic selection. */
  overrideTier?: McpToolTier;
  /** Override the default char/token heuristic. */
  charsPerToken?: number;
  /** Override the default budget thresholds. */
  budgets?: { coreMax: number; standardMax: number };
}

export interface TierSelection {
  tier: McpToolTier;
  /** Tool names to pass to buildFilteredTools (undefined for 'full' = no filter). */
  filter: string[] | undefined;
  /** Estimated tokens for the chosen set. */
  estimatedTokens: number;
  /** Reason for selection (for logging). */
  reason: string;
}

/**
 * Select an MCP tool tier given a budget and the full list of definitions.
 *
 * Resolution order:
 *  1. If `overrideTier` is set, use it (still filters to known tools).
 *  2. If `tokenBudget` is undefined, use `full`.
 *  3. If `tokenBudget < budgets.coreMax`, use `core`.
 *  4. If `tokenBudget < budgets.standardMax`, use `standard`.
 *  5. Otherwise, `full`.
 */
export function selectTier(
  definitions: readonly ToolDefinition[],
  options: SelectTierOptions = {}
): TierSelection {
  const budgets = options.budgets ?? DEFAULT_BUDGETS;
  const charsPerToken = options.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN;

  const tier = resolveTier(options, budgets);
  const filter = filterForTier(tier, definitions);
  const effectiveDefs =
    filter === undefined ? definitions : definitions.filter((d) => filter.includes(d.name));
  const estimatedTokens = estimateBaselineTokens(effectiveDefs, charsPerToken);

  return {
    tier,
    filter,
    estimatedTokens,
    reason: explainTier(tier, options, budgets),
  };
}

function resolveTier(
  options: SelectTierOptions,
  budgets: { coreMax: number; standardMax: number }
): McpToolTier {
  if (options.overrideTier) return options.overrideTier;
  const budget = options.tokenBudget;
  if (budget === undefined) return 'full';
  if (budget < budgets.coreMax) return 'core';
  if (budget < budgets.standardMax) return 'standard';
  return 'full';
}

function filterForTier(
  tier: McpToolTier,
  definitions: readonly ToolDefinition[]
): string[] | undefined {
  if (tier === 'full') return undefined;
  const allow = tier === 'core' ? CORE_TOOL_NAMES : STANDARD_TOOL_NAMES;
  const allowSet = new Set(allow);
  const present = new Set(definitions.map((d) => d.name));
  // Intersect with present names so missing entries in the allow-list don't pollute.
  return allow.filter((name) => present.has(name) && allowSet.has(name));
}

function explainTier(
  tier: McpToolTier,
  options: SelectTierOptions,
  budgets: { coreMax: number; standardMax: number }
): string {
  if (options.overrideTier) return `override: ${options.overrideTier}`;
  if (options.tokenBudget === undefined) return 'no budget specified; defaulting to full';
  return `tokenBudget=${options.tokenBudget} → ${tier} (thresholds: core<${budgets.coreMax}, standard<${budgets.standardMax})`;
}
