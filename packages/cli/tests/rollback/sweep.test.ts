import { describe, it, expect, vi } from 'vitest';
import type { SignalPoint } from '@harness-engineering/signals';
import type { RollbackDecision } from '@harness-engineering/core';
import {
  parseWindow,
  detectCrossing,
  windowStart,
  pointsInWindow,
  runRollbackSweep,
  type SweepSignalRule,
} from '../../src/rollback/sweep';

describe('parseWindow', () => {
  it('parses hours', () => {
    expect(parseWindow('24h')).toBe(86_400_000);
  });
  it('parses days', () => {
    expect(parseWindow('7d')).toBe(604_800_000);
  });
  it('parses weeks', () => {
    expect(parseWindow('2w')).toBe(1_209_600_000);
  });
  it('throws on an invalid window', () => {
    expect(() => parseWindow('bad')).toThrow(/invalid window/);
    expect(() => parseWindow('7')).toThrow(/invalid window/);
    expect(() => parseWindow('7x')).toThrow(/invalid window/);
  });
});

describe('detectCrossing', () => {
  const pt = (date: string, value: number): SignalPoint => ({ date, value });

  it('above: prior below, latest >= threshold → true', () => {
    const points = [pt('2026-07-01', 4), pt('2026-07-02', 6)];
    expect(detectCrossing(points, { threshold: 5, direction: 'above', window: '7d' })).toBe(true);
  });

  it('above plateau: all points >= threshold (no edge) → false', () => {
    const points = [pt('2026-07-01', 6), pt('2026-07-02', 7)];
    expect(detectCrossing(points, { threshold: 5, direction: 'above', window: '7d' })).toBe(false);
  });

  it('above: latest exactly at threshold from below → true', () => {
    const points = [pt('2026-07-01', 4), pt('2026-07-02', 5)];
    expect(detectCrossing(points, { threshold: 5, direction: 'above', window: '7d' })).toBe(true);
  });

  it('below: prior above, latest <= threshold → true', () => {
    const points = [pt('2026-07-01', 6), pt('2026-07-02', 4)];
    expect(detectCrossing(points, { threshold: 5, direction: 'below', window: '7d' })).toBe(true);
  });

  it('below plateau: all points <= threshold (no edge) → false', () => {
    const points = [pt('2026-07-01', 4), pt('2026-07-02', 3)];
    expect(detectCrossing(points, { threshold: 5, direction: 'below', window: '7d' })).toBe(false);
  });

  it('empty points → false', () => {
    expect(detectCrossing([], { threshold: 5, direction: 'above', window: '7d' })).toBe(false);
  });

  it('single point (no prior) → false', () => {
    const points = [pt('2026-07-02', 6)];
    expect(detectCrossing(points, { threshold: 5, direction: 'above', window: '7d' })).toBe(false);
  });
});

describe('windowStart', () => {
  it('returns the ISO date `now - window`', () => {
    const now = new Date('2026-07-09T00:00:00Z');
    expect(windowStart(now, '7d')).toBe('2026-07-02T00:00:00.000Z');
  });
});

describe('pointsInWindow', () => {
  const pt = (date: string, value: number): SignalPoint => ({ date, value });
  const now = new Date('2026-07-09T00:00:00Z');

  it('keeps points within [now - window, now] and drops older ones', () => {
    const points = [
      pt('2026-07-01', 1), // 8 days old → excluded
      pt('2026-07-06', 2), // 3 days old → kept
      pt('2026-07-09', 3), // today → kept
    ];
    const kept = pointsInWindow(points, now, '7d');
    expect(kept.map((p) => p.date)).toEqual(['2026-07-06', '2026-07-09']);
  });

  it('excludes a point exactly one day before the window start', () => {
    const points = [pt('2026-07-01', 1), pt('2026-07-02', 2)];
    const kept = pointsInWindow(points, now, '7d');
    expect(kept.map((p) => p.date)).toEqual(['2026-07-02']);
  });
});

describe('runRollbackSweep', () => {
  const pt = (date: string, value: number): SignalPoint => ({ date, value });
  const now = new Date('2026-07-09T00:00:00Z');
  const stubDecision = (pr: number): RollbackDecision => ({
    targetPr: pr,
    trigger: 'signal',
    revertReady: true,
    reasons: [],
    cleanRevert: true,
    dependentMerges: [],
    migrationWarnings: [],
    action: 'proposed',
  });

  const signals: Record<string, SweepSignalRule> = {
    errorRate: { threshold: 5, direction: 'above', window: '7d' },
  };

  it('AC1: a crossing forwards each merged PR to evaluate once', async () => {
    const evaluate = vi.fn(async (pr: number) => stubDecision(pr));
    await runRollbackSweep(signals, {
      readTimeline: () => [pt('2026-07-07', 4), pt('2026-07-08', 6)], // crossing
      resolveMergedPrs: async () => [201, 202],
      evaluate,
      now: () => now,
    });
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(evaluate).toHaveBeenCalledWith(201);
    expect(evaluate).toHaveBeenCalledWith(202);
  });

  it('AC7: a non-crossing (plateau) timeline fires zero evaluate calls', async () => {
    const evaluate = vi.fn(async (pr: number) => stubDecision(pr));
    await runRollbackSweep(signals, {
      readTimeline: () => [pt('2026-07-07', 6), pt('2026-07-08', 7)], // all above → plateau
      resolveMergedPrs: async () => [201, 202],
      evaluate,
      now: () => now,
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('AC7: a signal absent from the timeline fires zero calls and does not throw', async () => {
    const evaluate = vi.fn(async (pr: number) => stubDecision(pr));
    await expect(
      runRollbackSweep(signals, {
        readTimeline: () => [], // absent → empty
        resolveMergedPrs: async () => [201],
        evaluate,
        now: () => now,
      })
    ).resolves.toBeUndefined();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('AC8: does not dedupe PRs itself — forwards duplicates (idempotency is the composer job)', async () => {
    const evaluate = vi.fn(async (pr: number) => stubDecision(pr));
    await runRollbackSweep(signals, {
      readTimeline: () => [pt('2026-07-07', 4), pt('2026-07-08', 6)], // crossing
      resolveMergedPrs: async () => [201, 201],
      evaluate,
      now: () => now,
    });
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it('AC4: resolves merged PRs against the computed window range', async () => {
    const resolveMergedPrs = vi.fn(async () => [201]);
    const evaluate = vi.fn(async (pr: number) => stubDecision(pr));
    await runRollbackSweep(signals, {
      readTimeline: () => [pt('2026-07-07', 4), pt('2026-07-08', 6)], // crossing
      resolveMergedPrs,
      evaluate,
      now: () => now,
    });
    expect(resolveMergedPrs).toHaveBeenCalledWith(
      '2026-07-02T00:00:00.000Z',
      '2026-07-09T00:00:00.000Z'
    );
  });

  it('only considers in-window points for crossing detection', async () => {
    const evaluate = vi.fn(async (pr: number) => stubDecision(pr));
    // The old (out-of-window) point 4 would make this a crossing, but it is
    // excluded; the in-window points are both above → plateau → no fire.
    await runRollbackSweep(signals, {
      readTimeline: () => [pt('2026-06-01', 4), pt('2026-07-07', 6), pt('2026-07-08', 7)],
      resolveMergedPrs: async () => [201],
      evaluate,
      now: () => now,
    });
    expect(evaluate).not.toHaveBeenCalled();
  });
});
