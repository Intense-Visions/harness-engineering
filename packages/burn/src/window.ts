import type { BurnConfig } from './types';

/**
 * The week window is load-bearing.
 *
 * An earlier version assumed a Monday-midnight-UTC week. For an account whose
 * real reset is Wednesday 08:59 America/Chicago that understated week-to-date
 * burn by ~81x and reported a calm green at 97% of the actual limit. No amount
 * of zero-denominator checking catches a correct computation over the wrong
 * seven days — only matching /usage exactly does.
 *
 * Ported from Python's `zoneinfo` to `Intl.DateTimeFormat`, which is the only
 * IANA-zone facility in the Node standard library. The arithmetic below is
 * wall-clock arithmetic (subtract calendar days, then resolve to an instant),
 * matching what `aware_datetime - timedelta` does under `zoneinfo`.
 */

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  const cached = formatters.get(tz);
  if (cached) return cached;
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatters.set(tz, f);
  return f;
}

/** Resolve a timezone name, falling back to UTC rather than throwing. */
export function safeZone(tz: string | undefined | null): string {
  const name = tz || 'UTC';
  try {
    formatterFor(name);
    return name;
  } catch {
    return 'UTC';
  }
}

function partsIn(instant: Date, tz: string): WallClock & { second: number } {
  const parts = formatterFor(tz).formatToParts(instant);
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : 0;
  };
  // `hourCycle: 'h23'` still renders midnight as 24 in some ICU builds.
  const hour = get('hour') % 24;
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset of `tz` at `instant`, in ms (local wall clock minus UTC). */
function offsetAt(instant: Date, tz: string): number {
  const p = partsIn(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instant.getTime();
}

/**
 * Resolve a wall-clock reading in `tz` to an absolute instant.
 *
 * Two passes: the first offset is looked up at the naive guess, the second at
 * the corrected instant, which is what gets a boundary near a DST transition
 * onto the right side of the shift.
 */
export function wallToInstant(wall: WallClock, tz: string): Date {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
  const firstPass = guess - offsetAt(new Date(guess), tz);
  const secondPass = guess - offsetAt(new Date(firstPass), tz);
  return new Date(secondPass);
}

/** 0=Mon..6=Sun, matching Python's `date.weekday()` (JS `getUTCDay` is 0=Sun). */
function isoWeekday(wall: WallClock): number {
  return (new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay() + 6) % 7;
}

function shiftDays(wall: WallClock, days: number): WallClock {
  const d = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  d.setUTCDate(d.getUTCDate() + days);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: wall.hour,
    minute: wall.minute,
  };
}

function parseTimeOfDay(value: unknown): { hour: number; minute: number } {
  // A config is user-edited JSON, so `time` may be anything at all; only a
  // string can be a time, and everything else falls back to midnight.
  const raw = typeof value === 'string' ? value : '00:00';
  const [h, m] = raw.split(':');
  const hour = Number(h);
  const minute = Number(m);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

export const WEEK_MS = 7 * 86_400_000;

/**
 * The most recent reset instant at or before `now`, and the next one.
 *
 * Anchored on (weekday, local time, timezone) so it matches /usage exactly.
 * At the reset instant itself the NEW week has begun — the boundary is
 * inclusive on the left, which is what stops a reset-time reading being filed
 * under the week that just ended.
 */
export function weekBounds(now: Date, cfg: Partial<BurnConfig>): { start: Date; end: Date } {
  const wr = cfg.week_reset ?? {};
  const wd = (((Number((wr as { weekday?: number }).weekday) || 0) % 7) + 7) % 7;
  const tz = safeZone((wr as { tz?: string }).tz);
  const { hour, minute } = parseTimeOfDay((wr as { time?: string }).time);

  const local = partsIn(now, tz);
  let candidate: WallClock = {
    year: local.year,
    month: local.month,
    day: local.day,
    hour,
    minute,
  };
  const daysSinceReset = (((isoWeekday(candidate) - wd) % 7) + 7) % 7;
  candidate = shiftDays(candidate, -daysSinceReset);

  let start = wallToInstant(candidate, tz);
  if (start.getTime() > now.getTime()) {
    start = wallToInstant(shiftDays(candidate, -7), tz);
  }
  return { start, end: new Date(start.getTime() + WEEK_MS) };
}
