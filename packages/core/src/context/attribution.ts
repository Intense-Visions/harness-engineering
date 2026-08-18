/**
 * Context-surface attribution.
 *
 * Reports what the always-loaded context surface actually costs per turn:
 * every contributor is classified as always-loaded / path-scoped / invoked-only,
 * the top contributors are ranked, and each class is flagged when it exceeds the
 * share of the window that the {@link contextBudget} allocator gives it.
 *
 * Token counts come from an injected {@link TokenCounter}. The exact counter
 * (Anthropic's `/v1/messages/count_tokens`, see `./count-tokens`) is preferred;
 * when it is unavailable or a call fails, the report degrades gracefully to the
 * `chars / 4` heuristic ({@link estimateTokens}) and records that it did so —
 * it never hard-fails.
 */

import { estimateTokens } from '../compaction/envelope';
import { contextBudget } from './budget';
import type { TokenBudget, TokenBudgetOverrides } from './budget.types';

/**
 * The three-way context-surface classification taxonomy.
 *
 *  - `always-loaded` — sits in every turn's context regardless of the task
 *    (MCP tool schemas, AGENTS.md, hooks). The fixed per-turn tax.
 *  - `path-scoped`   — loaded only when the working set touches a given path
 *    (path-scoped instructions, per-directory manifests).
 *  - `invoked-only`  — loaded on demand when a capability is invoked (skill
 *    bodies that Claude Code defers until the skill runs).
 */
export type ContextClass = 'always-loaded' | 'path-scoped' | 'invoked-only';

/** All context classes, in report order. */
export const CONTEXT_CLASSES: readonly ContextClass[] = [
  'always-loaded',
  'path-scoped',
  'invoked-only',
];

/**
 * Which {@link TokenBudget} category each context class is allocated against.
 * The always-loaded surface competes for the system-prompt allocation; the
 * path-scoped surface for the project-manifest allocation; invoked-only for the
 * interfaces allocation. Documented and stable so over-budget flags are
 * reproducible.
 */
export const CLASS_TO_BUDGET_CATEGORY: Record<ContextClass, keyof TokenBudget> = {
  'always-loaded': 'systemPrompt',
  'path-scoped': 'projectManifest',
  'invoked-only': 'interfaces',
};

/** One measurable item on the context surface. */
export interface ContextSurfaceEntry {
  /** Stable identifier (e.g. tool name, file path). */
  id: string;
  /** Human-readable label for the report. */
  label: string;
  /** How this entry loads into context. */
  contextClass: ContextClass;
  /** The raw text whose tokens are being attributed. */
  text: string;
}

/**
 * A token counter. May be synchronous (the heuristic) or asynchronous (an API
 * call). It MAY throw / reject — {@link buildAttributionReport} catches that and
 * falls back to the heuristic for the offending entry.
 */
export type TokenCounter = (text: string) => number | Promise<number>;

/** The heuristic (`chars / 4`) counter — the documented graceful fallback. */
export const heuristicTokenCounter: TokenCounter = (text: string) => estimateTokens(text);

/** A single attributed contributor with its measured token cost. */
export interface AttributedContributor {
  id: string;
  label: string;
  contextClass: ContextClass;
  tokens: number;
  /** True when this entry's count fell back to the heuristic. */
  degraded: boolean;
}

/** Per-class rollup of the surface. */
export interface ClassAttribution {
  contextClass: ContextClass;
  /** Total tokens attributed to this class. */
  tokens: number;
  /** Number of contributors in this class. */
  count: number;
  /** Tokens the {@link contextBudget} allocator gave this class. */
  budgetTokens: number;
  /** True when `tokens > budgetTokens`. */
  overBudget: boolean;
}

/** How the report's token counts were produced. */
export type CounterMode = 'exact' | 'heuristic' | 'mixed';

