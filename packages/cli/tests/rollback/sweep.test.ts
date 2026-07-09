import { describe, it, expect } from 'vitest';
import type { SignalPoint } from '@harness-engineering/signals';
import { parseWindow, detectCrossing } from '../../src/rollback/sweep';

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
