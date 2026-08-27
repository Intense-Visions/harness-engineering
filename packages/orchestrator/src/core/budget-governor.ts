import {
  isGlobalEnvelopeExhausted as coreIsGlobalEnvelopeExhausted,
  isFleetAllocationExhausted as coreIsFleetAllocationExhausted,
} from '@harness-engineering/core';
import type {
  AgentBudgetConfig,
  BudgetEnvelopeStatus,
  FleetBudgetStatus,
  Issue,
} from '@harness-engineering/types';

/**
 * Budget governor for unattended dispatch (#1525).
 *
 * Makes 168-hour unattended operation safe to enable by enforcing a per-period
 * **spend envelope** — denominated in total tokens (input + output), the same
 * unit the orchestrator already accrues in `tokenTotals`. The governor is
 * consulted BEFORE a lane is dispatched (see `canDispatch` in `concurrency.ts`)
 * and refuses a NEW dispatch once the envelope is spent. Lanes already in flight
 * are never touched, so dispatch stops cleanly at a lane boundary — never
 * mid-write.
 *
 * All functions here are pure: the mutable {@link BudgetState} lives on
 * `OrchestratorState.budget` and is threaded through the state machine's
 * clone-per-event discipline. The governor is OFF when no
 * {@link AgentBudgetConfig} is configured — `null` state ⇒ unbounded dispatch,
 * the pre-#1525 behaviour.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const DEFAULT_FLEET_LABEL_PREFIX = 'fleet:';

/** Length of one accounting window, in ms. */
export function periodLengthMs(period: AgentBudgetConfig['period']): number {
  return period === 'week' ? WEEK_MS : DAY_MS;
}

/**
 * Mutable per-period spend accumulator. Anchored at the first spend of a window;
 * a window that has fully elapsed is rolled (reset) on the next spend or read.
 */
export interface BudgetState {
  /** Epoch-ms anchor of the active window. */
  periodStartMs: number;
  /** Total tokens spent in the active window. */
  spentTokens: number;
  /** Per-fleet token spend in the active window (fleet key → tokens). */
  perFleetSpent: Record<string, number>;
}

/** Fresh, empty budget state anchored at `nowMs`. */
export function createBudgetState(nowMs: number): BudgetState {
  return { periodStartMs: nowMs, spentTokens: 0, perFleetSpent: {} };
}

/** Deep clone (the state machine clones the whole {@link OrchestratorState} per event). */
export function cloneBudgetState(state: BudgetState): BudgetState {
  return {
    periodStartMs: state.periodStartMs,
    spentTokens: state.spentTokens,
    perFleetSpent: { ...state.perFleetSpent },
  };
}

/** True when the active window has fully elapsed by `nowMs`. */
function windowElapsed(
  state: BudgetState,
  period: AgentBudgetConfig['period'],
  nowMs: number
): boolean {
  return nowMs - state.periodStartMs >= periodLengthMs(period);
}

/**
 * Roll the window if it has elapsed, returning a FRESH state anchored at
 * `nowMs`; otherwise return `state` unchanged (referentially, so callers can
 * cheaply detect a roll). Read paths use this to report a rolled window's spend
 * as zero without mutating; the write path (`recordBudgetSpend`) rolls before
 * accruing so a new window starts clean.
 */
export function rollBudgetPeriod(
  state: BudgetState,
  config: AgentBudgetConfig,
  nowMs: number
): BudgetState {
  if (windowElapsed(state, config.period, nowMs)) {
    return createBudgetState(nowMs);
  }
  return state;
}

/**
 * Attribute an issue to a fleet for per-fleet accounting. Reads the first label
 * matching the configured prefix (default `fleet:`) and returns the suffix.
 * Returns `null` when no fleet label is present — the lane then counts only
 * against the global envelope.
 */
export function fleetKeyForIssue(issue: Issue, config: AgentBudgetConfig): string | null {
  const prefix = config.fleetLabelPrefix ?? DEFAULT_FLEET_LABEL_PREFIX;
  for (const label of issue.labels ?? []) {
    if (label.startsWith(prefix) && label.length > prefix.length) {
      return label.slice(prefix.length);
    }
  }
  return null;
}

/**
 * Record `tokens` of spend against the global envelope and (when attributed) the
 * `fleetKey` sub-allocation. Rolls an elapsed window first, so spend always
 * accrues into the current period. Returns a NEW state (never mutates the
 * argument). Non-positive token counts are ignored.
 */
