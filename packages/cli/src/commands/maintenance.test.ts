import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { createMaintenanceCommand } from './maintenance';
import { ExitCode } from '../utils/errors';

/**
 * Behavior contract for the `harness maintenance` command surface. The
 * task-resolution helpers are pinned in maintenance-config.test.ts and the
 * run-pipeline in the maintenance-run-*.test.ts files; here we characterize the
 * CURRENT behavior of this file's own action + render layers: the `list` table /
 * JSON projection, the `show` task-id validation + persisted-run rendering
 * (status colour, origin labels, PR/error lines), and that `run` threads its
 * flags into `runMaintenanceRun` and exits with its code.
 *
 * Hermetic: the config loader, the orchestrator `TaskOutputStore`, and the
 * run-pipeline are stubbed, so no real filesystem, config, or dispatch runs.
 */

const hoisted = vi.hoisted(() => ({
  loadConfigMock: vi.fn(),
  mergeTasksMock: vi.fn(),
  listMock: vi.fn(),
  runMaintenanceRunMock: vi.fn(),
  storeCtorMock: vi.fn(),
}));

vi.mock('./maintenance-config', () => ({
  loadMaintenanceConfig: hoisted.loadConfigMock,
  mergeResolvedTasks: hoisted.mergeTasksMock,
}));
vi.mock('./maintenance-run', () => ({ runMaintenanceRun: hoisted.runMaintenanceRunMock }));
vi.mock('@harness-engineering/orchestrator', () => ({
  TaskOutputStore: class {
    constructor(opts: unknown) {
      hoisted.storeCtorMock(opts);
    }
    list = hoisted.listMock;
  },
}));

class ProcessExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
  }
}

const entry = (over: Record<string, unknown> = {}) => ({
  taskId: 'dep-audit',
  startedAt: '2026-01-01T00:00:00Z',
  completedAt: '2026-01-01T00:01:00Z',
  status: 'success',
  findings: 2,
  fixed: 0,
  prUrl: null,
  prUpdated: false,
  ...over,
});

async function runCommand(argv: string[]): Promise<{ code: number | null; out: string }> {
  const lines: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    lines.push(a.map(String).join(' '));
  });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    lines.push(a.map(String).join(' '));
  });
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ProcessExitError(code ?? 0);
  }) as never);
  const program = new Command();
  program.addCommand(createMaintenanceCommand());
  let code: number | null = null;
  try {
    await program.parseAsync(['node', 'harness', 'maintenance', ...argv]);
  } catch (err) {
    if (err instanceof ProcessExitError) code = err.code;
    else throw err;
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  }
  return { code, out: lines.join('\n') };
}

beforeEach(() => {
  for (const m of Object.values(hoisted)) m.mockReset();
  hoisted.loadConfigMock.mockResolvedValue({ enabled: true });
  hoisted.mergeTasksMock.mockReturnValue([]);
  hoisted.listMock.mockResolvedValue([]);
  hoisted.runMaintenanceRunMock.mockResolvedValue({ exitCode: ExitCode.SUCCESS });
});

afterEach(() => vi.restoreAllMocks());

describe('maintenance list', () => {
  it('renders "No tasks defined." for an empty resolved set and exits SUCCESS', async () => {
    const { code, out } = await runCommand(['list']);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(out).toContain('No tasks defined.');
  });

  it('renders a table projecting built-in vs custom origin', async () => {
    hoisted.mergeTasksMock.mockReturnValue([
      { id: 'dep-audit', isCustom: false, type: 'dependency', schedule: 'weekly' },
      { id: 'my-task', isCustom: true, type: 'custom-check', schedule: 'daily' },
    ]);
    const { code, out } = await runCommand(['list']);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(out).toContain('ID');
    expect(out).toContain('dep-audit');
    expect(out).toContain('built-in');
    expect(out).toContain('my-task');
    expect(out).toContain('custom');
  });

  it('emits JSON rows under --json', async () => {
    hoisted.mergeTasksMock.mockReturnValue([
      { id: 'dep-audit', isCustom: false, type: 'dependency', schedule: 'weekly' },
    ]);
    const { out } = await runCommand(['list', '--json']);
    const parsed = JSON.parse(out);
    expect(parsed.tasks).toEqual([
      { id: 'dep-audit', origin: 'built-in', type: 'dependency', schedule: 'weekly' },
    ]);
  });
});

describe('maintenance show', () => {
  it('rejects an invalid task id and exits ERROR before touching the store', async () => {
    const { code, out } = await runCommand(['show', 'Bad_Id']);
    expect(code).toBe(ExitCode.ERROR);
    expect(out).toContain("Invalid task id 'Bad_Id'");
    expect(hoisted.storeCtorMock).not.toHaveBeenCalled();
  });

  it('renders the empty-history message when a task has no persisted runs', async () => {
    hoisted.listMock.mockResolvedValue([]);
    const { code, out } = await runCommand(['show', 'dep-audit']);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(out).toContain("No persisted runs for task 'dep-audit' yet.");
  });

  it('renders persisted runs with status, origin label, PR and error lines', async () => {
    hoisted.listMock.mockResolvedValue([
      entry({ status: 'failure', findings: 5, error: 'exploded', origin: 'schedule' }),
      entry({ status: 'success', prUrl: 'https://pr/1', origin: { kind: 'api', tokenName: 'ci' } }),
      entry({ status: 'in-progress', origin: { kind: 'chain', upstreamTaskId: 'up' } }),
    ]);
    const { code, out } = await runCommand(['show', 'dep-audit', '--limit', '3']);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(out).toContain('Last 3 run(s) for dep-audit:');
    expect(out).toContain('failure');
    expect(out).toContain('exploded');
    expect(out).toContain('origin=schedule');
    expect(out).toContain('PR=https://pr/1');
    expect(out).toContain('origin=api:ci');
    expect(out).toContain('origin=chain:up');
  });

  it('honors --limit when building the store query', async () => {
    hoisted.listMock.mockResolvedValue([]);
    await runCommand(['show', 'dep-audit', '--limit', '2']);
    expect(hoisted.listMock).toHaveBeenCalledWith('dep-audit', 2, 0);
  });

  it('emits JSON under --json', async () => {
    hoisted.listMock.mockResolvedValue([entry()]);
    const { out } = await runCommand(['show', 'dep-audit', '--json']);
    const parsed = JSON.parse(out);
    expect(parsed.taskId).toBe('dep-audit');
    expect(parsed.entries).toHaveLength(1);
  });
});

describe('maintenance run', () => {
  it('threads flags into runMaintenanceRun and exits with its code', async () => {
    hoisted.runMaintenanceRunMock.mockResolvedValue({ exitCode: ExitCode.VALIDATION_FAILED });
    const { code } = await runCommand(['run', 'dep-audit', '--fix', '--only', 'a,b']);
    expect(code).toBe(ExitCode.VALIDATION_FAILED);
    expect(hoisted.runMaintenanceRunMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ positional: ['dep-audit'], fix: true, only: 'a,b' })
    );
  });
});
