import { describe, it, expect } from 'vitest';
import { cronMatchesNow } from '../../src/maintenance/cron-matcher';

describe('cronMatchesNow', () => {
  // Helper: 2026-04-17 is a Friday (day 5)
  const friday2am = new Date('2026-04-17T02:00:00');
  const friday230 = new Date('2026-04-17T02:30:00');
  const monday6am = new Date('2026-04-20T06:00:00');
  const sunday2am = new Date('2026-04-19T02:00:00');
  const jan1midnight = new Date('2026-01-01T00:00:00');
  const firstOfMonth2am = new Date('2026-04-01T02:00:00');

  it('matches wildcard-only cron (* * * * *)', () => {
    expect(cronMatchesNow('* * * * *', friday2am)).toBe(true);
  });

  it('matches exact minute and hour (0 2 * * *)', () => {
    expect(cronMatchesNow('0 2 * * *', friday2am)).toBe(true);
    expect(cronMatchesNow('0 2 * * *', friday230)).toBe(false);
  });

  it('matches day of week (0 6 * * 1 = Monday)', () => {
    expect(cronMatchesNow('0 6 * * 1', monday6am)).toBe(true);
    expect(cronMatchesNow('0 6 * * 1', friday2am)).toBe(false);
  });

  it('matches Sunday as day 0 (0 2 * * 0)', () => {
    expect(cronMatchesNow('0 2 * * 0', sunday2am)).toBe(true);
    expect(cronMatchesNow('0 2 * * 0', friday2am)).toBe(false);
  });

  it('matches day of month (0 2 1 * *)', () => {
    expect(cronMatchesNow('0 2 1 * *', firstOfMonth2am)).toBe(true);
    expect(cronMatchesNow('0 2 1 * *', friday2am)).toBe(false);
  });

  it('matches month field (0 0 1 1 *)', () => {
    expect(cronMatchesNow('0 0 1 1 *', jan1midnight)).toBe(true);
    expect(cronMatchesNow('0 0 1 1 *', firstOfMonth2am)).toBe(false);
  });

  it('supports step values (*/15 * * * *)', () => {
    const min0 = new Date('2026-04-17T02:00:00');
    const min15 = new Date('2026-04-17T02:15:00');
    const min7 = new Date('2026-04-17T02:07:00');
    expect(cronMatchesNow('*/15 * * * *', min0)).toBe(true);
    expect(cronMatchesNow('*/15 * * * *', min15)).toBe(true);
    expect(cronMatchesNow('*/15 * * * *', min7)).toBe(false);
  });

  it('supports list values (0 1,2,3 * * *)', () => {
    expect(cronMatchesNow('0 1,2,3 * * *', friday2am)).toBe(true);
    expect(cronMatchesNow('0 1,2,3 * * *', monday6am)).toBe(false);
  });

  it('supports range values (0 1-3 * * *)', () => {
    expect(cronMatchesNow('0 1-3 * * *', friday2am)).toBe(true);
    expect(cronMatchesNow('0 1-3 * * *', monday6am)).toBe(false);
  });

  it('throws on invalid cron expression (wrong field count)', () => {
    expect(() => cronMatchesNow('0 2 * *', friday2am)).toThrow();
  });

  it('throws on out-of-range values', () => {
    expect(() => cronMatchesNow('70 * * * *', friday2am)).toThrow(/must be 0-59/);
    expect(() => cronMatchesNow('0 25 * * *', friday2am)).toThrow(/must be 0-23/);
    expect(() => cronMatchesNow('0 0 32 * *', friday2am)).toThrow(/must be 1-31/);
    expect(() => cronMatchesNow('0 0 * 13 *', friday2am)).toThrow(/must be 1-12/);
    expect(() => cronMatchesNow('0 0 * * 8', friday2am)).toThrow(/must be 0-6/);
  });

  it('matches all 18 built-in schedules against expected times', () => {
    // Spot-check: daily 2am matches at 2:00, not at 3:00
    expect(cronMatchesNow('0 2 * * *', new Date('2026-04-17T02:00:00'))).toBe(true);
    expect(cronMatchesNow('0 2 * * *', new Date('2026-04-17T03:00:00'))).toBe(false);
    // Weekly Monday 6am
    expect(cronMatchesNow('0 6 * * 1', new Date('2026-04-20T06:00:00'))).toBe(true);
    // Monthly 1st 2am
    expect(cronMatchesNow('0 2 1 * *', new Date('2026-05-01T02:00:00'))).toBe(true);
  });
});