export function recordBudgetSpend(
  state: BudgetState,
  config: AgentBudgetConfig,
  fleetKey: string | null,
  tokens: number,
  nowMs: number
): BudgetState {
  const rolled = rollBudgetPeriod(state, config, nowMs);
  const next = cloneBudgetState(rolled);
  if (tokens > 0) {
    next.spentTokens += tokens;
    if (fleetKey) {
      next.perFleetSpent[fleetKey] = (next.perFleetSpent[fleetKey] ?? 0) + tokens;
    }
  }
  return next;
}

/** Effective spend for the active window, treating an elapsed window as zero. */
function effectiveSpend(
  state: BudgetState,
  config: AgentBudgetConfig,
  nowMs: number
): { global: number; perFleet: Record<string, number> } {
  if (windowElapsed(state, config.period, nowMs)) {
    return { global: 0, perFleet: {} };
  }
  return { global: state.spentTokens, perFleet: state.perFleetSpent };
}

/**
 * True once the GLOBAL envelope is spent. A breach here stops dispatch for
 * EVERY fleet at the next lane boundary — the clean, whole-run stop.
 */
export function isGlobalEnvelopeExhausted(
  state: BudgetState,
  config: AgentBudgetConfig,
  nowMs: number
): boolean {
  // Delegate the spend-vs-envelope comparison to the ONE shared primitive in
  // @harness-engineering/core (fleet/spend-budget) — the same fact the
  // fleet-command dispatch path consults via `harness fleet budget-check` (#1600).
  return coreIsGlobalEnvelopeExhausted(
    effectiveSpend(state, config, nowMs).global,
    config.envelopeTokens
  );
}

/**
 * True once `fleetKey`'s sub-allocation is spent while the global envelope may
 * still have room. A breach here skips only THIS fleet's lanes — sibling fleets
 * keep dispatching — so two fleets sharing an envelope respect their split under
 * contention. `null`/unconfigured fleet ⇒ never fleet-exhausted (bounded only by
 * the global envelope).
 */
export function isFleetAllocationExhausted(
  state: BudgetState,
  config: AgentBudgetConfig,
  fleetKey: string | null,
  nowMs: number
): boolean {
  if (!fleetKey) return false;
  // Same shared primitive as the global check and the fleet-command path (#1600).
  return coreIsFleetAllocationExhausted(
    effectiveSpend(state, config, nowMs).perFleet[fleetKey] ?? 0,
    config.perFleet?.[fleetKey]
  );
}

/**
 * The governor's dispatch verdict: may a NEW lane for `fleetKey` be dispatched
 * without breaching the global envelope OR the fleet's sub-allocation?
 *
 * Read-only. Used where a single lane is redispatched (the retry path): a breach
 * at either level parks the lane. The tick dispatch loop instead calls the two
 * predicates above directly, because global vs. per-fleet exhaustion differ in
 * whether they stop the whole loop or skip one lane.
 */
export function canAffordDispatch(
  state: BudgetState,
  config: AgentBudgetConfig,
  fleetKey: string | null,
  nowMs: number
): boolean {
  return (
    !isGlobalEnvelopeExhausted(state, config, nowMs) &&
    !isFleetAllocationExhausted(state, config, fleetKey, nowMs)
  );
}

/**
 * Operator-visible remaining-budget signal (#1525). Surfaced in the orchestrator
 * snapshot so an operator sees how much of the envelope is left. Reports an
 * elapsed window as a fresh (fully-remaining) period.
 */
export function getBudgetStatus(
  state: BudgetState,
  config: AgentBudgetConfig,
  nowMs: number
): BudgetEnvelopeStatus {
  const elapsed = windowElapsed(state, config.period, nowMs);
  const periodStartMs = elapsed ? nowMs : state.periodStartMs;
  const spend = effectiveSpend(state, config, nowMs);

  const allocations: Record<string, number> = config.perFleet ?? {};
  const perFleet: FleetBudgetStatus[] = Object.entries(allocations).map(
    ([fleet, allocatedTokens]) => {
      const spentTokens = spend.perFleet[fleet] ?? 0;
      const remainingTokens = Math.max(allocatedTokens - spentTokens, 0);
      return {
        fleet,
        allocatedTokens,
        spentTokens,
        remainingTokens,
        exhausted: spentTokens >= allocatedTokens,
      };
    }
  );

  const spentTokens = spend.global;
  return {
    period: config.period,
    periodStartMs,
    periodEndMs: periodStartMs + periodLengthMs(config.period),
    envelopeTokens: config.envelopeTokens,
    spentTokens,
    remainingTokens: Math.max(config.envelopeTokens - spentTokens, 0),
    exhausted: spentTokens >= config.envelopeTokens,
    perFleet,
  };
}
