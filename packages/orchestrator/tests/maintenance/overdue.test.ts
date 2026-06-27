import { describe, it, expect } from 'vitest';
import { previousFireTime } from '../../src/maintenance/overdue';

describe('previousFireTime', () => {
  it('returns the most recent fire at/before now for a daily cron', () => {
    // 0 2 * * * — daily 02:00. now = 2026-04-17T05:00 → fire = 2026-04-17T02:00.
    const fire = previousFireTime('0 2 * * *', new Date('2026-04-17T05:00:00'));
    expect(fire?.toISOString()).toBe(new Date('2026-04-17T02:00:00').toISOString());
  });

  it('includes the current minute (fire at/before now is inclusive)', () => {
    const fire = previousFireTime('0 2 * * *', new Date('2026-04-17T02:00:00'));
    expect(fire?.toISOString()).toBe(new Date('2026-04-17T02:00:00').toISOString());
  });

  it('crosses into the previous day when today has not fired yet', () => {
    // now = 2026-04-17T01:00, before 02:00 → previous fire = 2026-04-16T02:00.
    const fire = previousFireTime('0 2 * * *', new Date('2026-04-17T01:00:00'));
    expect(fire?.toISOString()).toBe(new Date('2026-04-16T02:00:00').toISOString());
  });

  it('returns null for an impossible cron (0 0 31 2 * — Feb 31)', () => {
    expect(previousFireTime('0 0 31 2 *', new Date('2026-04-17T05:00:00'))).toBeNull();
  });
});
