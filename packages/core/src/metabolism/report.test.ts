import { describe, it, expect } from 'vitest';
import { buildMetabolismReport } from './report';
import type { SpendEvent } from './classify';

describe('buildMetabolismReport', () => {
  it('returns a fully-zeroed report for an empty ledger and never throws', () => {
    const report = buildMetabolismReport([]);
    expect(report.totalTokens).toBe(0);
    expect(report.basalTokens).toBe(0);
    expect(report.anabolicTokens).toBe(0);
    expect(report.unattributableTokens).toBe(0);
    expect(report.denominatorTokens).toBe(0);
    expect(report.basalShare).toBeNull(); // 0/0 is not fabricated as 0
    expect(report.unattributableShare).toBe(0);
    expect(report.eventCount).toBe(0);
    expect(report.byWorkflowClass).toEqual([]);
    expect(report.rankedWaste).toEqual([]);
  });

  it('declares basal share, its denominator, and the unattributable bucket in every report', () => {
    const events: SpendEvent[] = [
      { workflowClass: 'harness-autopilot', tokens: 300, outcome: 'completed' }, // anabolic
      { workflowClass: 'graph-refresh', tokens: 100, outcome: 'completed' }, // basal (maintenance)
      { workflowClass: 'harness-verify', tokens: 50 }, // unattributable (no signal)
    ];
    const report = buildMetabolismReport(events);

    expect(report.totalTokens).toBe(450);
    expect(report.anabolicTokens).toBe(300);
    expect(report.basalTokens).toBe(100);
    expect(report.unattributableTokens).toBe(50);
    // Denominator excludes the unattributable bucket.
    expect(report.denominatorTokens).toBe(400);
    expect(report.basalShare).toBeCloseTo(100 / 400, 10);
    expect(report.unattributableShare).toBeCloseTo(50 / 450, 10);
  });

  it('ranks a seeded wasteful maintenance loop first', () => {
    const events: SpendEvent[] = [
      // Big wasteful loop — should rank first.
      {
        workflowClass: 'ci-rerun',
        tokens: 5000,
        outcome: 'completed',
        maintenanceLoop: 'ci-rerun',
      },
      // Smaller basal loops.
      {
        workflowClass: 'graph-refresh',
        tokens: 800,
        outcome: 'completed',
        maintenanceLoop: 'graph-refresh',
      },
      {
        workflowClass: 'idle-poll',
        tokens: 200,
        outcome: 'completed',
        maintenanceLoop: 'idle-poll',
      },
      // Anabolic work — must not appear in ranked waste.
      { workflowClass: 'harness-autopilot', tokens: 9000, outcome: 'completed' },
    ];
    const report = buildMetabolismReport(events);

    expect(report.rankedWaste[0]?.loop).toBe('ci-rerun');
    expect(report.rankedWaste[0]?.basalTokens).toBe(5000);
    expect(report.rankedWaste.map((r) => r.loop)).toEqual([
      'ci-rerun',
      'graph-refresh',
      'idle-poll',
    ]);
    // No anabolic workflow leaks into the waste list.
    expect(report.rankedWaste.some((r) => r.loop === 'harness-autopilot')).toBe(false);
    // shareOfBasal sums to 1 across the ranked list.
    const totalShare = report.rankedWaste.reduce((s, r) => s + r.shareOfBasal, 0);
    expect(totalShare).toBeCloseTo(1, 10);
  });

  it('falls back to workflowClass as the loop id when no maintenanceLoop label is set', () => {
    const events: SpendEvent[] = [
      { workflowClass: 'reverification', tokens: 400, outcome: 'failed' },
    ];
    const report = buildMetabolismReport(events);
    expect(report.rankedWaste[0]?.loop).toBe('reverification');
  });

  it('builds a per-workflow-class breakdown sorted by total tokens descending', () => {
    const events: SpendEvent[] = [
      { workflowClass: 'small', tokens: 10, outcome: 'completed' },
      { workflowClass: 'big', tokens: 100, outcome: 'failed' },
      { workflowClass: 'big', tokens: 100, outcome: 'completed' },
    ];
    const report = buildMetabolismReport(events);
    expect(report.byWorkflowClass[0]?.workflowClass).toBe('big');
    expect(report.byWorkflowClass[0]?.totalTokens).toBe(200);
    expect(report.byWorkflowClass[0]?.basalShare).toBeCloseTo(0.5, 10);
    // A fully-anabolic class reports basalShare 0, not null.
    expect(report.byWorkflowClass[1]?.basalShare).toBe(0);
  });

  it('ignores non-finite/negative token magnitudes', () => {
    const events: SpendEvent[] = [
      { workflowClass: 'a', tokens: Number.NaN, outcome: 'completed' },
      { workflowClass: 'b', tokens: -50, outcome: 'failed' },
      { workflowClass: 'c', tokens: 100, outcome: 'completed' },
    ];
    const report = buildMetabolismReport(events);
    expect(report.totalTokens).toBe(100);
    expect(report.rankedWaste).toEqual([]); // negative basal token dropped
  });
});
