import { describe, it, expect } from 'vitest';
import type { SignalPoint } from '../src/types';
import { toDate, round2, deriveEndpointTrend, bucketsToHistory } from '../src/shared';

describe('toDate', () => {
  it('truncates a full ISO timestamp to a YYYY-MM-DD date string', () => {
    expect(toDate('2026-07-20T13:45:30.123Z')).toBe('2026-07-20');
  });

  it('returns an already-date-only string unchanged', () => {
    expect(toDate('2026-07-20')).toBe('2026-07-20');
  });

  it('takes exactly the first 10 characters (no timezone conversion)', () => {
    // Truncation is pure string slicing: a near-midnight UTC time stays on its
    // literal calendar date rather than shifting via Date parsing.
    expect(toDate('2026-01-01T00:00:00.000Z')).toBe('2026-01-01');
    expect(toDate('2026-12-31T23:59:59.999Z')).toBe('2026-12-31');
  });
});

describe('round2', () => {
  it('rounds to two decimal places', () => {
    expect(round2(1.2345)).toBe(1.23);
  });

  it('rounds up at the second decimal', () => {
    expect(round2(1.239)).toBe(1.24);
    expect(round2(2.675)).toBe(2.68);
  });

  it('rounds down when the third decimal is below five', () => {
    expect(round2(1.234)).toBe(1.23);
  });

  it('leaves values with two or fewer decimals unchanged', () => {
    expect(round2(3.5)).toBe(3.5);
    expect(round2(42)).toBe(42);
  });

  it('handles negative numbers', () => {
    expect(round2(-1.239)).toBe(-1.24);
  });

  it('returns 0 for 0', () => {
    expect(round2(0)).toBe(0);
  });
});

function point(date: string, value: number): SignalPoint {
  return { date, value };
}

describe('deriveEndpointTrend', () => {
  it("returns 'flat' for an empty history", () => {
    expect(deriveEndpointTrend([])).toBe('flat');
  });

  it("returns 'flat' for a single point", () => {
    expect(deriveEndpointTrend([point('2026-07-01', 5)])).toBe('flat');
  });

  it("returns 'up' when the latest point exceeds the earliest", () => {
    const history = [point('2026-07-01', 1), point('2026-07-02', 9)];
    expect(deriveEndpointTrend(history)).toBe('up');
  });

  it("returns 'down' when the latest point is below the earliest", () => {
    const history = [point('2026-07-01', 9), point('2026-07-02', 1)];
    expect(deriveEndpointTrend(history)).toBe('down');
  });

  it("returns 'flat' when the endpoints are equal, ignoring intermediate swings", () => {
    const history = [point('2026-07-01', 5), point('2026-07-02', 99), point('2026-07-03', 5)];
    expect(deriveEndpointTrend(history)).toBe('flat');
  });

  it('compares only the first and last points, not adjacent ones', () => {
    // Dips in the middle do not matter: only earliest-vs-latest drives the verdict.
    const history = [point('2026-07-01', 2), point('2026-07-02', 0), point('2026-07-03', 3)];
    expect(deriveEndpointTrend(history)).toBe('up');
  });
});

describe('bucketsToHistory', () => {
  it('maps bucket entries into points using the transform', () => {
    const buckets = new Map<string, number>([['2026-07-01', 3]]);
    const history = bucketsToHistory(buckets, (v) => v);
    expect(history).toEqual([{ date: '2026-07-01', value: 3 }]);
  });

  it('sorts entries chronologically by date regardless of insertion order', () => {
    const buckets = new Map<string, number>([
      ['2026-07-03', 30],
      ['2026-07-01', 10],
      ['2026-07-02', 20],
    ]);
    const history = bucketsToHistory(buckets, (v) => v);
    expect(history.map((p) => p.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(history.map((p) => p.value)).toEqual([10, 20, 30]);
  });

  it('applies a non-identity transform to derive point values', () => {
    // e.g. a rate provider mapping a {passed, total} bucket to a rounded fraction.
    const buckets = new Map<string, { passed: number; total: number }>([
      ['2026-07-01', { passed: 1, total: 3 }],
    ]);
    const history = bucketsToHistory(buckets, (v) => round2(v.passed / v.total));
    expect(history).toEqual([{ date: '2026-07-01', value: 0.33 }]);
  });

  it('returns an empty array for an empty map', () => {
    expect(bucketsToHistory(new Map<string, number>(), (v) => v)).toEqual([]);
  });

  it('does not mutate the source map', () => {
    const buckets = new Map<string, number>([
      ['2026-07-02', 2],
      ['2026-07-01', 1],
    ]);
    bucketsToHistory(buckets, (v) => v);
    expect([...buckets.keys()]).toEqual(['2026-07-02', '2026-07-01']);
  });
});
