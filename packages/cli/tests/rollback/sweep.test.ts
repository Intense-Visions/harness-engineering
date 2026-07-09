import { describe, it, expect, vi } from 'vitest';
import type { SignalPoint } from '@harness-engineering/signals';
import type { RollbackDecision } from '@harness-engineering/core';

const execFileSyncMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: execFileSyncMock,
}));

import {
  parseWindow,
  detectCrossing,
  windowStart,
  pointsInWindow,
  runRollbackSweep,
  createPrResolver,
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

  it('S4: reports a crossing with each forwarded PR action + prUrl', async () => {
    const report = vi.fn();
    const evaluate = vi.fn(async (pr: number) => ({
      ...stubDecision(pr),
      prUrl: `https://gh/pr/${pr}`,
    }));
    await runRollbackSweep(signals, {
      readTimeline: () => [pt('2026-07-07', 4), pt('2026-07-08', 6)], // crossing
      resolveMergedPrs: async () => [201, 202],
      evaluate,
      report,
      now: () => now,
    });
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({
      signal: 'errorRate',
      window: '7d',
      crossed: true,
      forwarded: [
        { pr: 201, action: 'proposed', prUrl: 'https://gh/pr/201' },
        { pr: 202, action: 'proposed', prUrl: 'https://gh/pr/202' },
      ],
    });
  });

  it('S4: reports a non-crossing (no forwarded PRs) so a quiet sweep is still visible', async () => {
    const report = vi.fn();
    const evaluate = vi.fn(async (pr: number) => stubDecision(pr));
    await runRollbackSweep(signals, {
      readTimeline: () => [pt('2026-07-07', 6), pt('2026-07-08', 7)], // plateau → no cross
      resolveMergedPrs: async () => [201],
      evaluate,
      report,
      now: () => now,
    });
    expect(evaluate).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith({
      signal: 'errorRate',
      window: '7d',
      crossed: false,
      forwarded: [],
    });
  });
});

describe('createPrResolver (I1: honors BOTH window bounds, no date-truncation)', () => {
  const startIso = '2026-07-08T10:00:00.000Z';
  const nowIso = '2026-07-09T10:00:00.000Z';

  const searchArgFromLastCall = (): string => {
    const [, args] = execFileSyncMock.mock.calls.at(-1) as [string, string[]];
    const i = args.indexOf('--search');
    return args[i + 1] as string;
  };

  it('builds a bounded merged:<start>..<end> search using BOTH bounds', async () => {
    execFileSyncMock.mockReset();
    execFileSyncMock.mockReturnValue(JSON.stringify([{ number: 201 }, { number: 202 }]));
    const resolve = createPrResolver();
    const prs = await resolve(startIso, nowIso);

    const search = searchArgFromLastCall();
    // Both ends of the [start, now] contract are present.
    expect(search).toContain(startIso);
    expect(search).toContain(nowIso);
    // A single bounded range, not an open-ended lower bound.
    expect(search).toBe(`merged:${startIso}..${nowIso}`);
    expect(prs).toEqual([201, 202]);
  });

  it('uses FULL ISO timestamps, not date-truncated bounds (no ~10h window bleed)', async () => {
    execFileSyncMock.mockReset();
    execFileSyncMock.mockReturnValue('[]');
    const resolve = createPrResolver();
    await resolve(startIso, nowIso);

    const search = searchArgFromLastCall();
    // The time component must survive — a date-only bound (2026-07-08) would
    // capture PRs from 00:00 that fall ~10h BEFORE the real 10:00 window start.
    expect(search).toContain('T10:00:00');
    expect(search).not.toBe('merged:2026-07-08..2026-07-09');
    expect(search).not.toMatch(/merged:>=/); // no open-ended lower bound
  });

  it('excludes a PR merged before the window start: gh gets the lower bound and returns none', async () => {
    execFileSyncMock.mockReset();
    // gh honors the bounded range and returns nothing for an out-of-window PR.
    execFileSyncMock.mockReturnValue('[]');
    const resolve = createPrResolver();
    const prs = await resolve(startIso, nowIso);

    const search = searchArgFromLastCall();
    // The lower bound the sweep passed is exactly the window start (to the
    // second), so a PR merged at 09:59 (before 10:00) is outside the range.
    expect(search).toContain(`merged:${startIso}`);
    expect(prs).toEqual([]);
  });

  it('degrades to [] when gh throws', async () => {
    execFileSyncMock.mockReset();
    execFileSyncMock.mockImplementation(() => {
      throw new Error('gh not found');
    });
    const resolve = createPrResolver();
    await expect(resolve(startIso, nowIso)).resolves.toEqual([]);
  });
});
