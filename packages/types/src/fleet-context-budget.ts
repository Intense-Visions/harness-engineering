// packages/types/src/fleet-context-budget.ts
//
// FleetContextBudget — the per-leaf context-replay budget shapes for the -fleet
// family (docs/changes/context-replay-budget-per-leaf/proposal.md, issue #1524).
//
// Measured local usage is overwhelmingly context REPLAY, not generation
// (cache-read : output ≈ 298 : 1). Because a fresh fleet leaf's assembled context
// is re-read on every turn, the dominant cost term is `context_size × turns`, and
// fan-out width multiplies it. This module owns ONLY the shapes (zod schema +
// types + the enforcement verdict); the pure enforcement logic (default budget,
// resolve, enforce, format, spend-record) lives in @harness-engineering/core
// (fleet/context-budget), mirroring how fleet-claim.ts pairs with core/fleet/claims.

import { z } from 'zod';

/** Current version of the context-budget shapes. Bump only on a breaking change;
 * consumers tolerate an absent or unknown version. */
export const FLEET_CONTEXT_BUDGET_VERSION = 1;

/**
 * One named contributor to a leaf's estimated context load. Carried so a
 * fail-loud rejection can name WHAT dominated the load (e.g. a large file, the
 * static skill surface) rather than only a total.
 */
export const LeafContextSourceSchema = z
  .object({
    /** Human-readable label for the contributor (file path, surface name, …). */
    label: z.string().min(1),
    /** Estimated token contribution of this source. */
    tokens: z.number().int().nonnegative(),
  })
  .strict();

export type LeafContextSource = z.infer<typeof LeafContextSourceSchema>;

/**
 * The declared/estimated context load a leaf will assemble at dispatch. The
 * budget is enforced BEFORE the leaf runs, so the only available signal is a
 * declared or estimated load — the primitive is agnostic to how the caller
 * arrives at `estimatedTokens` (static-surface attribution, a file-set token
 * count, or a declared value).
 */
export const LeafContextEstimateSchema = z
  .object({
    /** Leaf identifier — issue/PR number, slug, area id (whatever the fleet keys on). */
    item: z.string().min(1),
    /** Total estimated context tokens this leaf will assemble/replay. */
    estimatedTokens: z.number().int().nonnegative(),
    /** Optional breakdown of the largest contributors (for the loud message). */
    sources: z.array(LeafContextSourceSchema).default([]),
  })
  .strict();

export type LeafContextEstimate = z.infer<typeof LeafContextEstimateSchema>;

/**
 * A per-leaf context budget. A hard ceiling on the assembled context size — the
 * number fan-out multiplies — not on cumulative replay. Resolvable from fleet
 * config with an override (see `resolveContextBudget` in core).
 */
export const ContextBudgetSchema = z
  .object({
    /** Hard per-leaf ceiling, in tokens. A leaf over this fails loudly at dispatch. */
    maxTokens: z.number().int().positive(),
  })
  .strict();

export type ContextBudget = z.infer<typeof ContextBudgetSchema>;

/**
 * The per-leaf spend record recorded in the lane provenance file. This slice
 * records the DECLARED budget verdict (`budgetTokens`, `estimatedTokens`,
 * `withinBudget`); the measured post-hoc `cacheReadTokens` is optional and is
 * filled by the deferred live-measurement wiring slice.
 */
export const LeafContextSpendSchema = z
  .object({
    item: z.string().min(1),
    budgetTokens: z.number().int().positive(),
    estimatedTokens: z.number().int().nonnegative(),
    withinBudget: z.boolean(),
    /** Measured cache-read consumption; absent until the deferred wiring lands. */
    cacheReadTokens: z.number().int().nonnegative().optional(),
  })
  .strict();

export type LeafContextSpend = z.infer<typeof LeafContextSpendSchema>;

/**
 * The verdict of enforcing a leaf's estimate against its budget. Discriminated on
 * `ok`, mirroring the repo's `PromoteResult`-style result envelopes:
 * - `ok: true`  — within budget; `headroomTokens` is the remaining allowance.
 * - `ok: false` — over budget; `overageTokens` is the excess, `reason` is a loud
 *                 human-readable sentence, and `topSources` names the largest
 *                 contributors (sorted descending). Fail-loud, never silent.
 */
export type LeafBudgetVerdict =
  | {
      ok: true;
      item: string;
      estimatedTokens: number;
      budgetTokens: number;
      headroomTokens: number;
    }
  | {
      ok: false;
      item: string;
      estimatedTokens: number;
      budgetTokens: number;
      overageTokens: number;
      reason: string;
      topSources: LeafContextSource[];
    };

/**
 * Parse an untrusted value into a {@link LeafContextEstimate}, throwing on a
 * malformed estimate (unknown keys via `.strict()`, negative tokens). A malformed
 * estimate is rejected, never silently misread.
 */
export function validateLeafContextEstimate(input: unknown): LeafContextEstimate {
  return LeafContextEstimateSchema.parse(input);
}

/**
 * Non-throwing counterpart to {@link validateLeafContextEstimate}: returns a
 * zod `SafeParseReturnType` so a caller can route a malformed estimate without a
 * try/catch.
 */
export function safeParseLeafContextEstimate(input: unknown) {
  return LeafContextEstimateSchema.safeParse(input);
}
