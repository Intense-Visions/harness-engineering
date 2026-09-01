import { describe, it, expect } from 'vitest';
import {
  checkRankStability,
  spearmanRankCorrelation,
  assignTiers,
  validateBands,
  type RankingWindow,
  type ScoredItem,
} from './stability';

function window(label: string, scores: Record<string, number>): RankingWindow<ScoredItem> {
  return { label, items: Object.entries(scores).map(([id, score]) => ({ id, score })) };
}

describe('spearmanRankCorrelation', () => {
  it('is 1 for an identical order', () => {
    const a = new Map([
      ['x', 10],
      ['y', 5],
      ['z', 1],
    ]);
    const b = new Map([
      ['x', 100],
      ['y', 50],
      ['z', 10],
    ]);
    expect(spearmanRankCorrelation(a, b).correlation).toBeCloseTo(1, 10);
  });

  it('is -1 for a fully reversed order', () => {
    const a = new Map([
      ['x', 10],
      ['y', 5],
      ['z', 1],
    ]);
    const b = new Map([
      ['x', 1],
      ['y', 5],
      ['z', 10],
    ]);
    expect(spearmanRankCorrelation(a, b).correlation).toBeCloseTo(-1, 10);
  });

  it('only counts items shared by both windows', () => {
    const a = new Map([
      ['x', 3],
      ['y', 2],
      ['only-a', 1],
    ]);
    const b = new Map([
      ['x', 30],
      ['y', 20],
      ['only-b', 10],
    ]);
    const { sampleSize } = spearmanRankCorrelation(a, b);
    expect(sampleSize).toBe(2);
  });

  it('reports 0 (undefined) correlation with fewer than two shared items', () => {
    const a = new Map([['x', 3]]);
    const b = new Map([['x', 3]]);
    expect(spearmanRankCorrelation(a, b)).toEqual({ correlation: 0, sampleSize: 1 });
  });

  it('reports 0 for an all-tied window (no order to reproduce)', () => {
    // Every item has the same score in both windows: there is no reproducible
    // order, so the correlation must not certify the arbitrary insertion order.
    const a = new Map([
      ['x', 5],
      ['y', 5],
      ['z', 5],
    ]);
    const b = new Map([
      ['x', 9],
      ['y', 9],
      ['z', 9],
    ]);
    expect(spearmanRankCorrelation(a, b).correlation).toBe(0);
  });

  it('handles ties via fractional ranks', () => {
    // Two items tie in window a; the tie is broken the same way both windows.
    const a = new Map([
      ['x', 5],
      ['y', 5],
      ['z', 1],
    ]);
    const b = new Map([
      ['x', 5],
      ['y', 5],
      ['z', 1],
    ]);
    expect(spearmanRankCorrelation(a, b).correlation).toBeCloseTo(1, 10);
  });
});

describe('checkRankStability', () => {
  it('keeps a stable ranking ordered', () => {
    const primary = window('window-1', { a: 100, b: 80, c: 60, d: 40, e: 20 });
    const secondary = window('window-2', { a: 98, b: 82, c: 58, d: 44, e: 18 });
    const result = checkRankStability(primary, secondary, { correlationThreshold: 0.7 });

    expect(result.report.stable).toBe(true);
    expect(result.report.presentation).toBe('ordered');
    expect(result.report.correlation).toBeGreaterThanOrEqual(0.7);
    expect(result.ordered?.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.tiers).toBeNull();
  });

  it('degrades an unstable ranking to tiers', () => {
    // Middle band is scrambled between windows: order is not reproducible.
    const primary = window('window-1', { a: 100, b: 70, c: 65, d: 60, e: 55, f: 10 });
    const secondary = window('window-2', { a: 98, b: 55, c: 62, d: 66, e: 58, f: 12 });
    const result = checkRankStability(primary, secondary, {
      correlationThreshold: 0.9,
      tierCount: 3,
    });

    expect(result.report.stable).toBe(false);
    expect(result.report.presentation).toBe('tiered');
    expect(result.ordered).toBeNull();
    expect(result.tiers).not.toBeNull();
    expect(result.tiers!.map((t) => t.tier)).toEqual([1, 2, 3]);
    // Highest-scoring item lands in tier 1.
    expect(result.tiers![0]!.items.some((i) => i.id === 'a')).toBe(true);
  });

  it('always reports the correlation and both window definitions', () => {
    const primary = window('days 0–45', { a: 3, b: 2, c: 1 });
    const secondary = window('days 45–90', { a: 3, b: 2, c: 1 });
    const result = checkRankStability(primary, secondary);
    expect(result.report.windows).toEqual({ primary: 'days 0–45', secondary: 'days 45–90' });
    expect(typeof result.report.correlation).toBe('number');
  });

  it('treats a too-thin window overlap as unstable', () => {
    const primary = window('w1', { a: 3, b: 2, c: 1 });
    const secondary = window('w2', { a: 3 }); // only one shared item
    const result = checkRankStability(primary, secondary);
    expect(result.report.stable).toBe(false);
    expect(result.report.sampleSize).toBe(1);
    expect(result.tiers).not.toBeNull();
  });
});

describe('assignTiers', () => {
  it('splits an ordered list into contiguous rank bands, tier 1 highest', () => {
    const ordered = ['a', 'b', 'c', 'd', 'e', 'f'];
    const tiers = assignTiers(ordered, 3);
    expect(tiers.map((t) => t.items)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ]);
  });

  it('never produces more tiers than items', () => {
    expect(assignTiers(['a', 'b'], 5)).toHaveLength(2);
  });

  it('is empty for an empty list', () => {
    expect(assignTiers([], 4)).toEqual([]);
  });
});

describe('validateBands (bands defined on one window, validated on the other)', () => {
  it('reports full agreement when the secondary preserves tier membership', () => {
    const primary = window('w1', { a: 100, b: 90, c: 20, d: 10 });
    const secondary = window('w2', { a: 95, b: 88, c: 22, d: 9 });
    const tiers = assignTiers(
      [...primary.items].sort((x, y) => y.score - x.score),
      2
    );
    const v = validateBands(tiers, secondary);
    expect(v.sampleSize).toBe(4);
    expect(v.agreement).toBe(1);
  });

  it('scores full agreement when the secondary preserves the shared order but shares only a subset', () => {
    // Primary has 5 items (bands cut over all 5); secondary shares only 3 of
    // them but keeps their relative order. Agreement must be 1 — the two sides
    // re-band the SAME shared population, not different-sized ones.
    const primary = window('w1', { a: 100, b: 90, c: 80, d: 70, e: 60 });
    const secondary = window('w2', { a: 50, b: 40, c: 30 });
    const tiers = assignTiers(
      [...primary.items].sort((x, y) => y.score - x.score),
      2
    );
    const v = validateBands(tiers, secondary);
    expect(v.sampleSize).toBe(3);
    expect(v.agreement).toBe(1);
  });

  it('reports reduced agreement when the secondary reshuffles tiers', () => {
    const primary = window('w1', { a: 100, b: 90, c: 20, d: 10 });
    // c jumps into the top band on the secondary window.
    const secondary = window('w2', { a: 100, c: 95, b: 5, d: 1 });
    const tiers = assignTiers(
      [...primary.items].sort((x, y) => y.score - x.score),
      2
    );
    const v = validateBands(tiers, secondary);
    expect(v.agreement).toBeLessThan(1);
  });
});
