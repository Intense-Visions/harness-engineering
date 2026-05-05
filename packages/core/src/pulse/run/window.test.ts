import { describe, it, expect } from 'vitest';
import { computeWindow, parseLookback } from './window';

describe('parseLookback', () => {
  it.each([
    ['24h', 24 * 60 * 60 * 1000],
    ['7d', 7 * 24 * 60 * 60 * 1000],
    ['1h', 60 * 60 * 1000],
    ['48h', 48 * 60 * 60 * 1000],
  ])('parses %s to %d ms', (input, expected) => {
    expect(parseLookback(input)).toBe(expected);
  });

  it.each(['1m', 'abc', '', '24', 'h24'])('rejects %p', (input) => {
    expect(() => parseLookback(input)).toThrow(/lookback/i);
  });
});

describe('computeWindow', () => {
  it('applies 15-minute trailing buffer to upper bound', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    const w = computeWindow(now, '24h', 15);
    expect(w.end).toEqual(new Date('2026-05-05T11:45:00Z'));
    expect(w.start).toEqual(new Date('2026-05-04T11:45:00Z'));
  });

  it('uses default 15-minute buffer when omitted', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    const w = computeWindow(now, '24h');
    expect(w.end).toEqual(new Date('2026-05-05T11:45:00Z'));
  });

  it('supports zero buffer', () => {
    const now = new Date('2026-05-05T12:00:00Z');
    const w = computeWindow(now, '1h', 0);
    expect(w.end).toEqual(now);
    expect(w.start).toEqual(new Date('2026-05-05T11:00:00Z'));
  });
});
