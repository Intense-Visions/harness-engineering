import { describe, it, expect } from 'vitest';
import { phaseColor, formatElapsed } from '../../../src/client/utils/phase-presentation';

describe('phaseColor', () => {
  it('returns a non-empty class for a known phase', () => {
    expect(phaseColor('StreamingTurn')).toContain('emerald');
  });

  it('returns the gray default for an unknown phase', () => {
    expect(phaseColor('UnknownXYZ')).toBe('bg-gray-800 text-gray-400');
  });
});

describe('formatElapsed', () => {
  const start = '2026-06-25T00:00:00.000Z';
  const startMs = new Date(start).getTime();

  it('formats seconds under a minute', () => {
    expect(formatElapsed(start, startMs + 5_000)).toBe('5s');
  });

  it('formats minutes and seconds', () => {
    expect(formatElapsed(start, startMs + 123_000)).toBe('2m 3s');
  });

  it('formats hours and minutes', () => {
    expect(formatElapsed(start, startMs + 3_660_000)).toBe('1h 1m');
  });

  it('clamps a future start to 0s', () => {
    expect(formatElapsed(start, startMs - 10_000)).toBe('0s');
  });
});
