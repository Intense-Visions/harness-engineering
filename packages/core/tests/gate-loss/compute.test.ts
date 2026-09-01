import { describe, it, expect } from 'vitest';
import { computeGateLoss, computeGateLosses, MAX_PROXIMITY } from '../../src/gate-loss';
import type { GateMeasurement } from '@harness-engineering/types';

describe('computeGateLoss — upper bound (target is a ceiling)', () => {
  it('is low and flat when comfortably passing, rising toward the limit', () => {
    const half = computeGateLoss({
      gate: 'perf.complexity',
      measured: 5,
      target: 10,
      bound: 'upper',
    });
    const near = computeGateLoss({
      gate: 'perf.complexity',
      measured: 9,
      target: 10,
      bound: 'upper',
    });
    expect(half.margin).toBe(5);
    expect(half.proximity).toBeCloseTo(0.5);
    expect(half.loss).toBeCloseTo(0.25);
    expect(near.loss).toBeCloseTo(0.81);
    // "Passed barely" carries strictly more loss than "passed comfortably".
    expect(near.loss).toBeGreaterThan(half.loss);
  });

  it('has loss exactly 1 at the threshold (the knife-edge the verdict sees)', () => {
    const at = computeGateLoss({ gate: 'g', measured: 10, target: 10, bound: 'upper' });
    expect(at.margin).toBe(0);
    expect(at.proximity).toBeCloseTo(1);
    expect(at.loss).toBeCloseTo(1);
  });

  it('exceeds 1 and reports negative margin when breaching', () => {
    const over = computeGateLoss({ gate: 'g', measured: 12, target: 10, bound: 'upper' });
    expect(over.margin).toBe(-2);
    expect(over.loss).toBeGreaterThan(1);
  });
});

describe('computeGateLoss — lower bound (target is a floor)', () => {
  it('is low when well above the floor, ~1 at the floor', () => {
    const high = computeGateLoss({
      gate: 'traceability.coverage',
      measured: 100,
      target: 80,
      bound: 'lower',
      unit: '%',
    });
    const at = computeGateLoss({
      gate: 'traceability.coverage',
      measured: 80,
      target: 80,
      bound: 'lower',
      unit: '%',
    });
    expect(high.margin).toBe(20);
    expect(high.proximity).toBeCloseTo(0.8);
    expect(high.loss).toBeCloseTo(0.64);
    expect(at.proximity).toBeCloseTo(1);
    expect(at.loss).toBeCloseTo(1);
    expect(at.loss).toBeGreaterThan(high.loss);
  });

  it('exceeds 1 with negative margin when below the floor', () => {
    const below = computeGateLoss({ gate: 'g', measured: 60, target: 80, bound: 'lower' });
    expect(below.margin).toBe(-20);
    expect(below.loss).toBeGreaterThan(1);
  });
});

describe('computeGateLoss — robustness (never NaN/Infinity)', () => {
  it('clamps and flags degraded on an upper bound with target 0', () => {
    const r = computeGateLoss({ gate: 'g', measured: 5, target: 0, bound: 'upper' });
    expect(r.degraded).toBe(true);
    expect(r.proximity).toBe(MAX_PROXIMITY);
    expect(Number.isFinite(r.loss)).toBe(true);
  });

  it('treats 0/0 (both zero) as an exact match with zero loss', () => {
    const r = computeGateLoss({ gate: 'g', measured: 0, target: 0, bound: 'upper' });
    expect(r.degraded).toBe(true);
    expect(r.loss).toBe(0);
  });

  it('clamps and flags degraded on a lower bound with measured 0', () => {
    const r = computeGateLoss({ gate: 'g', measured: 0, target: 80, bound: 'lower' });
    expect(r.degraded).toBe(true);
    expect(r.proximity).toBe(MAX_PROXIMITY);
    expect(Number.isFinite(r.loss)).toBe(true);
  });

  it('handles non-finite input without propagating NaN — including margin', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = computeGateLoss({ gate: 'g', measured: bad, target: 10, bound: 'upper' });
      expect(r.degraded).toBe(true);
      // NO emitted field may be non-finite (it renders straight into the report).
      expect(Number.isFinite(r.loss)).toBe(true);
      expect(Number.isFinite(r.proximity)).toBe(true);
      expect(Number.isFinite(r.margin)).toBe(true);
      expect(r.margin).toBe(0);
    }
  });
});

describe('computeGateLosses', () => {
  it('maps a batch preserving order', () => {
    const ms: GateMeasurement[] = [
      { gate: 'a', measured: 5, target: 10, bound: 'upper' },
      { gate: 'b', measured: 90, target: 80, bound: 'lower' },
    ];
    const out = computeGateLosses(ms);
    expect(out.map((l) => l.gate)).toEqual(['a', 'b']);
  });
});
