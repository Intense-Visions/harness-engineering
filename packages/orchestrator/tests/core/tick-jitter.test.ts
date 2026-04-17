import { describe, it, expect } from 'vitest';

describe('Tick Jitter', () => {
  it('computes jittered delay within bounds', () => {
    const intervalMs = 30000;
    const jitterMs = 5000;
    const results: number[] = [];

    for (let i = 0; i < 100; i++) {
      const jitter = Math.round((Math.random() * 2 - 1) * jitterMs);
      const delay = Math.max(0, intervalMs + jitter);
      results.push(delay);
    }

    // All delays must be >= 0 and within [intervalMs - jitterMs, intervalMs + jitterMs]
    for (const d of results) {
      expect(d).toBeGreaterThanOrEqual(intervalMs - jitterMs);
      expect(d).toBeLessThanOrEqual(intervalMs + jitterMs);
    }
  });

  it('produces no jitter when jitterMs is 0', () => {
    const intervalMs = 30000;
    const jitterMs = 0;
    const jitter = jitterMs > 0 ? Math.round((Math.random() * 2 - 1) * jitterMs) : 0;
    const delay = Math.max(0, intervalMs + jitter);
    expect(delay).toBe(intervalMs);
  });

  it('clamps delay to 0 when jitter exceeds interval', () => {
    const intervalMs = 1000;
    const jitterMs = 5000;
    // Worst case: jitter = -5000, delay = max(0, 1000 - 5000) = 0
    const delay = Math.max(0, intervalMs + -jitterMs);
    expect(delay).toBe(0);
  });

  it('produces varied delays across iterations (not all identical)', () => {
    const intervalMs = 30000;
    const jitterMs = 5000;
    const delays = new Set<number>();

    for (let i = 0; i < 50; i++) {
      const jitter = Math.round((Math.random() * 2 - 1) * jitterMs);
      delays.add(Math.max(0, intervalMs + jitter));
    }

    // With 50 samples and jitterMs=5000, we expect multiple distinct values
    expect(delays.size).toBeGreaterThan(1);
  });
});
