import { describe, it, expect } from 'vitest';
import { decayWeight, temporalSuccessRate } from '../../src/specialization/temporal.js';

describe('decayWeight', () => {
  it('returns 1.0 at age 0 (no decay)', () => {
    expect(decayWeight(0, 30)).toBe(1.0);
  });

  it('returns ~0.5 at exactly one half-life', () => {
    expect(decayWeight(30, 30)).toBeCloseTo(0.5, 5);
  });

  it('returns ~0.25 at two half-lives', () => {
    expect(decayWeight(60, 30)).toBeCloseTo(0.25, 5);
  });

  it('returns ~0.125 at three half-lives', () => {
    expect(decayWeight(90, 30)).toBeCloseTo(0.125, 4);
  });

  it('is always in (0, 1]', () => {
    for (const age of [0, 1, 10, 100, 365, 1000]) {
      const w = decayWeight(age, 30);
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it('treats negative age as 0', () => {
    expect(decayWeight(-5, 30)).toBe(1.0);
  });

  it('works with different half-life values', () => {
    expect(decayWeight(7, 7)).toBeCloseTo(0.5, 5);
    expect(decayWeight(14, 7)).toBeCloseTo(0.25, 5);
    expect(decayWeight(60, 60)).toBeCloseTo(0.5, 5);
  });
});

describe('temporalSuccessRate', () => {
  const now = '2026-04-17T00:00:00Z';

  it('returns 0.5 (neutral prior) for empty outcomes', () => {
    expect(temporalSuccessRate([], { halfLifeDays: 30, referenceTime: now })).toBe(0.5);
  });

  it('returns close to 1.0 for all recent successes', () => {
    const outcomes = Array.from({ length: 10 }, (_, i) => ({
      result: 'success' as const,
      timestamp: new Date(Date.parse(now) - i * 86400000).toISOString(),
    }));
    const rate = temporalSuccessRate(outcomes, { halfLifeDays: 30, referenceTime: now });
    expect(rate).toBeGreaterThan(0.9);
  });

  it('returns close to 0.0 for all recent failures', () => {
    const outcomes = Array.from({ length: 10 }, (_, i) => ({
      result: 'failure' as const,
      timestamp: new Date(Date.parse(now) - i * 86400000).toISOString(),
    }));
    const rate = temporalSuccessRate(outcomes, { halfLifeDays: 30, referenceTime: now });
    expect(rate).toBeLessThan(0.1);
  });

  it('old successes + recent failures yields lower rate than flat average', () => {
    // 5 old successes (60 days ago) + 5 recent failures (today)
    const outcomes = [
      ...Array.from({ length: 5 }, (_, i) => ({
        result: 'success' as const,
        timestamp: new Date(Date.parse(now) - (60 + i) * 86400000).toISOString(),
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        result: 'failure' as const,
        timestamp: new Date(Date.parse(now) - i * 86400000).toISOString(),
      })),
    ];
    const rate = temporalSuccessRate(outcomes, { halfLifeDays: 30, referenceTime: now });
    // Flat average would be 0.5; temporal should be lower because failures are recent
    expect(rate).toBeLessThan(0.5);
  });

  it('recent successes + old failures yields higher rate than flat average', () => {
    // 5 old failures (60 days ago) + 5 recent successes (today)
    const outcomes = [
      ...Array.from({ length: 5 }, (_, i) => ({
        result: 'failure' as const,
        timestamp: new Date(Date.parse(now) - (60 + i) * 86400000).toISOString(),
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        result: 'success' as const,
        timestamp: new Date(Date.parse(now) - i * 86400000).toISOString(),
      })),
    ];
    const rate = temporalSuccessRate(outcomes, { halfLifeDays: 30, referenceTime: now });
    // Flat average would be 0.5; temporal should be higher because successes are recent
    expect(rate).toBeGreaterThan(0.5);
  });

  it('uses current time as reference when referenceTime omitted', () => {
    const outcomes = [{ result: 'success' as const, timestamp: new Date().toISOString() }];
    const rate = temporalSuccessRate(outcomes, { halfLifeDays: 30 });
    expect(rate).toBeGreaterThan(0.5);
  });
});
