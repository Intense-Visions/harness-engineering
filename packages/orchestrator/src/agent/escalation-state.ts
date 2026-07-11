import type { CapabilityTier } from '@harness-engineering/types';

const TIER_RANK: Record<CapabilityTier, number> = { fast: 0, standard: 1, strong: 2 };
const RANK_TIER: CapabilityTier[] = ['fast', 'standard', 'strong'];

interface UnitState {
  floorTier: CapabilityTier;
  failures: number;
  escalated: boolean;
}

/**
 * D10 vertical escalation. Per-`coherenceUnit` quality-failure counter that
 * raises the unit's floor tier one step on the Nth consecutive QUALITY failure
 * (never transport — that is the shipped per-model breaker). Monotonic +
 * `strong`-capped ⇒ cannot loop or thrash. Naming mirrors
 * `LocalModelResolver.recordSuccess/recordFailure` (local-model-resolver.ts:460/474).
 */
export class EscalationState {
  private readonly units = new Map<string, UnitState>();
  constructor(private readonly threshold: number = 2) {}

  /**
   * The current escalation floor for a unit — the minimum tier `route()` must
   * resolve at. Defaults to `'fast'` (no-op floor) for an unknown/absent unit,
   * so an un-escalated request derives its tier normally.
   */
  floorFor(coherenceUnit?: string): CapabilityTier {
    if (coherenceUnit === undefined) return 'fast';
    return this.units.get(coherenceUnit)?.floorTier ?? 'fast';
  }

  /** D10 mechanism flag: has this unit ever climbed a tier? (Phase 6 reads this for Tier-A disqualification.) */
  isEscalated(coherenceUnit?: string): boolean {
    if (coherenceUnit === undefined) return false;
    return this.units.get(coherenceUnit)?.escalated ?? false;
  }

  /**
   * SC16: a QUALITY failure at `tier` increments this unit's counter; on the
   * Nth (threshold) consecutive failure the floor climbs one step (fast→standard
   * →strong), the count resets, and `escalated` latches true. `strong` is the
   * ceiling: a threshold-crossing failure already at `strong` returns
   * 'exhausted' (router emits routing:escalation-exhausted). `ok` clears the
   * in-progress count but leaves the raised floor (monotonic per D10).
   *
   * `_tier` (the tier the outcome occurred at) is part of the D10 contract —
   * mirrors `LocalModelResolver.recordFailure(model)` positional shape — but the
   * climb is driven off the unit's own `floorTier`, so the argument is currently
   * advisory. Kept in the signature so the call-site contract is stable when a
   * future refinement guards against out-of-order (stale-tier) reports.
   */
  recordOutcome(
    coherenceUnit: string,
    _tier: CapabilityTier,
    ok: boolean
  ): 'ok' | 'escalated' | 'exhausted' {
    const state = this.units.get(coherenceUnit) ?? {
      floorTier: 'fast' as CapabilityTier,
      failures: 0,
      escalated: false,
    };
    if (ok) {
      state.failures = 0;
      this.units.set(coherenceUnit, state);
      return 'ok';
    }
    state.failures += 1;
    if (state.failures < this.threshold) {
      this.units.set(coherenceUnit, state);
      return 'ok';
    }
    // threshold crossed
    state.failures = 0;
    const currentRank = TIER_RANK[state.floorTier];
    if (currentRank >= TIER_RANK.strong) {
      state.floorTier = 'strong';
      state.escalated = true;
      this.units.set(coherenceUnit, state);
      return 'exhausted';
    }
    state.floorTier = RANK_TIER[currentRank + 1]!;
    state.escalated = true;
    this.units.set(coherenceUnit, state);
    return 'escalated';
  }
}
