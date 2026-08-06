import type { SignalPoint, SignalResult } from './types';

/**
 * The canonical rolling window (in days) shared by every curated signal and by
 * the composed Holiday Confidence KPI. Providers may still declare their own
 * local `WINDOW_DAYS`, but new consumers should default to this so the window is
 * defined in one place.
 */
export const DEFAULT_WINDOW_DAYS = 30;

/**
 * Marker emitted in a GitHub PR review body by the multi-persona review pipeline
 * (`core/src/review/output/format-github.ts` → `formatGitHubSummary`). A merged PR
 * is considered to have had a multi-persona review iff at least one of its review
 * bodies contains this string. Exported so every consumer (the
 * `pr-merged-without-multi-persona-review` signal and the Holiday Confidence KPI)
 * shares one definition and cannot drift apart. If the pipeline ever changes its
 * summary header, this single const is the only thing to update.
 */
export const ASSESSMENT_MARKER = '## Assessment:';

/** Truncate an ISO timestamp to a `YYYY-MM-DD` date string (UTC). */
export function toDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Round to 2 decimal places. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Derive the endpoint trend (`'up' | 'down' | 'flat'`) from a chronologically
 * sorted daily history by comparing the latest point to the earliest. Fewer than
 * two points, or equal endpoints, is `'flat'`.
 *
 * This is the shared "endpoint-delta" trend rule used by the count/rate providers
 * (`pr-review`, `eval-fail-rate`, `baseline-updates`). `coverage-trend` and
 * `complexity-trend` keep their own value-aware variants because they ALSO derive
 * a percentage-point / percentage delta from the same comparison.
 */
export function deriveEndpointTrend(history: readonly SignalPoint[]): SignalResult['trend'] {
  if (history.length < 2) return 'flat';
  const latest = history[history.length - 1]!.value;
  const earliest = history[0]!.value;
  if (latest > earliest) return 'up';
  if (latest < earliest) return 'down';
  return 'flat';
}

/**
 * Sort daily `[date, value]` bucket entries chronologically into `SignalPoint[]`.
 * `transform` maps each bucket value to the point's numeric value (e.g. identity
 * for counts, a rounded rate for fractions).
 */
export function bucketsToHistory<V>(
  buckets: ReadonlyMap<string, V>,
  transform: (value: V) => number
): SignalPoint[] {
  return [...buckets.entries()]
    .map(([date, value]) => ({ date, value: transform(value) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
