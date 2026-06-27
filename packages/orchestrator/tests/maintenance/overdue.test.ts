import { describe, it, expect } from 'vitest';
import { previousFireTime, selectTasks } from '../../src/maintenance/overdue';
import type { TaskDefinition, RunResult } from '../../src/maintenance/types';

const task = (id: string, schedule: string, excluded = false): TaskDefinition => ({
  id,
  type: 'report-only',
  description: id,
  schedule,
  branch: null,
  ...(excluded ? { excludeFromHumanSweep: true } : {}),
});
const ran = (
  taskId: string,
  completedAt: string,
  status: RunResult['status'] = 'success'
): RunResult => ({
  taskId,
  startedAt: completedAt,
  completedAt,
  status,
  findings: 0,
  fixed: 0,
  prUrl: null,
  prUpdated: false,
});

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

describe('selectTasks', () => {
  const now = new Date('2026-04-17T05:00:00'); // after the 02:00 daily fire
  const daily = task('alpha', '0 2 * * *');
  const beta = task('beta', '0 2 * * *');

  it('treats a never-run eligible task as overdue', () => {
    const out = selectTasks([daily], [], { mode: 'overdue', now });
    expect(out.map((t) => t.id)).toEqual(['alpha']);
  });

  it('treats a task run after its last fire as current (not overdue)', () => {
    const history = [ran('alpha', '2026-04-17T02:05:00')]; // after 02:00 fire
    expect(selectTasks([daily], history, { mode: 'overdue', now })).toHaveLength(0);
  });

  it('treats a task last run before its last fire as overdue', () => {
    const history = [ran('alpha', '2026-04-16T02:05:00')]; // before today 02:00 fire
    expect(selectTasks([daily], history, { mode: 'overdue', now }).map((t) => t.id)).toEqual([
      'alpha',
    ]);
  });

  it('counts no-issues as a satisfying run, ignores failure/skipped', () => {
    expect(
      selectTasks([daily], [ran('alpha', '2026-04-17T02:05:00', 'no-issues')], {
        mode: 'overdue',
        now,
      })
    ).toHaveLength(0);
    expect(
      selectTasks([daily], [ran('alpha', '2026-04-17T02:05:00', 'failure')], {
        mode: 'overdue',
        now,
      }).map((t) => t.id)
    ).toEqual(['alpha']);
    expect(
      selectTasks([daily], [ran('alpha', '2026-04-17T02:05:00', 'skipped')], {
        mode: 'overdue',
        now,
      }).map((t) => t.id)
    ).toEqual(['alpha']);
  });

  it('excludes excludeFromHumanSweep tasks in every mode', () => {
    const excluded = task('housekeep', '0 2 * * *', true);
    expect(selectTasks([daily, excluded], [], { mode: 'all', now }).map((t) => t.id)).toEqual([
      'alpha',
    ]);
    expect(selectTasks([daily, excluded], [], { mode: 'overdue', now }).map((t) => t.id)).toEqual([
      'alpha',
    ]);
    expect(
      selectTasks([daily, excluded], [], { mode: 'ids', ids: ['housekeep'], now })
    ).toHaveLength(0);
  });

  it('all returns every eligible task regardless of history', () => {
    const history = [ran('alpha', '2026-04-17T02:05:00')];
    expect(
      selectTasks([daily, beta], history, { mode: 'all', now })
        .map((t) => t.id)
        .sort()
    ).toEqual(['alpha', 'beta']);
  });

  it('ids returns the named eligible subset', () => {
    expect(
      selectTasks([daily, beta], [], { mode: 'ids', ids: ['beta'], now }).map((t) => t.id)
    ).toEqual(['beta']);
  });

  it('selects a sweep-eligible never-run task as overdue even on an impossible cron (rule 1)', () => {
    // Rule 1: a never-run eligible task is overdue regardless of fire lookup —
    // here the fire is null (impossible Feb-31 cron) yet the task has never run.
    // The real-world guard against impossible-cron infra tasks is the
    // excludeFromHumanSweep flag (asserted below), not the fire-null check.
    const eligibleImpossible = task('feb31', '0 0 31 2 *');
    expect(
      selectTasks([eligibleImpossible], [], { mode: 'overdue', now }).map((t) => t.id)
    ).toEqual(['feb31']);

    const excludedImpossible = task('feb31x', '0 0 31 2 *', true);
    expect(selectTasks([excludedImpossible], [], { mode: 'overdue', now })).toHaveLength(0);
  });
});

describe('selectTasks — long-cadence schedules (look-back > 31 days)', () => {
  // now sits mid-period for both cadences so the previous fire is > 31 days back,
  // which the old 31-day look-back silently resolved to null → never selected.
  const now = new Date('2026-06-25T05:00:00');
  const quarterly = task('quarterly', '0 2 1 */3 *'); // 02:00 on the 1st of Jan/Apr/Jul/Oct
  const annual = task('annual', '0 2 1 1 *'); // 02:00 on Jan 1

  it('quarterly never run → overdue', () => {
    expect(selectTasks([quarterly], [], { mode: 'overdue', now }).map((t) => t.id)).toEqual([
      'quarterly',
    ]);
  });

  it('quarterly last run before the current period fire → overdue', () => {
    // Ran during Q1 (Jan 5); the most recent fire is Apr 1 02:00 → not satisfied.
    const history = [ran('quarterly', '2026-01-05T02:30:00')];
    expect(selectTasks([quarterly], history, { mode: 'overdue', now }).map((t) => t.id)).toEqual([
      'quarterly',
    ]);
  });

  it('quarterly run within the current period → current (not overdue)', () => {
    // Ran just after the Apr 1 02:00 fire → satisfied for the current period.
    const history = [ran('quarterly', '2026-04-01T02:30:00')];
    expect(selectTasks([quarterly], history, { mode: 'overdue', now })).toHaveLength(0);
  });

  it('annual never run → overdue', () => {
    expect(selectTasks([annual], [], { mode: 'overdue', now }).map((t) => t.id)).toEqual([
      'annual',
    ]);
  });

  it('annual last run before this year fire → overdue', () => {
    // Ran 2025-12-15, before the Jan 1 2026 02:00 fire → not satisfied.
    const history = [ran('annual', '2025-12-15T02:30:00')];
    expect(selectTasks([annual], history, { mode: 'overdue', now }).map((t) => t.id)).toEqual([
      'annual',
    ]);
  });

  it('annual run after this year fire → current (not overdue)', () => {
    const history = [ran('annual', '2026-01-01T03:00:00')];
    expect(selectTasks([annual], history, { mode: 'overdue', now })).toHaveLength(0);
  });
});

describe('previousFireTime — long-cadence resolution', () => {
  it('resolves a quarterly fire more than 31 days back', () => {
    // now = 2026-06-25; previous 0 2 1 */3 * fire = Apr 1 02:00 (~85 days back).
    const fire = previousFireTime('0 2 1 */3 *', new Date('2026-06-25T05:00:00'));
    expect(fire?.toISOString()).toBe(new Date('2026-04-01T02:00:00').toISOString());
  });

  it('resolves an annual fire more than 31 days back', () => {
    // now = 2026-06-25; previous 0 2 1 1 * fire = Jan 1 02:00 (~175 days back).
    const fire = previousFireTime('0 2 1 1 *', new Date('2026-06-25T05:00:00'));
    expect(fire?.toISOString()).toBe(new Date('2026-01-01T02:00:00').toISOString());
  });
});
