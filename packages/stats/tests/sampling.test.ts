import { describe, expect, it, vi } from 'vitest';

import { sampleBeta } from '../src/bandit/sampling';
import { mulberry32 } from './helpers/prng';

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function variance(values: number[]): number {
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

function betaVariance(alpha: number, beta: number): number {
  return (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
}

function draws(alpha: number, beta: number, seed: number, n: number): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => sampleBeta(alpha, beta, rng));
}

/** An rng that replays `head` then repeats `tail` forever. */
function scripted(head: number[], tail: number): () => number {
  let i = 0;
  return () => {
    const v = head[i];
    i += 1;
    return v ?? tail;
  };
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

  it.each([
    [9, 1],
    [5, 5],
    [2, 3],
    [0.5, 0.5],
  ])(
    'Beta(%d,%d) sample variance is within a tenth of ab/((a+b)^2(a+b+1)) over 4000 draws',
    (alpha, beta) => {
      const expected = betaVariance(alpha, beta);
      expect(Math.abs(variance(draws(alpha, beta, 42, 4000)) - expected) / expected).toBeLessThan(
        0.1
      );
    }
  );

  it('a uniform draw of exactly 0 at the squeeze step is not an unconditional accept', () => {
    // Box-Muller (1 - 0.99, 0) yields x = 3.03; for shape 1 that candidate fails the fast
    // squeeze and must then fail the log test too, so the sampler rejects it and draws again.
    // With u = rng() = 0 the old code took log(0) = -Infinity as an accept.
    const rng = vi.fn(scripted([0.99, 0, 0], 0.5));
    const value = sampleBeta(1, 1, rng);
    expect(value).toBeCloseTo(0.5, 12); // both Gamma draws come from the 0.5 tail: X === Y
    expect(rng).toHaveBeenCalledTimes(9); // 3 rejected + 3 accepted for X, 3 accepted for Y
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
