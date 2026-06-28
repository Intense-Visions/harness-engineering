import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runMaintenanceRun } from '../../src/commands/maintenance-run';

/**
 * Controlled fake "harness" binary. The runner resolves a task's `checkCommand`
 * (a harness subcommand argv) through this entry via `process.execPath`, so the
 * integration test exercises the REAL createCheckRunner spawn path — it cannot
 * silently regress to a no-op. Branches:
 *   - report-good   → JSON status line {success, candidatesFound:2}, exit 0
 *   - report-find   → "3 issues" on stdout, exit 1   (ran, found issues)
 *   - report-broken → "unknown command" on stderr, exit 1 (could not run)
 */
const FAKE_HARNESS = `
const [sub] = process.argv.slice(2);
if (sub === 'report-good') {
  process.stdout.write(JSON.stringify({ status: 'success', candidatesFound: 2 }) + '\\n');
  process.exit(0);
}
if (sub === 'report-find') { process.stdout.write('Found 3 issues\\n'); process.exit(1); }
if (sub === 'report-broken') { process.stderr.write("error: unknown command 'report-broken'\\n"); process.exit(1); }
process.exit(0);
`;

let fixtureDir: string;
let fakeEntry: string;

beforeAll(() => {
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maint-int-fake-'));
  fakeEntry = path.join(fixtureDir, 'fake-harness.js');
  fs.writeFileSync(fakeEntry, FAKE_HARNESS, 'utf-8');
});

afterAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

function reportTask(id: string, checkCommand: string[]) {
  return {
    id,
    type: 'report-only',
    description: 'fixture',
    schedule: '0 2 * * *',
    branch: null,
    checkCommand,
  };
}

describe('maintenance run — standalone (no orchestrator/gateway/ClaimManager)', () => {
  it('runs a report-only task end-to-end through the harness binary and writes last-run-summary.json', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'maint-int-'));
    const res = await runMaintenanceRun(
      cwd,
      { all: true },
      {
        harnessEntry: fakeEntry,
        loadTasks: async () => [reportTask('fixture-report', ['report-good']) as never],
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

  it('reports REAL findings for a subcommand that ran and found issues', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'maint-int-'));
    const res = await runMaintenanceRun(
      cwd,
      { all: true },
      {
        harnessEntry: fakeEntry,
        loadTasks: async () => [reportTask('fixture-find', ['report-find']) as never],
        loadHistory: async () => [],
        now: new Date('2026-06-27T12:00:00.000Z'),
      }
    );
    expect(res.exitCode).toBe(0); // findings are not failures
    const row = res.report!.tasks.find((t) => t.taskId === 'fixture-find')!;
    expect(row.status).toBe('success');
    expect(row.findings).toBe(3);
  });

  it('reports a check that could NOT run as failure with exit code 1 (not phantom 1-finding success)', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'maint-int-'));
    const res = await runMaintenanceRun(
      cwd,
      { all: true },
      {
        harnessEntry: fakeEntry,
        loadTasks: async () => [reportTask('fixture-broken', ['report-broken']) as never],
        loadHistory: async () => [],
        now: new Date('2026-06-27T12:00:00.000Z'),
      }
    );
    expect(res.exitCode).toBe(1);
    const row = res.report!.tasks.find((t) => t.taskId === 'fixture-broken')!;
    expect(row.status).toBe('failure');
    expect(row.findings).toBe(0);
  });
});
