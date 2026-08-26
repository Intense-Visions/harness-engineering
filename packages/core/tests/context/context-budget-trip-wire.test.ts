import { describe, it, expect } from 'vitest';
import {
  evaluateContextBudget,
  resolveContextBudgetThresholds,
  EFFECTIVE_WINDOW_RATIO,
} from '../../src/context/context-budget-trip-wire';

describe('resolveContextBudgetThresholds', () => {
  it('resolves the 1m band with absolute anchors for a >= 900_000 window', () => {
    expect(resolveContextBudgetThresholds(1_000_000)).toEqual({
      window: 1_000_000,
      warnAt: 250_000,
      tripAt: 350_000,
      band: '1m',
    });
  });

  it('resolves the 200k band with absolute anchors for a >= 150_000 window', () => {
    expect(resolveContextBudgetThresholds(200_000)).toEqual({
      window: 200_000,
      warnAt: 80_000,
      tripAt: 100_000,
      band: '200k',
    });
  });

  it('resolves the local band with ratio-derived anchors below 150_000', () => {
    // 128K local: round(0.30 * 128_000)=38_400, round(0.375 * 128_000)=48_000.
    expect(resolveContextBudgetThresholds(128_000)).toEqual({
      window: 128_000,
      warnAt: 38_400,
      tripAt: 48_000,
      band: 'local',
    });
  });

  it('keys bands off the class boundaries (>= is inclusive)', () => {
    expect(resolveContextBudgetThresholds(900_000).band).toBe('1m');
    expect(resolveContextBudgetThresholds(899_999).band).toBe('200k');
    expect(resolveContextBudgetThresholds(150_000).band).toBe('200k');
    expect(resolveContextBudgetThresholds(149_999).band).toBe('local');
  });

  it('lets overrides pin explicit anchors without changing the band', () => {
    const t = resolveContextBudgetThresholds(200_000, { warnAt: 60_000, tripAt: 90_000 });
    expect(t).toEqual({ window: 200_000, warnAt: 60_000, tripAt: 90_000, band: '200k' });
  });

  it('clamps an override tripAt below warnAt up to warnAt', () => {
    const t = resolveContextBudgetThresholds(200_000, { tripAt: 10_000 });
    expect(t.warnAt).toBe(80_000);
    expect(t.tripAt).toBe(80_000);
  });

  it('clamps the default tripAt up when an override warnAt exceeds it', () => {
    // warnAt raised above the default tripAt (100_000) with no tripAt override
    // collapses the warn band rather than inverting the anchors.
    const t = resolveContextBudgetThresholds(200_000, { warnAt: 120_000 });
    expect(t.warnAt).toBe(120_000);
    expect(t.tripAt).toBe(120_000);
  });
});

describe('evaluateContextBudget', () => {
  it('returns ok below warnAt', () => {
    expect(evaluateContextBudget(79_999, 200_000).verdict).toBe('ok');
  });

  it('returns warn in [warnAt, tripAt)', () => {
    expect(evaluateContextBudget(80_000, 200_000).verdict).toBe('warn');
    expect(evaluateContextBudget(99_999, 200_000).verdict).toBe('warn');
  });

  it('returns trip at/above tripAt (ties trip)', () => {
    expect(evaluateContextBudget(100_000, 200_000).verdict).toBe('trip');
    expect(evaluateContextBudget(120_000, 200_000).verdict).toBe('trip');
  });

  it('classifies each band at its own warn boundary', () => {
    expect(evaluateContextBudget(250_000, 1_000_000).verdict).toBe('warn');
    expect(evaluateContextBudget(350_000, 1_000_000).verdict).toBe('trip');
    expect(evaluateContextBudget(38_400, 128_000).verdict).toBe('warn');
    expect(evaluateContextBudget(48_000, 128_000).verdict).toBe('trip');
  });

  it('exposes derived display-only utilization and effectiveUtilization', () => {
    const e = evaluateContextBudget(120_000, 200_000);
    expect(e.utilization).toBeCloseTo(0.6, 10);
    expect(e.effectiveUtilization).toBeCloseTo(120_000 / (200_000 * EFFECTIVE_WINDOW_RATIO), 10);
    expect(EFFECTIVE_WINDOW_RATIO).toBe(0.6);
  });

  it('carries the resolved thresholds and usedTokens onto the evaluation', () => {
    const e = evaluateContextBudget(90_000, 200_000);
    expect(e).toMatchObject({
      window: 200_000,
      warnAt: 80_000,
      tripAt: 100_000,
      band: '200k',
      usedTokens: 90_000,
      verdict: 'warn',
    });
  });
});
