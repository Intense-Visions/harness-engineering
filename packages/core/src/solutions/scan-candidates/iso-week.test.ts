import { describe, it, expect } from 'vitest';
import { isoWeek, formatIsoWeek } from './iso-week';

describe('isoWeek', () => {
  it.each([
    ['2026-01-01', { year: 2026, week: 1 }],
    ['2025-12-29', { year: 2026, week: 1 }], // Monday of W1 2026
    ['2024-12-30', { year: 2025, week: 1 }],
    ['2024-01-01', { year: 2024, week: 1 }],
    ['2026-05-05', { year: 2026, week: 19 }],
    ['2020-12-31', { year: 2020, week: 53 }], // 53-week year
  ])('isoWeek(%s) -> %o', (iso, expected) => {
    expect(isoWeek(new Date(iso + 'T12:00:00Z'))).toEqual(expected);
  });
});

describe('formatIsoWeek', () => {
  it('zero-pads week number', () => {
    expect(formatIsoWeek({ year: 2026, week: 1 })).toBe('2026-W01');
    expect(formatIsoWeek({ year: 2026, week: 19 })).toBe('2026-W19');
    expect(formatIsoWeek({ year: 2020, week: 53 })).toBe('2020-W53');
  });
});
