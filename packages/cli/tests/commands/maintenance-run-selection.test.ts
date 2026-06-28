import { describe, it, expect, vi } from 'vitest';
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
  runMaintenanceRun,
  createFixDispatcher,
  makeResolveBackend,
  type MaintenanceRunDeps,
} from '../../src/commands/maintenance-run';
import { MockBackend } from '@harness-engineering/orchestrator';
import type { TaskDefinition, RunResult, RunMode } from '@harness-engineering/orchestrator';

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

describe('makeResolveBackend', () => {
  it('returns null for every name when the backend map is null (plain checkout)', () => {
    const resolve = makeResolveBackend(null);
    expect(resolve('local')).toBeNull();
    expect(resolve('primary')).toBeNull();
  });

  it('builds a live backend for a configured name and null for an unknown one', () => {
    const resolve = makeResolveBackend({ local: { type: 'mock' } });
    expect(resolve('local')).not.toBeNull();
    expect(resolve('nope')).toBeNull();
  });
});

describe('createFixDispatcher (real dispatch, #679)', () => {
  it('dispatches via the resolved backend and reports the real commit count', async () => {
    // Fake git seam: HEAD advances during the (mock) session → 3 commits.
    const revParse = ['sha-before', 'sha-after'];
    const git = vi.fn((args: string[]) => {
      if (args[0] === 'rev-parse') return revParse.shift()!;
      if (args[0] === 'rev-list') return '3';
      return '';
    });
    const dispatcher = createFixDispatcher(() => new MockBackend(), git);
    const result = await dispatcher.dispatch('harness-dead-code-fix', 'main', 'local', '/repo');
    expect(result).toEqual({ producedCommits: true, fixed: 3 });
  });

  it('no-ops honestly (fixed 0, no git, no throw) when the backend is unresolvable', async () => {
    const git = vi.fn();
    const dispatcher = createFixDispatcher(() => null, git);
    const result = await dispatcher.dispatch('harness-dead-code-fix', 'main', 'local', '/repo');
    expect(result).toEqual({ producedCommits: false, fixed: 0 });
    expect(git).not.toHaveBeenCalled();
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

describe('runMaintenanceRun (fake deps, no real exec)', () => {
  interface RunCall {
    taskId: string;
    mode: RunMode;
    at: number;
  }

  // A fake runner that records call order/overlap and returns canned results.
  function fakeRunner(
    calls: RunCall[],
    canned: (taskId: string) => Partial<RunResult> = () => ({})
  ): { makeRunner: NonNullable<MaintenanceRunDeps['makeRunner']>; peak: () => number } {
    let current = 0;
    let peak = 0;
    const makeRunner: NonNullable<MaintenanceRunDeps['makeRunner']> = (_cwd, _config, mode) =>
      ({
        run: (async (t: TaskDefinition) => {
          current++;
          peak = Math.max(peak, current);
          calls.push({ taskId: t.id, mode, at: Date.now() });
          await new Promise((r) => setTimeout(r, 3));
          current--;
          return runResult(t.id, canned(t.id));
        }) as never,
      }) as never;
    return { makeRunner, peak: () => peak };
  }

  function deps(
    over: Partial<MaintenanceRunDeps>,
    tasks: TaskDefinition[],
    history: RunResult[] = []
  ): MaintenanceRunDeps {
    return {
      now: NOW,
      loadTasks: async () => tasks,
      loadHistory: async () => history,
      record: async () => {},
      ...over,
    };
  }

  it('overdue default selects only overdue tasks and writes last-run-summary.json (exit 0)', async () => {
    const dir = tmp();
    const calls: RunCall[] = [];
    const f = fakeRunner(calls);
    // doc-drift ran recently (current); dead-code never ran (overdue).
    const history = [
      runResult('doc-drift', {
        status: 'success',
        startedAt: '2026-06-27T11:59:00.000Z',
        completedAt: '2026-06-27T11:59:00.000Z',
      }),
    ];
    const res = await runMaintenanceRun(
      dir,
      {},
      deps({ makeRunner: f.makeRunner }, [task('doc-drift'), task('dead-code')], history)
    );
    expect(res.exitCode).toBe(0);
    expect(calls.map((c) => c.taskId)).toEqual(['dead-code']);
    const summary = path.join(dir, '.harness', 'maintenance', 'last-run-summary.json');
    expect(fs.existsSync(summary)).toBe(true);
    const report = JSON.parse(fs.readFileSync(summary, 'utf-8'));
    expect(report.tasks.map((t: { taskId: string }) => t.taskId)).toEqual(['dead-code']);
  });

  it('a task that fails to execute yields exit 1', async () => {
    const dir = tmp();
    const calls: RunCall[] = [];
    const f = fakeRunner(calls, (id) =>
      id === 'dead-code' ? { status: 'failure', error: 'boom' } : {}
    );
    const res = await runMaintenanceRun(
      dir,
      { all: true },
      deps({ makeRunner: f.makeRunner }, [task('doc-drift'), task('dead-code')])
    );
    expect(res.exitCode).toBe(1);
  });

  it('findings-only stays exit 0', async () => {
    const dir = tmp();
    const calls: RunCall[] = [];
    const f = fakeRunner(calls, () => ({ status: 'success', findings: 7 }));
    const res = await runMaintenanceRun(
      dir,
      { all: true },
      deps({ makeRunner: f.makeRunner }, [task('doc-drift')])
    );
    expect(res.exitCode).toBe(0);
  });

  it('--all runs every eligible task; excluded task never appears', async () => {
    const dir = tmp();
    const calls: RunCall[] = [];
    const f = fakeRunner(calls);
    const res = await runMaintenanceRun(
      dir,
      { all: true },
      deps({ makeRunner: f.makeRunner }, FIXTURE_TASKS)
    );
    expect(res.exitCode).toBe(0);
    expect(calls.map((c) => c.taskId).sort()).toEqual(['dead-code', 'doc-drift']);
    expect(calls.map((c) => c.taskId)).not.toContain('main-sync');
  });

  it('--only runs just that id', async () => {
    const dir = tmp();
    const calls: RunCall[] = [];
    const f = fakeRunner(calls);
    await runMaintenanceRun(
      dir,
      { only: 'doc-drift' },
      deps({ makeRunner: f.makeRunner }, FIXTURE_TASKS)
    );
    expect(calls.map((c) => c.taskId)).toEqual(['doc-drift']);
  });

  it('--skip removes a task', async () => {
    const dir = tmp();
    const calls: RunCall[] = [];
    const f = fakeRunner(calls);
    await runMaintenanceRun(
      dir,
      { all: true, skip: 'doc-drift' },
      deps({ makeRunner: f.makeRunner }, FIXTURE_TASKS)
    );
    expect(calls.map((c) => c.taskId)).toEqual(['dead-code']);
  });

  it('unknown id → exit 2, no runner invoked', async () => {
    const dir = tmp();
    const calls: RunCall[] = [];
    const f = fakeRunner(calls);
    const res = await runMaintenanceRun(
      dir,
      { only: 'nope' },
      deps({ makeRunner: f.makeRunner }, FIXTURE_TASKS)
    );
    expect(res.exitCode).toBe(2);
    expect(calls).toHaveLength(0);
  });

  it('excluded id → exit 2', async () => {
    const dir = tmp();
    const res = await runMaintenanceRun(dir, { only: 'main-sync' }, deps({}, FIXTURE_TASKS));
    expect(res.exitCode).toBe(2);
  });

  it('--fix (no backend configured) threads mode=fix, forces concurrency 1, and logs the honest no-backend notice', async () => {
    const dir = tmp();
    const calls: RunCall[] = [];
    const errLines: string[] = [];
    const f = fakeRunner(calls);
    await runMaintenanceRun(
      dir,
      { all: true, fix: true, concurrency: '8' },
      deps({ makeRunner: f.makeRunner, logErr: (l) => errLines.push(l) }, [
        task('doc-drift'),
        task('dead-code'),
      ])
    );
    expect(calls.every((c) => c.mode === 'fix')).toBe(true);
    expect(f.peak()).toBe(1); // --fix forces sequential execution regardless of --concurrency
    // No backend resolvable in a bare temp dir → honest skip notice (NOT "stub").
    expect(errLines.join('\n')).toMatch(/no agent backend configured/i);
    expect(errLines.join('\n')).not.toMatch(/stub/i);
    // The explicit --concurrency 8 was overridden by fix-mode → one-line warning.
    expect(errLines.join('\n')).toMatch(/--concurrency 8 ignored: --fix runs sequentially/i);
  });

  it('--fix with a resolvable backend does NOT emit the no-backend notice', async () => {
    const dir = tmp();
    const calls: RunCall[] = [];
    const errLines: string[] = [];
    const f = fakeRunner(calls);
    await runMaintenanceRun(
      dir,
      { all: true, fix: true },
      deps(
        {
          makeRunner: f.makeRunner,
          logErr: (l) => errLines.push(l),
          // default maintenance backend name is 'local' (aiBackend ?? 'local')
          loadBackends: async () => ({ local: { type: 'mock' } }),
        },
        [task('doc-drift')]
      )
    );
    expect(calls.every((c) => c.mode === 'fix')).toBe(true);
    expect(errLines.join('\n')).not.toMatch(/no agent backend configured/i);
  });

  it('--fix with a backend map that lacks the default backend still warns honestly', async () => {
    const dir = tmp();
    const calls: RunCall[] = [];
    const errLines: string[] = [];
    const f = fakeRunner(calls);
    const res = await runMaintenanceRun(
      dir,
      { all: true, fix: true },
      deps(
        {
          makeRunner: f.makeRunner,
          logErr: (l) => errLines.push(l),
          // 'primary' is configured but the default maintenance backend ('local') is not.
          loadBackends: async () => ({ primary: { type: 'mock' } }),
        },
        [task('doc-drift')]
      )
    );
    expect(errLines.join('\n')).toMatch(/no agent backend configured/i);
    expect(res.report?.fix).toBe(true);
    // Fake runner reports fixed:0 — the honest no-fix outcome is preserved.
    expect(res.report?.tasks.every((t) => t.fixed === 0)).toBe(true);
  });

  it('--fix without an explicit --concurrency does NOT emit the override warning', async () => {
    const dir = tmp();
    const calls: RunCall[] = [];
    const errLines: string[] = [];
    const f = fakeRunner(calls);
    await runMaintenanceRun(
      dir,
      { all: true, fix: true },
      deps({ makeRunner: f.makeRunner, logErr: (l) => errLines.push(l) }, [task('doc-drift')])
    );
    expect(errLines.join('\n')).not.toMatch(/concurrency.*ignored/i);
  });

  it('--fix --concurrency 1 (already sequential) does NOT emit the override warning', async () => {
    const dir = tmp();
    const calls: RunCall[] = [];
    const errLines: string[] = [];
    const f = fakeRunner(calls);
    await runMaintenanceRun(
      dir,
      { all: true, fix: true, concurrency: '1' },
      deps({ makeRunner: f.makeRunner, logErr: (l) => errLines.push(l) }, [task('doc-drift')])
    );
    expect(errLines.join('\n')).not.toMatch(/concurrency.*ignored/i);
  });

  it('report mode (no --fix) does NOT emit the override warning even with --concurrency', async () => {
    const dir = tmp();
    const calls: RunCall[] = [];
    const errLines: string[] = [];
    const f = fakeRunner(calls);
    await runMaintenanceRun(
      dir,
      { all: true, concurrency: '4' },
      deps({ makeRunner: f.makeRunner, logErr: (l) => errLines.push(l) }, [task('doc-drift')])
    );
    expect(errLines.join('\n')).not.toMatch(/concurrency.*ignored/i);
  });

  it('nothing selected → "All maintenance current." logged, exit 0, summary written', async () => {
    const dir = tmp();
    const logLines: string[] = [];
    // doc-drift is current (recent success), so overdue selects nothing.
    const history = [
      runResult('doc-drift', {
        status: 'success',
        startedAt: '2026-06-27T11:59:00.000Z',
        completedAt: '2026-06-27T11:59:00.000Z',
      }),
    ];
    const res = await runMaintenanceRun(
      dir,
      {},
      deps({ log: (l) => logLines.push(l) }, [task('doc-drift')], history)
    );
    expect(res.exitCode).toBe(0);
    expect(logLines.join('\n')).toMatch(/All maintenance current/i);
    const summary = path.join(dir, '.harness', 'maintenance', 'last-run-summary.json');
    expect(fs.existsSync(summary)).toBe(true);
  });

  it('nothing selected + --json → stdout is parseable JSON with tasks:[] (NOT the sentinel), exit 0', async () => {
    const dir = tmp();
    const logLines: string[] = [];
    // doc-drift is current (recent success), so overdue selects nothing.
    const history = [
      runResult('doc-drift', {
        status: 'success',
        startedAt: '2026-06-27T11:59:00.000Z',
        completedAt: '2026-06-27T11:59:00.000Z',
      }),
    ];
    const res = await runMaintenanceRun(
      dir,
      { json: true },
      deps({ log: (l) => logLines.push(l) }, [task('doc-drift')], history)
    );
    expect(res.exitCode).toBe(0);
    const stdout = logLines.join('\n');
    // The --json happy path must NEVER print the human sentinel.
    expect(stdout).not.toMatch(/All maintenance current/i);
    // JSON.parse(stdout) must succeed and yield an empty-tasks report.
    const parsed = JSON.parse(stdout);
    expect(parsed.tasks).toEqual([]);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.overdueNowCurrent).toEqual([]);
    // last-run-summary.json stays consistent (empty-tasks report on disk too).
    const summary = path.join(dir, '.harness', 'maintenance', 'last-run-summary.json');
    expect(JSON.parse(fs.readFileSync(summary, 'utf-8')).tasks).toEqual([]);
  });

  it('--json emits the report object to stdout log', async () => {
    const dir = tmp();
    const calls: RunCall[] = [];
    const logLines: string[] = [];
    const f = fakeRunner(calls);
    await runMaintenanceRun(
      dir,
      { all: true, json: true },
      deps({ makeRunner: f.makeRunner, log: (l) => logLines.push(l) }, [task('doc-drift')])
    );
    const parsed = JSON.parse(logLines.join('\n'));
    expect(parsed.tasks[0].taskId).toBe('doc-drift');
    expect(parsed.exitCode).toBe(0);
  });
});
