import { cronMatchesNow } from './cron-matcher';

/** Minutes in 31 days — the backward look-back window (mirrors computeNextRun). */
const LOOKBACK_MINUTES = 44_640;

/**
 * Most recent cron fire at/before `now` (minute resolution), or `null` when no
 * fire exists within the 31-day look-back window (e.g. the impossible `0 0 31 2 *`).
 * Reuses `cronMatchesNow`; interprets cron fields in the local-time frame.
 * `now` is injected — never reads the wall clock.
 */
export function previousFireTime(schedule: string, now: Date): Date | null {
  const start = new Date(now);
  start.setSeconds(0, 0);
  for (let i = 0; i <= LOOKBACK_MINUTES; i++) {
    const candidate = new Date(start.getTime() - i * 60_000);
    if (cronMatchesNow(schedule, candidate)) return candidate;
  }
  return null;
}
