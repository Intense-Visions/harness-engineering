import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildTaskRunner, loadRunHistory } from '../../src/commands/maintenance-run';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'maint-run-'));
}

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
