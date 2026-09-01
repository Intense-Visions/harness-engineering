/**
 * Shared date math for the release-inventory metric. Extracted so both
 * `compute.ts` and `changesets.ts` can age their inventory without importing
 * each other (breaks a would-be import cycle).
 */

const MS_PER_DAY = 86_400_000;

/**
 * Whole-day difference `later - earlier`, clamped at 0. Returns 0 for an
 * unparseable date so a bad timestamp never produces a negative or NaN age.
 */
export function diffInWholeDays(later: Date, earlier: Date): number {
  const lt = later.getTime();
  const et = earlier.getTime();
  if (Number.isNaN(lt) || Number.isNaN(et)) return 0;
  const diff = Math.floor((lt - et) / MS_PER_DAY);
  return diff > 0 ? diff : 0;
}
