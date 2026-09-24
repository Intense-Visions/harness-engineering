import { describe, expect, it } from 'vitest';

import { sampleBeta } from '../src/bandit/sampling';
import { mulberry32 } from './helpers/prng';

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function draws(alpha: number, beta: number, seed: number, n: number): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => sampleBeta(alpha, beta, rng));
}

describe('sampleBeta (Thompson sampling primitive)', () => {
  it('is deterministic under a seeded rng', () => {
    expect(draws(2, 3, 7, 50)).toEqual(draws(2, 3, 7, 50));
    expect(draws(2, 3, 7, 50)).not.toEqual(draws(2, 3, 8, 50));
  });

  it('stays inside [0, 1] and never produces NaN', () => {
    for (const value of draws(9, 1, 1, 2000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it.each([
    [9, 1],
    [1, 9],
    [5, 5],
    [2, 2],
  ])('Beta(%i,%i) sample mean is within 0.02 of a/(a+b) over 4000 draws', (alpha, beta) => {
    expect(Math.abs(mean(draws(alpha, beta, 42, 4000)) - alpha / (alpha + beta))).toBeLessThan(
      0.02
    );
  });

  it('handles shape parameters below 1 (the Marsaglia-Tsang boost path)', () => {
    const values = draws(0.5, 0.5, 3, 2000);
    for (const value of values) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(mean(values) - 0.5)).toBeLessThan(0.03);
  });
});
