// packages/types/src/fleet-spend-budget.ts
//
// FleetSpendBudget — the spend-envelope decision shapes shared by BOTH the
// orchestrator engine's dispatch loop (#1525) AND the skill/fleet-command
// dispatch path (#1600).
//
// #1525 (PR #1587) enforces a per-period token spend envelope, but only inside
// the orchestrator engine's `state-machine.ts` code loop. The skill-driven
// fan-out (`/harness:roadmap-fleet`, `fleet-command`) has no such loop — an
// agent is the dispatcher — so it was governed only by a leaf-SLOT cap, never a
// SPEND cap. This module owns ONLY the shapes; the pure decision logic lives in
// @harness-engineering/core (fleet/spend-budget), mirroring how
// fleet-context-budget.ts pairs with core/fleet/context-budget and fleet-claim.ts
// with core/fleet/claims.
//
// The primitive is deliberately UNIT-AGNOSTIC: it compares an accrued-spend
// number against an envelope, and each caller supplies numbers in its own
// consistent unit — the orchestrator uses raw `tokenTotals`; the fleet-command
// path uses burn's attributed, price-weighted `units`. The unit is stated at
// each call site so the two never silently mix.

import { z } from 'zod';

/** Current version of the spend-budget shapes. Bump only on a breaking change;
 * consumers tolerate an absent or unknown version. */
export const FLEET_SPEND_BUDGET_VERSION = 1;

/**
 * A spend envelope for a period. Reuses the {@link AgentBudgetConfig} shape
 * (global cap + optional per-fleet sub-allocations) so the orchestrator engine
 * and the fleet-command dispatch path express the cap identically. `perFleet`
 * maps a fleet key (the orchestrator's `fleet:` label suffix, or the fleet
 * path's invoking-skill name) to its token sub-cap.
 */
export const SpendEnvelopeSchema = z
  .object({
    /** Global spend cap for the period, in the caller's spend unit. */
    envelopeTokens: z.number().nonnegative(),
    /** Optional per-fleet sub-allocations (fleet key → cap). */
    perFleet: z.record(z.string(), z.number().nonnegative()).optional(),
  })
  .strict();

export type SpendEnvelope = z.infer<typeof SpendEnvelopeSchema>;

/**
 * Accrued spend observed for the active period, in the SAME unit as the
 * {@link SpendEnvelope} it is compared against. On the orchestrator path this is
 * derived from `BudgetState`; on the fleet-command path it is read from burn's
 * existing per-fleet/per-lane attribution (#1270) — never a new measurement
 * pipeline.
 */
export interface ObservedSpend {
  /** Total spend accrued in the active period. */
  global: number;
  /** Optional per-fleet accrued spend (fleet key → spend). */
  perFleet?: Record<string, number>;
}

/**
 * The verdict of consulting a {@link SpendEnvelope} at DISPATCH time.
 * Discriminated on `status`:
 * - `within`       — a new lane may be dispatched; `remainingTokens` is the
 *                    global headroom left in the period.
 * - `exhausted`    — dispatch must STOP CLEANLY at the lane boundary; `scope`
 *                    says whether the GLOBAL envelope (stop the whole run) or a
 *                    single `fleet`'s sub-allocation (skip only that fleet) is
 *                    spent. `reason` is a loud, human-readable sentence.
 * - `unconfigured` — no envelope was supplied ⇒ no-op, behavior byte-identical
 *                    to the pre-#1600 world (unbounded, the pre-#1525 posture).
 */
export type SpendEnvelopeVerdict =
  | {
      status: 'within';
      envelopeTokens: number;
      spentTokens: number;
      remainingTokens: number;
    }
  | {
      status: 'exhausted';
      scope: 'global' | 'fleet';
      /** The fleet key when `scope === 'fleet'`; `null` for a global breach. */
      fleet: string | null;
      envelopeTokens: number;
      spentTokens: number;
      reason: string;
    }
  | { status: 'unconfigured' };

/**
 * Parse an untrusted value into a {@link SpendEnvelope}, throwing on a malformed
 * envelope (unknown keys via `.strict()`, negative caps). A malformed envelope is
 * rejected, never silently misread.
 */
export function validateSpendEnvelope(input: unknown): SpendEnvelope {
  return SpendEnvelopeSchema.parse(input);
}
