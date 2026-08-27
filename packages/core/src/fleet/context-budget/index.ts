// packages/core/src/fleet/context-budget/index.ts
//
// Pure, offline primitives for the per-leaf context-replay budget
// (docs/changes/context-replay-budget-per-leaf/proposal.md, issue #1524).
//
// NO network, NO `gh`, NO fs, NO token-counting library — every function here is
// a pure transform over data the caller already has, matching the injected-IO
// discipline of fleet/claims. The caller supplies the estimate; this module
// DECIDES whether the leaf is in budget and, when it is not, produces the loud
// rejection a fleet DISPATCH surfaces before ever fanning out the leaf.

import {
  ContextBudgetSchema,
  type ContextBudget,
  type LeafBudgetVerdict,
  type LeafContextEstimate,
  type LeafContextSource,
  type LeafContextSpend,
} from '@harness-engineering/types';

/**
 * The sane default per-leaf context budget: 200,000 tokens — roughly a full large
 * context window. The ceiling is on the ASSEMBLED context size (the number fan-out
 * multiplies), NOT on cumulative replay (`context_size × turns`). A leaf that
 * declares/estimates more than this must be rejected loudly rather than fanned out
 * to silently multiply the dominant cost term. Override via fleet config.
 */
export const DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS = 200_000;

/**
 * Resolve the effective per-leaf budget from an optional config override, applying
 * {@link DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS} when no override is supplied. Validates
 * via {@link ContextBudgetSchema}, so a non-positive `maxTokens` override is
 * rejected (throws) rather than silently disabling the ceiling.
 */
export function resolveContextBudget(override?: Partial<ContextBudget>): ContextBudget {
  const maxTokens = override?.maxTokens ?? DEFAULT_LEAF_CONTEXT_BUDGET_TOKENS;
  return ContextBudgetSchema.parse({ maxTokens });
}

/** The largest `count` sources by token contribution, descending (stable on ties). */
function topSourcesByTokens(sources: LeafContextSource[], count: number): LeafContextSource[] {
  return [...sources].sort((a, b) => b.tokens - a.tokens).slice(0, count);
}

/** Compact thousands separator for the loud message (offline, locale-independent). */
function withSep(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * The enforcement primitive. Compare a leaf's declared/estimated context load
 * against its budget and return a discriminated {@link LeafBudgetVerdict}.
 *
 * - Within budget (including the boundary `estimatedTokens === budget.maxTokens`)
 *   → `{ ok: true, headroomTokens }`. The boundary is IN budget, not an overage.
 * - Over budget → `{ ok: false, overageTokens, reason, topSources }`, where
 *   `reason` is a loud, human-readable sentence naming the item, the estimate, the
 *   budget, the overage, and (when a breakdown was supplied) the largest
 *   contributors. This is the fail-loud contract: a leaf over budget is REJECTED
 *   visibly at dispatch, never silently spent.
 *
 * Pure and non-throwing over a well-formed estimate/budget (validate the estimate
 * with `validateLeafContextEstimate` upstream if it is untrusted).
 */
export function enforceLeafContextBudget(
  estimate: LeafContextEstimate,
  budget: ContextBudget
): LeafBudgetVerdict {
  const { item, estimatedTokens } = estimate;
  const budgetTokens = budget.maxTokens;
  if (estimatedTokens <= budgetTokens) {
    return {
      ok: true,
      item,
      estimatedTokens,
      budgetTokens,
      headroomTokens: budgetTokens - estimatedTokens,
    };
  }
  const overageTokens = estimatedTokens - budgetTokens;
  const topSources = topSourcesByTokens(estimate.sources, 3);
  const contributors =
    topSources.length > 0
      ? ` Largest contributors: ${topSources
          .map((s) => `${s.label} (${withSep(s.tokens)})`)
          .join(', ')}.`
      : '';
  const reason =
    `Leaf ${item} rejected at dispatch: estimated context load ${withSep(estimatedTokens)} tokens ` +
    `exceeds the per-leaf budget of ${withSep(budgetTokens)} by ${withSep(overageTokens)} tokens.` +
    contributors;
  return { ok: false, item, estimatedTokens, budgetTokens, overageTokens, reason, topSources };
}

/**
 * Format the loud, human-readable message a fleet DISPATCH surfaces when a leaf is
 * rejected. For an over-budget verdict this is the verdict's own `reason`; for an
 * in-budget verdict it states the headroom (so a caller can log either outcome
 * uniformly).
 */
export function formatBudgetFailure(verdict: LeafBudgetVerdict): string {
  if (verdict.ok) {
    return (
      `Leaf ${verdict.item} within context budget: ${withSep(verdict.estimatedTokens)} of ` +
      `${withSep(verdict.budgetTokens)} tokens (${withSep(verdict.headroomTokens)} headroom).`
    );
  }
  return verdict.reason;
}

/**
 * Build the per-leaf {@link LeafContextSpend} record recorded in the lane
 * provenance file. `withinBudget` is derived from the same comparison the
 * enforcement primitive uses (`estimatedTokens <= budget.maxTokens`), so the
 * recorded verdict cannot drift from the enforced one. `cacheReadTokens` is the
 * measured post-hoc consumption when known (deferred wiring); omit it otherwise.
 */
export function summarizeLeafSpend(
  estimate: LeafContextEstimate,
  budget: ContextBudget,
  cacheReadTokens?: number
): LeafContextSpend {
  const record: LeafContextSpend = {
    item: estimate.item,
    budgetTokens: budget.maxTokens,
    estimatedTokens: estimate.estimatedTokens,
    withinBudget: estimate.estimatedTokens <= budget.maxTokens,
  };
  if (cacheReadTokens !== undefined) record.cacheReadTokens = cacheReadTokens;
  return record;
}
