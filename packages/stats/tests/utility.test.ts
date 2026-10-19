import { describe, expect, it } from 'vitest';

import { COST_EPSILON_USD, outcomeOnly, outcomePerDollar } from '../src/bandit/utility';

describe('default utilities (spec "Utilities", D8)', () => {
  it('outcomeOnly returns the outcome and ignores cost', () => {
    expect(outcomeOnly({ outcome: 0.75 })).toBe(0.75);
    expect(outcomeOnly({ outcome: 1, costUsd: 99 })).toBe(1);
  });

  it('outcomePerDollar divides by cost', () => {
    expect(outcomePerDollar({ outcome: 1, costUsd: 4 })).toBe(0.25);
    expect(outcomePerDollar({ outcome: 0.5, costUsd: 0.5 })).toBe(1);
  });

  it('outcomePerDollar is epsilon-guarded for zero and missing cost', () => {
    expect(COST_EPSILON_USD).toBe(0.001);
    expect(outcomePerDollar({ outcome: 1, costUsd: 0 })).toBe(1 / COST_EPSILON_USD);
    expect(outcomePerDollar({ outcome: 1 })).toBe(1 / COST_EPSILON_USD);
    expect(outcomePerDollar({ outcome: 0, costUsd: 0 })).toBe(0);
    expect(Number.isFinite(outcomePerDollar({ outcome: 1, costUsd: 0 }))).toBe(true);
  });

  it('outcomePerDollar never divides by less than epsilon', () => {
    expect(outcomePerDollar({ outcome: 1, costUsd: 0.0001 })).toBe(1 / COST_EPSILON_USD);
  });
});
