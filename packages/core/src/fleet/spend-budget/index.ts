// packages/core/src/fleet/spend-budget/index.ts
//
// Pure, offline primitives for the shared spend envelope
// (docs/changes/fleet-command-spend-envelope/proposal.md, issue #1600).
//
// This is the ONE spend-vs-envelope comparison consulted by BOTH governed
// dispatch paths:
//   1. the orchestrator engine's code loop — `budget-governor.ts` delegates its
//      exhaustion predicates here (#1525); and
//   2. the skill/fleet-command dispatch path — `harness fleet budget-check`
//      calls `evaluateSpendEnvelope` before each lane is scheduled (#1600).
//
// NO network, NO `gh`, NO fs, NO token-counting library — every function is a
// pure transform over accrued-spend numbers the caller already has, matching the
// injected-IO discipline of fleet/claims and fleet/context-budget. The module is
// deliberately UNIT-AGNOSTIC: it compares an accrued-spend number against an
// envelope, and each caller supplies numbers in its own consistent unit (the
// orchestrator uses raw `tokenTotals`; the fleet path uses burn's price-weighted
// `units`). Mixing units is a caller error the primitive cannot and does not police.

import type {
  ObservedSpend,
  SpendEnvelope,
  SpendEnvelopeVerdict,
} from '@harness-engineering/types';

/** Compact thousands separator for the loud message (offline, locale-independent). */
function withSep(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/**
 * The core comparison, shared by every path: is the GLOBAL envelope spent?
 *
 * A breach here stops dispatch for EVERY fleet at the next lane boundary — the
 * clean, whole-run stop. The boundary (`spentTokens === envelopeTokens`) counts
 * as exhausted, matching #1525's `>=` semantics: once the envelope is met, no
 * NEW lane may be dispatched.
 */
export function isGlobalEnvelopeExhausted(spentTokens: number, envelopeTokens: number): boolean {
  return spentTokens >= envelopeTokens;
}

/**
 * Is `fleetKey`'s sub-allocation spent while the global envelope may still have
 * room? A breach here skips only THIS fleet's lanes — sibling fleets keep
 * dispatching — so two fleets sharing an envelope respect their split under
 * contention. An `undefined` allocation ⇒ never fleet-exhausted (the fleet is
 * bounded only by the global envelope).
 */
export function isFleetAllocationExhausted(
  fleetSpentTokens: number,
  allocation: number | undefined
): boolean {
  if (allocation === undefined) return false;
  return fleetSpentTokens >= allocation;
}

/**
 * The fleet-command DISPATCH consult helper: compare observed spend against the
 * envelope and return a discriminated {@link SpendEnvelopeVerdict}.
 *
 * - `envelope === undefined` → `{ status: 'unconfigured' }` — the no-op path,
 *   byte-identical to the pre-#1600 world.
 * - The **fleet** sub-allocation is checked first: a fleet whose split is spent
 *   is `exhausted` with `scope: 'fleet'` even while the global envelope has room
 *   (skip only that fleet), matching #1525.
 * - Then the **global** envelope: spent ⇒ `exhausted` with `scope: 'global'`
 *   (stop the whole run cleanly at the lane boundary).
 * - Otherwise `within`, carrying the remaining global headroom.
 *
 * The verdict is what a DISPATCH site acts on: `within` ⇒ schedule the next lane;
 * `exhausted` ⇒ stop scheduling NEW lanes at the lane boundary (never interrupt
 * an in-flight lane); `unconfigured` ⇒ unchanged behavior.
 */
export function evaluateSpendEnvelope(
  observed: ObservedSpend,
  envelope: SpendEnvelope | undefined,
  fleetKey?: string | null
): SpendEnvelopeVerdict {
  if (envelope === undefined) {
    return { status: 'unconfigured' };
  }

  const key = fleetKey ?? null;
  if (key) {
    const allocation = envelope.perFleet?.[key];
    const fleetSpent = observed.perFleet?.[key] ?? 0;
    if (isFleetAllocationExhausted(fleetSpent, allocation)) {
      return {
        status: 'exhausted',
        scope: 'fleet',
        fleet: key,
        envelopeTokens: allocation as number,
        spentTokens: fleetSpent,
        reason:
          `Fleet '${key}' has spent ${withSep(fleetSpent)} of its ` +
          `${withSep(allocation as number)} sub-allocation — stop dispatching new ` +
          `'${key}' lanes at the lane boundary (sibling fleets may continue).`,
      };
    }
  }

  if (isGlobalEnvelopeExhausted(observed.global, envelope.envelopeTokens)) {
    return {
      status: 'exhausted',
      scope: 'global',
      fleet: null,
      envelopeTokens: envelope.envelopeTokens,
      spentTokens: observed.global,
      reason:
        `Global spend envelope exhausted: ${withSep(observed.global)} of ` +
        `${withSep(envelope.envelopeTokens)} spent — stop scheduling new lanes at the ` +
        `lane boundary (in-flight lanes finish; nothing is interrupted mid-write).`,
    };
  }

  return {
    status: 'within',
    envelopeTokens: envelope.envelopeTokens,
    spentTokens: observed.global,
    remainingTokens: Math.max(envelope.envelopeTokens - observed.global, 0),
  };
}
