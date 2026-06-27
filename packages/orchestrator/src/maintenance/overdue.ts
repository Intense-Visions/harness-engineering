import type { TaskDefinition, RunResult } from './types';
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
  const fire = previousFireTime(task.schedule, now);
  if (fire === null) return false; // no computable fire (e.g. impossible cron) → not overdue
  const fireMs = fire.getTime();
  const satisfied = history.some(
    (r) => r.taskId === task.id && isSatisfyingRun(r) && new Date(r.completedAt).getTime() >= fireMs
  );
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
