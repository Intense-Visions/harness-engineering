import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  buildTaskRunner,
  loadRunHistory,
  resolveSelection,
  parseConcurrency,
  deriveExitCode,
  aggregateReport,
  renderTable,
} from '../../src/commands/maintenance-run';
import type { TaskDefinition, RunResult } from '@harness-engineering/orchestrator';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maint-run-'));
}

function task(id: string, extra: Partial<TaskDefinition> = {}): TaskDefinition {
  return {
    id,
    type: 'report-only',
    description: id,
    schedule: '0 2 * * *',
    branch: null,
    ...extra,
  };
}

const FIXTURE_TASKS: TaskDefinition[] = [
  task('doc-drift'),
  task('dead-code'),
  task('main-sync', { type: 'housekeeping', excludeFromHumanSweep: true }),
];

function runResult(taskId: string, extra: Partial<RunResult> = {}): RunResult {
  return {
    taskId,
    startedAt: '2026-06-27T00:00:00.000Z',
    completedAt: '2026-06-27T00:01:00.000Z',
    status: 'success',
    findings: 0,
    fixed: 0,
    prUrl: null,
    prUpdated: false,
    ...extra,
  };
}

const NOW = new Date('2026-06-27T12:00:00.000Z');

describe('buildTaskRunner', () => {
  it('builds a report-mode runner whose agent dispatcher throws if ever called', async () => {
    const dir = tmp();
    const runner = buildTaskRunner(dir, {} as never, 'report');
    expect(runner).toBeDefined();
    // report-mode dispatcher must never be invoked; assert it is a guard stub
    // by reaching into the constructed deps is not possible, so we assert the
    // runner type instead and rely on integration test (Task 8) for behavior.
    expect(typeof runner.run).toBe('function');
  });
});

describe('loadRunHistory', () => {
  it('returns [] when history.json is absent', async () => {
    expect(await loadRunHistory(tmp())).toEqual([]);
  });
  it('reads RunResult[] from .harness/maintenance/history.json', async () => {
    const dir = tmp();
    const mdir = path.join(dir, '.harness', 'maintenance');
    fs.mkdirSync(mdir, { recursive: true });
    fs.writeFileSync(
      path.join(mdir, 'history.json'),
      JSON.stringify([
        {
          taskId: 'doc-drift',
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:01:00.000Z',
          status: 'success',
          findings: 0,
          fixed: 0,
          prUrl: null,
          prUpdated: false,
        },
      ])
    );
    const h = await loadRunHistory(dir);
    expect(h).toHaveLength(1);
    expect(h[0]!.taskId).toBe('doc-drift');
  });
});

