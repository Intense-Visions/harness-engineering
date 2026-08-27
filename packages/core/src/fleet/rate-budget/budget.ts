// packages/core/src/fleet/rate-budget/budget.ts
//
// Per-resource fan-out budget (#1532). Fleet concurrency is governed by compute
// slots (`canDispatch`), but slots do not model the external API budgets that a
// fan-out's leaves consume. `RateBudget` adds that missing axis:
//
//   1. Per-resource proactive limiting — a rolling-window request cap per
//      resource key, so a 10-way fan-out on a 10 req/min endpoint paces itself
//      instead of tripping a secondary rate limit.
//   2. Shared backoff — `penalize()` records a cooldown on the SHARED budget, so
//      every leaf holding a handle to this budget backs off together (not
//      per-leaf), which is what actually clears a secondary limit.
//
// The budget is process-wide (a module singleton), governing the in-process
// `Promise.all`/concurrency fan-out. Cross-process (separate leaf processes)
// coordination is a deferred slice — see the proposal's Non-goals.
//
// Pure/injected-IO discipline: `delayFor` is a pure function of state + `now`,
// unit-tested with an injected clock. `acquire` is the thin async wrapper.

import type { ResourceBudgetConfig } from './types';

interface ResourceState {
  config?: ResourceBudgetConfig;
  /** Grant timestamps within the current window (ms). Pruned lazily. */
  recent: number[];
  /** Shared cooldown: no request may go before this timestamp (ms). */
  cooldownUntil: number;
}

/** Options for `acquire`, allowing the clock and sleep to be injected in tests. */
export interface RateBudgetAcquireOptions {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * A shared, per-resource fan-out budget. Construct one and pass it to every
 * leaf/fetcher that should share the budget + backoff, or use the process-wide
 * `sharedRateBudget` singleton.
 */
export class RateBudget {
  private readonly resources = new Map<string, ResourceState>();

  private stateFor(resource: string): ResourceState {
    let s = this.resources.get(resource);
    if (!s) {
      s = { recent: [], cooldownUntil: 0 };
      this.resources.set(resource, s);
    }
    return s;
  }

  /** Set (or replace) the rolling-window budget for a resource. */
  configure(resource: string, config: ResourceBudgetConfig): void {
    this.stateFor(resource).config = { ...config };
  }

  /**
   * Clear all state for one resource (or the whole budget). Drops recorded
   * grants, the shared cooldown, and — for the whole-budget form — configs.
   * Primarily for test isolation of the process-wide `sharedRateBudget`.
   */
  reset(resource?: string): void {
    if (resource === undefined) {
      this.resources.clear();
      return;
    }
    this.resources.delete(resource);
  }

  /**
   * Milliseconds to wait before the next request on `resource` may proceed at
   * `now`. Returns 0 when a request may go immediately. Pure except for pruning
   * the resource's stale timestamps (which never changes the returned value).
   */
  delayFor(resource: string, now: number): number {
    const s = this.resources.get(resource);
    if (!s) return 0;

    // Shared cooldown dominates — a penalized resource waits regardless of window.
    if (s.cooldownUntil > now) return s.cooldownUntil - now;

    const config = s.config;
    if (!config || config.limit <= 0 || config.windowMs <= 0) return 0;

    // Prune timestamps outside the window.
    const cutoff = now - config.windowMs;
    if (s.recent.length > 0) {
      s.recent = s.recent.filter((ts) => ts > cutoff);
    }

    if (s.recent.length < config.limit) return 0;

    // At capacity: wait until the oldest in-window grant ages out.
    const oldest = s.recent.reduce((m, ts) => (ts < m ? ts : m), s.recent[0]!);
    return Math.max(1, config.windowMs - (now - oldest));
  }

  /**
   * Record a shared cooldown for `resource` (e.g. from a Retry-After header).
   * Every subsequent `acquire`/`delayFor` on this resource waits until the
   * cooldown expires. Extends but never shortens an existing cooldown.
   */
  penalize(resource: string, cooldownMs: number, now: number = Date.now()): void {
    if (cooldownMs <= 0) return;
    const s = this.stateFor(resource);
    s.cooldownUntil = Math.max(s.cooldownUntil, now + cooldownMs);
  }

  /**
   * Block until a request slot is free for `resource`, honoring the shared
   * cooldown and the rolling window, then record the grant. Re-checks after each
   * sleep so a cooldown installed by a sibling leaf mid-wait is observed.
   */
  async acquire(resource: string, options: RateBudgetAcquireOptions = {}): Promise<void> {
    const now = options.now ?? Date.now;
    const sleep = options.sleep ?? defaultSleep;
    // Ensure state exists so a grant is always recorded even for an unbudgeted
    // resource (keeps the window populated if it is configured later).
    this.stateFor(resource);
    for (;;) {
      const delay = this.delayFor(resource, now());
      if (delay <= 0) break;
      await sleep(delay);
    }
    this.stateFor(resource).recent.push(now());
  }
}

/**
 * Process-wide default budget. The GitHub HTTP layer (and any other fan-out
 * fetcher) consults this unless an explicit `RateBudget` is injected, so a
 * single `applyResourceBudgets` at startup governs all in-process fan-out.
 */
export const sharedRateBudget = new RateBudget();

/**
 * Copy an adopter's `resourceBudgets` config map onto a budget. Pure aside from
 * mutating the target budget; safe to call repeatedly (idempotent per key).
 */
export function applyResourceBudgets(
  budget: RateBudget,
  budgets?: Record<string, ResourceBudgetConfig>
): void {
  if (!budgets) return;
  for (const [resource, config] of Object.entries(budgets)) {
    budget.configure(resource, config);
  }
}
