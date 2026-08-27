import { describe, it, expect } from 'vitest';
import { RateBudget, applyResourceBudgets, sharedRateBudget } from './budget';

describe('RateBudget.delayFor (SC1: rolling-window limit)', () => {
  it('returns 0 below the limit and a positive delay once the window is full', () => {
    const b = new RateBudget();
    b.configure('github.search', { limit: 3, windowMs: 60_000 });
    const t0 = 1_000_000;

    // Grant 3 requests within the window via acquire's timestamp recording,
    // simulated by penalize-free manual pushes through delayFor+record path.
    // Use acquire with a fixed clock and no-op sleep to record grants.
    return (async () => {
      const now = () => t0;
      const sleep = async () => {};
      await b.acquire('github.search', { now, sleep }); // 1
      await b.acquire('github.search', { now, sleep }); // 2
      expect(b.delayFor('github.search', t0)).toBe(0); // 2 < 3, still room
      await b.acquire('github.search', { now, sleep }); // 3 -> at capacity
      const delay = b.delayFor('github.search', t0);
      expect(delay).toBeGreaterThan(0);
      // Oldest grant was at t0; must wait ~full window.
      expect(delay).toBe(60_000);
      // After the window elapses, the slot frees up.
      expect(b.delayFor('github.search', t0 + 60_001)).toBe(0);
    })();
  });

  it('is unbudgeted (delay 0) for a resource with no config', () => {
    const b = new RateBudget();
    expect(b.delayFor('unknown', 123)).toBe(0);
  });
});

describe('RateBudget.penalize (SC2: shared backoff across leaves)', () => {
  it('makes every reader of the same budget wait for the shared cooldown', () => {
    const shared = new RateBudget();
    const t0 = 5_000_000;
    // Leaf A hits a secondary limit and penalizes the SHARED budget.
    shared.penalize('github.core', 30_000, t0);
    // Leaf B (a different consumer holding the same budget handle) sees it.
    expect(shared.delayFor('github.core', t0)).toBe(30_000);
    expect(shared.delayFor('github.core', t0 + 10_000)).toBe(20_000);
    expect(shared.delayFor('github.core', t0 + 30_001)).toBe(0);
  });

  it('cooldown dominates the rolling window and never shortens', () => {
    const b = new RateBudget();
    b.configure('r', { limit: 100, windowMs: 1_000 });
    const t0 = 1_000;
    b.penalize('r', 10_000, t0);
    b.penalize('r', 2_000, t0); // shorter — must NOT reduce the cooldown
    expect(b.delayFor('r', t0)).toBe(10_000);
  });

  it('acquire waits out an installed cooldown then proceeds', async () => {
    const b = new RateBudget();
    let clock = 0;
    const now = () => clock;
    const sleep = async (ms: number) => {
      clock += ms; // advance virtual time by exactly the requested sleep
    };
    b.penalize('r', 5_000, 0);
    await b.acquire('r', { now, sleep });
    expect(clock).toBeGreaterThanOrEqual(5_000);
  });
});

describe('applyResourceBudgets (config wiring)', () => {
  it('copies an adopter config map onto a budget', () => {
    const b = new RateBudget();
    applyResourceBudgets(b, {
      'github.search': { limit: 10, windowMs: 60_000 },
    });
    const t0 = 0;
    // Fill the window; the 11th at the same instant must wait.
    return (async () => {
      const now = () => t0;
      const sleep = async () => {};
      for (let i = 0; i < 10; i++) await b.acquire('github.search', { now, sleep });
      expect(b.delayFor('github.search', t0)).toBeGreaterThan(0);
    })();
  });

  it('is a no-op for an undefined map', () => {
    expect(() => applyResourceBudgets(new RateBudget(), undefined)).not.toThrow();
  });

  it('exposes a process-wide shared singleton', () => {
    expect(sharedRateBudget).toBeInstanceOf(RateBudget);
  });
});
