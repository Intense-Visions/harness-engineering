import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from '../../src/utils/concurrency';

describe('mapWithConcurrency', () => {
  it('preserves input order in the results array', async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40]);
  });
  it('never exceeds the concurrency cap', async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency([...Array(10).keys()], 3, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });
  it('runs sequentially when limit is 1', async () => {
    const order: number[] = [];
    await mapWithConcurrency([1, 2, 3], 1, async (n) => {
      order.push(n);
      await new Promise((r) => setTimeout(r, 1));
    });
    expect(order).toEqual([1, 2, 3]);
  });
  it('does not reject the batch when one task throws (caller maps errors)', async () => {
    const out = await mapWithConcurrency([1, 2], 2, async (n) => {
      if (n === 1) throw new Error('boom');
      return n;
    });
    expect(out[1]).toBe(2);
    expect(out[0]).toBeInstanceOf(Error);
  });
});
