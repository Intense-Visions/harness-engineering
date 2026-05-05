export interface IsoWeek {
  year: number;
  week: number;
}

/**
 * Compute ISO 8601 week number for a date. Uses the standard algorithm:
 * the week-of-year of the Thursday in the same week as `date`.
 */
export function isoWeek(date: Date): IsoWeek {
  // Copy and align to UTC midnight to avoid TZ drift.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday in current week determines the year.
  const dayNum = d.getUTCDay() || 7; // Sun=0 -> 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year, week };
}

export function formatIsoWeek(w: IsoWeek): string {
  return `${w.year}-W${String(w.week).padStart(2, '0')}`;
}
