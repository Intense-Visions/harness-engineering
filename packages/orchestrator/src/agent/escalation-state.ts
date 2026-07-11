import type { CapabilityTier } from '@harness-engineering/types';

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
}
