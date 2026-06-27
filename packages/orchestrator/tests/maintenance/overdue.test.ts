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

  it('never-run task on an impossible cron is not overdue', () => {
    const impossible = task('feb31', '0 0 31 2 *');
    expect(selectTasks([impossible], [], { mode: 'overdue', now })).toHaveLength(0);
  });
});
