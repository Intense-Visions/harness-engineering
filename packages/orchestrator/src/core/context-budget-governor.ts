// packages/orchestrator/src/core/context-budget-governor.ts
//
// The LIVE enforcement caller for the per-leaf context-replay budget (#1524).
//
// The primitive that DECIDES (`assertLeafWithinBudget`) lives in
// @harness-engineering/core (fleet/context-budget); this module is the executable
// dispatch-governor seam that CONSULTS it before the state machine fans out a
// leaf. It is deliberately the one place the orchestrator asks "is this leaf
// within its declared context budget?" so the budget cannot be set-but-never-read.
//
// Byte-identical default: when no `agent.contextBudget` is configured the guard is
// a no-op, so dispatch behaves exactly as it did before this field existed. Only
// an explicitly-configured budget changes behavior.

import { assertLeafWithinBudget } from '@harness-engineering/core';
import type {
  Issue,
  LeafContextEstimate,
  LeafContextSource,
  WorkflowConfig,
} from '@harness-engineering/types';

/** Rough tokens-per-character ratio for an offline, dependency-free estimate. */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate the in-memory context load (in tokens) a leaf will assemble for an
 * issue, deterministically and WITHOUT I/O. It sums the text the orchestrator
 * already holds for the issue — `title` + `description` — and converts to a token
 * floor at ~{@link CHARS_PER_TOKEN} chars/token. `spec` and `plans` are file
 * PATHS (not content), so they are not read here; the estimate is a deliberate
 * floor over the always-in-memory surface. A richer estimate (reading spec/plan
 * files or reusing an enriched-spec token count) is a follow-up slice.
 */
export function estimateIssueContextTokens(issue: Issue): number {
  const text = `${issue.title ?? ''}${issue.description ?? ''}`;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * SF5.1 (#1524) — build a leaf's context estimate, attributing served-
 * comprehension token counts into `sources`.
 *
 * The estimate is a deliberate FLOOR: `estimateIssueContextTokens` (the always-in-
 * memory title+description surface) PLUS one `LeafContextSource` per served
 * comprehension unit (its `tokens` is the served, `renderServedUnit`-based
 * estimate produced by `resolveLeafPrewarm`). Because a served unit is the compact
 * comprehension form — not the raw module source — attributing served tokens
 * yields a LOWER `estimatedTokens` than counting the raw source for the same
 * modules would. With no served units the estimate is byte-identical to the prior
 * floor-only behavior (`sources: []`, `estimatedTokens === estimateIssueContextTokens`).
 *
 * Pure and IO-free — no LLM, no credential, no disk.
 */
export function buildLeafContextEstimate(
  issue: Issue,
  servedSources: LeafContextSource[] = []
): LeafContextEstimate {
  const floor = estimateIssueContextTokens(issue);
  const servedTokens = servedSources.reduce((sum, s) => sum + s.tokens, 0);
  return {
    item: issue.identifier,
    estimatedTokens: floor + servedTokens,
    sources: servedSources,
  };
}

/**
 * The live budget consult. When `config.agent.contextBudget.maxTokens` is set,
 * estimate the issue-leaf's context load and delegate to the core
 * `assertLeafWithinBudget` primitive, which THROWS a `ContextBudgetExceededError`
 * (fail-loud) when the estimate exceeds the ceiling. When no budget is configured
 * (or `maxTokens` is not a positive number) this returns immediately — a no-op
 * that keeps dispatch byte-identical to the pre-budget behavior.
 *
 * The caller (the dispatch loop in `state-machine.ts`) catches the throw, emits a
 * loud error effect, and skips dispatching that leaf — so an over-budget leaf
 * fails visibly and never spends.
 */
export function assertIssueWithinContextBudget(
  config: WorkflowConfig,
  issue: Issue,
  prewarm?: { sources: LeafContextSource[] }
): void {
  const budget = config.agent.contextBudget;
  if (!budget || !(typeof budget.maxTokens === 'number') || !(budget.maxTokens > 0)) {
    return; // unconfigured ⇒ unlimited, no enforcement (byte-identical default)
  }
  // SF5.2 (#1524/SC1): consult with the comprehension-LOWERED estimate. When the
  // leaf's pre-warmed served units are supplied, their (compact) tokens are
  // attributed into `sources`, so a leaf that would be over budget on raw source
  // can be within budget once served units replace it — and on an overage the
  // thrown verdict's `topSources` names the served units. With no prewarm the
  // estimate is the floor-only default (byte-identical to the pre-#1524 behavior).
  const estimate = buildLeafContextEstimate(issue, prewarm?.sources ?? []);
  assertLeafWithinBudget(estimate, { maxTokens: budget.maxTokens });
}