export interface AttributionReport {
  /** Context-window size the budget was computed against. */
  windowTokens: number;
  /** The allocator output that drives the over-budget flags. */
  budget: TokenBudget;
  /** Total tokens across every contributor. */
  totalTokens: number;
  /** Per-class rollups (always-loaded, path-scoped, invoked-only). */
  byClass: ClassAttribution[];
  /** Every contributor, ranked by token cost descending. */
  contributors: AttributedContributor[];
  /** The `topN` most expensive contributors (convenience slice). */
  topContributors: AttributedContributor[];
  /** How counts were produced across the whole report. */
  counterMode: CounterMode;
  /** True when any entry fell back to the heuristic. */
  degraded: boolean;
}

export interface BuildAttributionReportOptions {
  /**
   * Context-window size to budget against. The {@link contextBudget} allocator
   * splits this into per-category allocations that drive the over-budget flags.
   */
  windowTokens: number;
  /**
   * Token counter to use. Defaults to the heuristic. When an exact counter is
   * supplied, per-entry failures fall back to the heuristic (the report is
   * marked `degraded` / `mixed`), so the report never hard-fails.
   */
  counter?: TokenCounter;
  /**
   * Whether `counter` is the exact (API) counter. Controls the reported
   * {@link CounterMode}: `exact` when nothing degraded, `mixed` when some
   * entries fell back, `heuristic` when the heuristic was used throughout.
   */
  exact?: boolean;
  /** Optional budget-ratio overrides forwarded to {@link contextBudget}. */
  budgetOverrides?: TokenBudgetOverrides;
  /** Optional graph density forwarded to {@link contextBudget}. */
  graphDensity?: Record<string, number>;
  /** How many contributors to surface in `topContributors`. Default 10. */
  topN?: number;
}

async function countEntry(
  entry: ContextSurfaceEntry,
  counter: TokenCounter
): Promise<{ tokens: number; degraded: boolean }> {
  try {
    const tokens = await counter(entry.text);
    if (!Number.isFinite(tokens) || tokens < 0) {
      // A well-behaved counter never returns this; treat as a soft failure.
      return { tokens: estimateTokens(entry.text), degraded: true };
    }
    return { tokens, degraded: false };
  } catch {
    // Graceful fallback: a failed exact count degrades to the heuristic for
    // this entry rather than failing the whole report.
    return { tokens: estimateTokens(entry.text), degraded: true };
  }
}

/**
 * Build the context-surface attribution report.
 *
 * Wires the {@link contextBudget} allocator in as the budget source: every
 * class's `overBudget` flag is derived from the allocation `contextBudget`
 * returns for the mapped category.
 */
export async function buildAttributionReport(
  entries: readonly ContextSurfaceEntry[],
  options: BuildAttributionReportOptions
): Promise<AttributionReport> {
  const counter = options.counter ?? heuristicTokenCounter;
  const topN = options.topN ?? 10;

  const budget = contextBudget(options.windowTokens, options.budgetOverrides, options.graphDensity);

  const contributors: AttributedContributor[] = [];
  let anyDegraded = false;

  for (const entry of entries) {
    const { tokens, degraded } = await countEntry(entry, counter);
    anyDegraded = anyDegraded || degraded;
    contributors.push({
      id: entry.id,
      label: entry.label,
      contextClass: entry.contextClass,
      tokens,
      degraded,
    });
  }

  contributors.sort((a, b) => b.tokens - a.tokens || a.id.localeCompare(b.id));

  const byClass: ClassAttribution[] = CONTEXT_CLASSES.map((contextClass) => {
    const inClass = contributors.filter((c) => c.contextClass === contextClass);
    const tokens = inClass.reduce((sum, c) => sum + c.tokens, 0);
    const budgetTokens = budget[CLASS_TO_BUDGET_CATEGORY[contextClass]];
    return {
      contextClass,
      tokens,
      count: inClass.length,
      budgetTokens,
      overBudget: tokens > budgetTokens,
    };
  });

  const totalTokens = contributors.reduce((sum, c) => sum + c.tokens, 0);

  let counterMode: CounterMode;
  if (!options.exact) {
    counterMode = 'heuristic';
  } else {
    counterMode = anyDegraded ? 'mixed' : 'exact';
  }

  return {
    windowTokens: options.windowTokens,
    budget,
    totalTokens,
    byClass,
    contributors,
    topContributors: contributors.slice(0, topN),
    counterMode,
    degraded: anyDegraded,
  };
}