describe('resolveSelection', () => {
  it('defaults to overdue mode with no flags and no errors', () => {
    const sel = resolveSelection({}, FIXTURE_TASKS, NOW);
    expect(sel.filter.mode).toBe('overdue');
    expect(sel.errors).toEqual([]);
  });
  it('--all → all mode', () => {
    const sel = resolveSelection({ all: true }, FIXTURE_TASKS, NOW);
    expect(sel.filter.mode).toBe('all');
    expect(sel.errors).toEqual([]);
  });
  it('--only doc-drift → ids mode with that id', () => {
    const sel = resolveSelection({ only: 'doc-drift' }, FIXTURE_TASKS, NOW);
    expect(sel.filter.mode).toBe('ids');
    expect(sel.filter.ids).toEqual(['doc-drift']);
    expect(sel.errors).toEqual([]);
  });
  it('positional ids → ids mode', () => {
    const sel = resolveSelection({ positional: ['doc-drift', 'dead-code'] }, FIXTURE_TASKS, NOW);
    expect(sel.filter.mode).toBe('ids');
    expect(sel.filter.ids).toEqual(['doc-drift', 'dead-code']);
  });
  it('--only main-sync (excluded) → error', () => {
    const sel = resolveSelection({ only: 'main-sync' }, FIXTURE_TASKS, NOW);
    expect(sel.errors.length).toBeGreaterThan(0);
  });
  it('--only nope (unknown) → error', () => {
    const sel = resolveSelection({ only: 'nope' }, FIXTURE_TASKS, NOW);
    expect(sel.errors.length).toBeGreaterThan(0);
  });
  it('--all combined with --only → error', () => {
    const sel = resolveSelection({ all: true, only: 'doc-drift' }, FIXTURE_TASKS, NOW);
    expect(sel.errors.length).toBeGreaterThan(0);
  });
  it('--concurrency abc → error', () => {
    const sel = resolveSelection({ concurrency: 'abc' }, FIXTURE_TASKS, NOW);
    expect(sel.errors.length).toBeGreaterThan(0);
  });
  it('--concurrency 0 → error', () => {
    const sel = resolveSelection({ concurrency: '0' }, FIXTURE_TASKS, NOW);
    expect(sel.errors.length).toBeGreaterThan(0);
  });
  it('--skip unknown id → warning, no error, no skip', () => {
    const sel = resolveSelection({ skip: 'foo' }, FIXTURE_TASKS, NOW);
    expect(sel.errors).toEqual([]);
    expect(sel.warnings.length).toBeGreaterThan(0);
    expect(sel.skipIds.size).toBe(0);
  });
  it('--skip known id → added to skipIds', () => {
    const sel = resolveSelection({ skip: 'doc-drift' }, FIXTURE_TASKS, NOW);
    expect(sel.skipIds.has('doc-drift')).toBe(true);
  });
});

describe('parseConcurrency', () => {
  it('defaults to a positive cap when undefined', () => {
    expect(parseConcurrency(undefined)).toBeGreaterThanOrEqual(1);
  });
  it('parses a valid integer', () => {
    expect(parseConcurrency('4')).toBe(4);
  });
  it('throws on invalid', () => {
    expect(() => parseConcurrency('abc')).toThrow();
    expect(() => parseConcurrency('0')).toThrow();
  });
});

describe('deriveExitCode', () => {
  it('returns 1 when any task failed', () => {
    expect(deriveExitCode([runResult('a', { status: 'failure' })])).toBe(1);
  });
  it('returns 0 when a task only has findings', () => {
    expect(deriveExitCode([runResult('a', { status: 'success', findings: 5 })])).toBe(0);
  });
  it('returns 0 for an empty run', () => {
    expect(deriveExitCode([])).toBe(0);
  });
});

describe('aggregateReport / renderTable', () => {
  it('sorts a 5-findings row above a 0-findings row', () => {
    const report = aggregateReport({
      results: [
        runResult('clean-task', { findings: 0 }),
        runResult('noisy-task', { status: 'success', findings: 5 }),
      ],
      mode: 'report',
      fix: false,
      exitCode: 0,
      overdueNowCurrent: [],
      generatedAt: NOW.toISOString(),
    });
    expect(report.tasks[0]!.taskId).toBe('noisy-task');
    expect(report.tasks[1]!.taskId).toBe('clean-task');
    const rendered = renderTable(report);
    expect(rendered.indexOf('noisy-task')).toBeLessThan(rendered.indexOf('clean-task'));
  });
  it('places failures first', () => {
    const report = aggregateReport({
      results: [
        runResult('noisy', { status: 'success', findings: 9 }),
        runResult('broken', { status: 'failure', findings: 1, error: 'boom' }),
      ],
      mode: 'report',
      fix: false,
      exitCode: 1,
      overdueNowCurrent: [],
      generatedAt: NOW.toISOString(),
    });
    expect(report.tasks[0]!.taskId).toBe('broken');
  });
  it('footer reflects overdueNowCurrent', () => {
    const report = aggregateReport({
      results: [runResult('doc-drift', { findings: 0 })],
      mode: 'report',
      fix: false,
      exitCode: 0,
      overdueNowCurrent: ['doc-drift'],
      generatedAt: NOW.toISOString(),
    });
    const rendered = renderTable(report);
    expect(rendered).toContain('1 overdue but now current');
    expect(rendered).toContain('doc-drift');
  });
});
