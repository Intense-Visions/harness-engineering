import type { TaskDefinition, RunResult } from './types';
import { cronMatchesNow, cronMatchesDate } from './cron-matcher';

/**
 * Backward look-back window, in days. 366 covers every realistic maintenance
 * cadence up to annual (`0 2 1 1 *`) plus a leap-year margin: the previous fire
 * of an annual schedule is at most ~365 days before `now`. Cadences longer than
 * annual are out of scope — a task that fires less than once a year is treated
 * as having no fire in the window (and, if never run, is still selected as
 * overdue by `isOverdue`). The bound is in days, not minutes, because the scan
 * is hierarchical (see `previousFireTime`).
 */
const LOOKBACK_DAYS = 366;

/**
 * Most recent cron fire at/before `now` (minute resolution), or `null` when no
 * fire exists within the {@link LOOKBACK_DAYS} window (e.g. the impossible
 * `0 0 31 2 *`, or a cadence longer than annual).
 *
 * Coarse-to-fine to stay performant: rather than scanning every minute across
 * the whole window (527k iterations/task for a year), it steps backward one
 * calendar day at a time, skipping days whose date can never fire via
 * `cronMatchesDate`, and only minute-scans a day that is date-eligible. An
 * impossible cron therefore costs ~366 cheap day checks and zero minute scans.
 *
 * Days are walked by calendar component (`new Date(y, m, d - 1)`) so month/year
 * rollovers and DST day-length changes are handled by the platform. `now` is
 * injected — this never reads the wall clock.
 */
export function previousFireTime(schedule: string, now: Date): Date | null {
  // Local midnight of `now`'s day; the day-level cursor walks backward from here.
  let day = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let d = 0; d <= LOOKBACK_DAYS; d++) {
    if (cronMatchesDate(schedule, day)) {
      // Most recent candidate minute on this day: `now` (floored) for today,
      // else 23:59. Scan downward to local midnight; first match is the fire.
      const dayStartMs = day.getTime();
      const scanStart =
        d === 0
          ? new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
              now.getHours(),
              now.getMinutes()
            )
          : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59);
      for (let ms = scanStart.getTime(); ms >= dayStartMs; ms -= 60_000) {
        const candidate = new Date(ms);
        if (cronMatchesNow(schedule, candidate)) return candidate;
      }
    }
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1);
  }
  return null;
}

/** Selection filter for `selectTasks`. `now` is injected for determinism. */
export interface TaskSelectionFilter {
  mode: 'overdue' | 'all' | 'ids';
  /** Required when `mode === 'ids'`; ignored otherwise. */
  ids?: string[];
  /** Reference instant — never read from the wall clock internally. */
  now: Date;
}

/** A run satisfies a schedule when its check executed cleanly. */
function isSatisfyingRun(r: RunResult): boolean {
  return r.status === 'success' || r.status === 'no-issues';
}

/** True when a sweep-eligible task has no satisfying run since its previous fire. */
function isOverdue(task: TaskDefinition, history: RunResult[], now: Date): boolean {
  const satisfyingRuns = history.filter((r) => r.taskId === task.id && isSatisfyingRun(r));
  const fire = previousFireTime(task.schedule, now);

  // No computable fire within the look-back window (impossible cron, or a cadence
  // longer than annual). Under-selection is the invisible failure we must avoid:
  // a task that has NEVER run satisfyingly is overdue regardless of fire lookup.
  // A task that HAS run is treated as current (no fire to be late against).
  // Real impossible-cron infra tasks carry `excludeFromHumanSweep` and never
  // reach this path — they are filtered out by `selectTasks` first.
  if (fire === null) return satisfyingRuns.length === 0;

  const fireMs = fire.getTime();
  const satisfied = satisfyingRuns.some((r) => new Date(r.completedAt).getTime() >= fireMs);
  return !satisfied; // includes never-run (no matching history)
}

/**
 * Select the maintenance tasks to run for an on-demand sweep (D3/D5).
 * Operates only on sweep-eligible tasks (`excludeFromHumanSweep !== true`)
 * in every mode. Deterministic under the injected `filter.now`.
 *
 * - `overdue`: eligible tasks with no satisfying run since their previous fire.
 * - `all`:     every eligible task.
 * - `ids`:     the eligible subset named in `filter.ids` (a named excluded id
 *              is dropped, honoring "excluded tasks never run in either path").
 */
export function selectTasks(
  tasks: TaskDefinition[],
  history: RunResult[],
  filter: TaskSelectionFilter
): TaskDefinition[] {
  const eligible = tasks.filter((t) => t.excludeFromHumanSweep !== true);
  switch (filter.mode) {
    case 'all':
      return eligible;
    case 'ids': {
      const wanted = new Set(filter.ids ?? []);
      return eligible.filter((t) => wanted.has(t.id));
    }
    case 'overdue':
      return eligible.filter((t) => isOverdue(t, history, filter.now));
  }
}
