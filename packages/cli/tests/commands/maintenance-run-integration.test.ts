import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runMaintenanceRun } from '../../src/commands/maintenance-run';

describe('maintenance run — standalone (no orchestrator/gateway/ClaimManager)', () => {
  it('runs a report-only task end-to-end and writes last-run-summary.json', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'maint-int-'));
    const task = {
      id: 'fixture-report',
      type: 'report-only',
      description: 'fixture',
      schedule: '0 2 * * *',
      branch: null,
      checkCommand: [
        'node',
        '-e',
        'console.log(JSON.stringify({status:"success",candidatesFound:2}))',
      ],
    };
    const res = await runMaintenanceRun(
      cwd,
      { all: true },
      {
        loadTasks: async () => [task as never],
        loadHistory: async () => [],
        now: new Date('2026-06-27T12:00:00.000Z'),
      }
    );
    expect(res.exitCode).toBe(0);
    const summary = path.join(cwd, '.harness', 'maintenance', 'last-run-summary.json');
    expect(fs.existsSync(summary)).toBe(true);
    const report = JSON.parse(fs.readFileSync(summary, 'utf-8'));
    const row = report.tasks.find((t: { taskId: string }) => t.taskId === 'fixture-report');
    expect(row.findings).toBe(2);
    expect(row.status).toBe('success');
  });
});
