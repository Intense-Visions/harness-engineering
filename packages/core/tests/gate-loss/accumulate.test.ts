import { describe, it, expect } from 'vitest';
import { accumulateLoss, computeGateLosses, detectLossAlarm } from '../../src/gate-loss';
import type { GateMeasurement } from '@harness-engineering/types';

describe('accumulateLoss', () => {
  it('sums total and mean and buckets per gate', () => {
    const losses = computeGateLosses([
      { gate: 'traceability.coverage:auth', measured: 100, target: 80, bound: 'lower' },
      { gate: 'traceability.coverage:auth', measured: 90, target: 80, bound: 'lower' },
      { gate: 'perf.complexity', measured: 5, target: 10, bound: 'upper' },
    ]);
    const acc = accumulateLoss(losses);
    expect(acc.count).toBe(3);
    expect(acc.perGate['traceability.coverage:auth']?.count).toBe(2);
    expect(acc.perGate['perf.complexity']?.count).toBe(1);
    expect(acc.totalLoss).toBeCloseTo(losses.reduce((s, l) => s + l.loss, 0));
    expect(acc.meanLoss).toBeCloseTo(acc.totalLoss / 3);
  });

  it('is empty-safe', () => {
    const acc = accumulateLoss([]);
    expect(acc).toEqual({ totalLoss: 0, count: 0, meanLoss: 0, perGate: {}, degradedCount: 0 });
  });

  it('excludes degraded datapoints from the aggregate so they cannot drown the trend', () => {
    const losses = computeGateLosses([
      { gate: 'g', measured: 5, target: 10, bound: 'upper' }, // loss 0.25, valid
      { gate: 'g', measured: 5, target: 0, bound: 'upper' }, // degraded (clamped 1e6)
    ]);
    const acc = accumulateLoss(losses);
    expect(acc.count).toBe(1);
    expect(acc.degradedCount).toBe(1);
    expect(acc.totalLoss).toBeCloseTo(0.25);
    expect(acc.meanLoss).toBeCloseTo(0.25);
  });
});

describe('detectLossAlarm — the leading indicator', () => {
  it('FIRES when loss rises past the threshold while all verdicts are green', () => {
    const alarm = detectLossAlarm({ previous: 1.0, current: 1.4, allVerdictsGreen: true });
    expect(alarm.firing).toBe(true);
    expect(alarm.riseFraction).toBeCloseTo(0.4);
    expect(alarm.reason).toMatch(/drifting toward limits/);
  });

  it('does NOT fire when a binary verdict already failed', () => {
    const alarm = detectLossAlarm({ previous: 1.0, current: 2.0, allVerdictsGreen: false });
    expect(alarm.firing).toBe(false);
    expect(alarm.reason).toMatch(/already failed/);
  });

  it('does NOT fire when loss is stable or falling', () => {
    expect(detectLossAlarm({ previous: 1.0, current: 1.05, allVerdictsGreen: true }).firing).toBe(
      false
    );
    expect(detectLossAlarm({ previous: 1.0, current: 0.5, allVerdictsGreen: true }).firing).toBe(
      false
    );
  });

  it('honors a custom rise threshold', () => {
    expect(
      detectLossAlarm({ previous: 1, current: 1.1, allVerdictsGreen: true, riseThreshold: 0.05 })
        .firing
    ).toBe(true);
    expect(
      detectLossAlarm({ previous: 1, current: 1.1, allVerdictsGreen: true, riseThreshold: 0.5 })
        .firing
    ).toBe(false);
  });
});

describe('acceptance: a fixture drifting toward its limit', () => {
  // A single feature's traceability coverage drifting from comfortable to the
  // knife-edge — every reading is still ABOVE the floor (verdict green) yet
  // accumulated loss rises and the alarm fires BEFORE the first failure (#1673).
  const floor = 80;
  const readingAt = (pct: number): GateMeasurement => ({
    gate: 'traceability.coverage:auth',
    measured: pct,
    target: floor,
    bound: 'lower',
    unit: '%',
  });

  it('shows rising accumulated loss under all-green verdicts and alarms before failure', () => {
    const monthA = accumulateLoss(computeGateLosses([readingAt(100), readingAt(98)]));
    const monthB = accumulateLoss(computeGateLosses([readingAt(85), readingAt(82)]));

    // Every reading passed the binary gate (all >= 80).
    const allGreen = [100, 98, 85, 82].every((p) => p >= floor);
    expect(allGreen).toBe(true);

    // Yet the continuous loss rose materially.
    expect(monthB.meanLoss).toBeGreaterThan(monthA.meanLoss);

    const alarm = detectLossAlarm({
      previous: monthA.meanLoss,
      current: monthB.meanLoss,
      allVerdictsGreen: allGreen,
    });
    expect(alarm.firing).toBe(true);
  });
});
