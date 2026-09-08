import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createMaintenanceCommand } from '../../src/commands/maintenance';

interface RunOutcome {
  exitCode: number | null;
  out: string[];
  err: string[];
}

async function run(argv: string[]): Promise<RunOutcome> {
  const cmd = createMaintenanceCommand();

  let exitCode: number | null = null;
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__exit__:${exitCode}`);
  }) as never);
  const out: string[] = [];
  const err: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((m?: unknown) => {
    out.push(String(m));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((m?: unknown) => {
    err.push(String(m));
  });

  const args = argv[0] === 'maintenance' ? argv.slice(1) : argv;
  try {
    await cmd.parseAsync(args, { from: 'user' });
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
  } finally {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
  return { exitCode, out, err };
}

function seedEntry(root: string, taskId: string, entry: Record<string, unknown>): void {
  const dir = path.join(root, '.harness', 'maintenance', taskId, 'outputs');
  fs.mkdirSync(dir, { recursive: true });
  const iso = String(entry.completedAt);
  const name = `${iso.replace(/:/g, '-')}.json`;
  fs.writeFileSync(path.join(dir, name), JSON.stringify(entry));
}

describe('maintenance list', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maint-cov-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('prints a human-readable table of the built-in tasks', async () => {
    const { exitCode, out } = await run(['maintenance', 'list', '--path', tmp]);
    expect(exitCode).toBe(0);
    const joined = out.join('\n');
    expect(joined).toContain('ID');
    expect(joined).toContain('SCHEDULE');
    // built-in tasks always exist, so at least one row renders
    expect(out.length).toBeGreaterThan(1);
  });

  it('emits JSON when --json is passed', async () => {
    const { exitCode, out } = await run(['maintenance', 'list', '--json', '--path', tmp]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(out.join('\n'));
    expect(Array.isArray(parsed.tasks)).toBe(true);
    expect(parsed.tasks.length).toBeGreaterThan(0);
    expect(parsed.tasks[0]).toHaveProperty('origin');
  });
});

describe('maintenance show', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maint-show-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('rejects an invalid task id', async () => {
    const { exitCode, err } = await run(['maintenance', 'show', 'BAD_ID', '--path', tmp]);
    expect(exitCode).toBe(2);
    expect(err.join('\n')).toContain('Invalid task id');
  });

  it('reports no persisted runs for a valid but empty task', async () => {
    const { exitCode, out } = await run(['maintenance', 'show', 'doc-drift', '--path', tmp]);
    expect(exitCode).toBe(0);
    expect(out.join('\n')).toContain('No persisted runs');
  });

  it('renders persisted entries with mixed statuses, origins, PR urls and errors', async () => {
    seedEntry(tmp, 'doc-drift', {
      taskId: 'doc-drift',
      startedAt: '2026-05-17T10:00:00.000Z',
      completedAt: '2026-05-17T10:05:00.000Z',
      status: 'success',
      findings: 0,
      fixed: 0,
      prUrl: 'https://gh/pr/1',
      prUpdated: true,
      origin: 'schedule',
    });
    seedEntry(tmp, 'doc-drift', {
      taskId: 'doc-drift',
      startedAt: '2026-05-18T10:00:00.000Z',
      completedAt: '2026-05-18T10:05:00.000Z',
      status: 'failure',
      findings: 3,
      fixed: 0,
      prUrl: null,
      prUpdated: false,
      error: 'the check exploded',
      origin: { kind: 'api', tokenName: 'ci-bot' },
    });
    seedEntry(tmp, 'doc-drift', {
      taskId: 'doc-drift',
      startedAt: '2026-05-19T10:00:00.000Z',
      completedAt: '2026-05-19T10:05:00.000Z',
      status: 'no-issues',
      findings: 0,
      fixed: 0,
      prUrl: null,
      prUpdated: false,
      origin: { kind: 'chain', upstreamTaskId: 'lint' },
    });

    const { exitCode, out } = await run(['maintenance', 'show', 'doc-drift', '--path', tmp]);
    expect(exitCode).toBe(0);
    const joined = out.join('\n');
    expect(joined).toContain('run(s) for doc-drift');
    expect(joined).toContain('the check exploded');
    expect(joined).toContain('PR=https://gh/pr/1');
    expect(joined).toContain('api:ci-bot');
    expect(joined).toContain('chain:lint');
  });

  it('emits JSON entries with --json', async () => {
    seedEntry(tmp, 'doc-drift', {
      taskId: 'doc-drift',
      startedAt: '2026-05-17T10:00:00.000Z',
      completedAt: '2026-05-17T10:05:00.000Z',
      status: 'warning',
      findings: 2,
      fixed: 1,
      prUrl: null,
      prUpdated: false,
    });
    const { exitCode, out } = await run([
      'maintenance',
      'show',
      'doc-drift',
      '--json',
      '--path',
      tmp,
    ]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(out.join('\n'));
    expect(parsed.taskId).toBe('doc-drift');
    expect(parsed.entries).toHaveLength(1);
  });

  it('honors --limit', async () => {
    for (let i = 0; i < 3; i++) {
      seedEntry(tmp, 'doc-drift', {
        taskId: 'doc-drift',
        startedAt: `2026-05-1${i}T10:00:00.000Z`,
        completedAt: `2026-05-1${i}T10:05:00.000Z`,
        status: 'success',
        findings: 0,
        fixed: 0,
        prUrl: null,
        prUpdated: false,
      });
    }
    const { exitCode, out } = await run([
      'maintenance',
      'show',
      'doc-drift',
      '--limit',
      '2',
      '--json',
      '--path',
      tmp,
    ]);
    expect(exitCode).toBe(0);
    expect(JSON.parse(out.join('\n')).entries).toHaveLength(2);
  });
});
