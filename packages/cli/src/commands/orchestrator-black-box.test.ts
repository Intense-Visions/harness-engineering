import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import { Command } from 'commander';
import { createBlackBoxCommand } from './orchestrator-black-box';

/**
 * Unit contract for `harness orchestrator black-box list|show`. Pins the CURRENT
 * rendering behavior of the command: how it enumerates FlightRecorder run
 * records (`list`) and how it renders provenance, per-unit verdicts + gate
 * reasons, and stream-derived tool-use (`show <runId>`).
 *
 * Fully hermetic: `FlightRecorder` (the only source of run data) and `node:fs`
 * (the only source of stream/tool-use data) are mocked, so there is no real IO,
 * no subprocess, and no git. `console.log`/`console.error` (the logger's sinks)
 * are spied so nothing prints for real, and `process.exitCode` is saved and
 * restored around every test.
 */

const hoisted = vi.hoisted(() => ({
  listRunsMock: vi.fn(),
  getRunMock: vi.fn(),
  readdirSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

vi.mock('@harness-engineering/orchestrator', () => ({
  FlightRecorder: {
    listRuns: hoisted.listRunsMock,
    getRun: hoisted.getRunMock,
  },
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readdirSync: hoisted.readdirSyncMock,
    readFileSync: hoisted.readFileSyncMock,
  };
});

const DEFAULT_DIR = '.harness/black-box';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeUnit(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    issueId: 'issue-1',
    identifier: 'ISSUE-1',
    verdict: 'shipped',
    attempt: 1,
    gateBlocks: 0,
    updatedAt: '2026-07-20T12:34:56.000Z',
    ...overrides,
  };
}

function makeRun(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runId: 'run-abc',
    orchestratorId: 'orch-1',
    startedAt: '2026-07-20T12:34:56.000Z',
    endedAt: '2026-07-20T13:00:00.000Z',
    provenance: {
      gitHead: 'abcdef1234567',
      gitSubject: 'fix: land the thing',
      branch: 'feat/x',
      harnessVersion: '9.9.9',
      node: 'v20.0.0',
      backends: [{ name: 'coder', type: 'ollama', model: 'qwen3', endpoint: 'http://x' }],
      routing: { default: 'coder', modes: { design: 'reasoner' } },
    },
    units: { 'issue-1': makeUnit() },
    ...overrides,
  };
}

describe('harness orchestrator black-box — command contract', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    hoisted.listRunsMock.mockReset();
    hoisted.getRunMock.mockReset();
    hoisted.readdirSyncMock.mockReset();
    hoisted.readFileSyncMock.mockReset();

    // Default: no stream files on disk (readdirSync throws ENOENT-style).
    hoisted.readdirSyncMock.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    hoisted.readFileSyncMock.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    savedExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = savedExitCode;
  });

  function makeProgram(): Command {
    const program = new Command();
    program.addCommand(createBlackBoxCommand());
    return program;
  }

  async function runCli(args: string[]): Promise<void> {
    await makeProgram().parseAsync(['node', 'harness', 'black-box', ...args]);
  }

  function joinedLog(): string {
    return logSpy.mock.calls.map((c: unknown[]) => c.map(String).join(' ')).join('\n');
  }

  function joinedErr(): string {
    return errSpy.mock.calls.map((c: unknown[]) => c.map(String).join(' ')).join('\n');
  }

  const resolvedDefaultDir = path.resolve(process.cwd(), DEFAULT_DIR);

  // ── list ──────────────────────────────────────────────────────────────────
  it('list reads the default dir and reports when no runs are recorded', async () => {
    hoisted.listRunsMock.mockReturnValue([]);

    await runCli(['list']);

    expect(hoisted.listRunsMock).toHaveBeenCalledWith(resolvedDefaultDir);
    // toContain, not RegExp: on Windows the resolved path has backslashes that would be invalid regex escapes.
    expect(joinedLog()).toContain(`No black-box runs found under ${resolvedDefaultDir}`);
  });

  it('list renders a header plus one row per run with short git sha, unit count, and verdict summary', async () => {
    hoisted.listRunsMock.mockReturnValue([
      makeRun({
        runId: 'run-newest',
        units: {
          'issue-1': makeUnit({ issueId: 'issue-1', verdict: 'shipped' }),
          'issue-2': makeUnit({ issueId: 'issue-2', verdict: 'gate-blocked' }),
        },
      }),
    ]);

    await runCli(['list']);

    const out = joinedLog();
    // Header columns.
    expect(out).toMatch(/RUN\s+STARTED\s+GIT\s+UNITS\s+VERDICTS/);
    // Row: runId, short 7-char sha, unit count (2), and both verdicts summarized.
    expect(out).toMatch(/run-newest/);
    expect(out).toMatch(/abcdef1\b/);
    expect(out).toMatch(/1 shipped/);
    expect(out).toMatch(/1 gate-blocked/);
    // Started timestamp is normalized to "YYYY-MM-DD HH:MM".
    expect(out).toMatch(/2026-07-20 12:34/);
  });

  it('list falls back to an em-dash for a null git head', async () => {
    hoisted.listRunsMock.mockReturnValue([
      makeRun({ provenance: { ...(makeRun().provenance as object), gitHead: null } }),
    ]);

    await runCli(['list']);

    // The run row is present but the GIT column shows the dash placeholder.
    expect(joinedLog()).toMatch(/run-abc.*—/);
  });

  it('list honors a custom --dir (resolved against cwd)', async () => {
    hoisted.listRunsMock.mockReturnValue([]);

    await runCli(['list', '--dir', 'custom/bb']);

    expect(hoisted.listRunsMock).toHaveBeenCalledWith(path.resolve(process.cwd(), 'custom/bb'));
  });

  // ── show: missing run ───────────────────────────────────────────────────────
  it('show reports a missing run to stderr and sets a failing exit code', async () => {
    hoisted.getRunMock.mockReturnValue(null);

    await runCli(['show', 'ghost']);

    expect(hoisted.getRunMock).toHaveBeenCalledWith(resolvedDefaultDir, 'ghost');
    expect(joinedErr()).toMatch(/No black-box run 'ghost' under/);
    expect(process.exitCode).toBe(1);
  });

  // ── show: header rendering ──────────────────────────────────────────────────
  it('show renders provenance: run id, orchestrator, git, node/harness, backends, and routing', async () => {
    hoisted.getRunMock.mockReturnValue(makeRun());

    await runCli(['show', 'run-abc']);

    const out = joinedLog();
    expect(out).toMatch(/Run run-abc {2}\(orch-1\)/);
    expect(out).toMatch(/started: 2026-07-20T12:34:56\.000Z/);
    expect(out).toMatch(/ended: 2026-07-20T13:00:00\.000Z/);
    expect(out).toMatch(/git: {5}abcdef1 "fix: land the thing" {2}\(branch feat\/x\)/);
    expect(out).toMatch(/node: {4}v20\.0\.0 {3}harness: 9\.9\.9/);
    // Backend line: name, type, then model + endpoint.
    expect(out).toMatch(/coder\s+ollama\s+qwen3\s+http:\/\/x/);
    // Routing default + modes.
    expect(out).toMatch(/routing: default=coder {2}modes=\{design:reasoner\}/);
    expect(process.exitCode).not.toBe(1);
  });

  it('show renders a not-sealed marker when the run has no end time', async () => {
    hoisted.getRunMock.mockReturnValue(makeRun({ endedAt: null }));

    await runCli(['show', 'run-abc']);

    expect(joinedLog()).toMatch(/ended: \(still running \/ not sealed\)/);
  });

  it('show renders em-dash fallbacks for a null orchestrator and empty git subject', async () => {
    hoisted.getRunMock.mockReturnValue(
      makeRun({
        orchestratorId: null,
        provenance: {
          ...(makeRun().provenance as object),
          gitSubject: null,
          branch: null,
        },
      })
    );

    await runCli(['show', 'run-abc']);

    const out = joinedLog();
    expect(out).toMatch(/Run run-abc {2}\(—\)/);
    expect(out).toMatch(/\(branch —\)/);
  });

  // ── show: units ─────────────────────────────────────────────────────────────
  it('show renders each unit with verdict, attempt, gate-blocks, and PR number', async () => {
    hoisted.getRunMock.mockReturnValue(
      makeRun({
        units: {
          'issue-1': makeUnit({
            identifier: 'ISSUE-1',
            verdict: 'shipped',
            attempt: 2,
            gateBlocks: 1,
            pr: 945,
          }),
        },
      })
    );

    await runCli(['show', 'run-abc']);

    expect(joinedLog()).toMatch(/ISSUE-1 {2}\[shipped\] {2}attempt 2 {2}gate-blocks 1 {2}PR #945/);
  });

  it('show renders only the first four lines of a multi-line gate reason', async () => {
    const gateLines = ['reason-1', 'reason-2', 'reason-3', 'reason-4', 'reason-5-hidden'];
    hoisted.getRunMock.mockReturnValue(
      makeRun({
        units: {
          'issue-1': makeUnit({
            verdict: 'gate-blocked',
            gateReason: gateLines.join('\n'),
          }),
        },
      })
    );

    await runCli(['show', 'run-abc']);

    const out = joinedLog();
    expect(out).toMatch(/gate reason: reason-1/);
    // The fourth line is retained...
    expect(out).toContain('reason-4');
    // ...but the fifth (beyond the 4-line window) is dropped.
    expect(out).not.toContain('reason-5-hidden');
  });

  // ── show: tool-use aggregation from streams ─────────────────────────────────
  it('show aggregates tool_execution_start events per unit and renders them by descending count', async () => {
    hoisted.getRunMock.mockReturnValue(
      makeRun({ units: { 'issue-1': makeUnit({ issueId: 'issue-1' }) } })
    );

    // One stream directory with a single jsonl file (and a non-jsonl file to ignore).
    hoisted.readdirSyncMock.mockReturnValue(['a.jsonl', 'notes.txt']);
    hoisted.readFileSyncMock.mockReturnValue(
      [
        JSON.stringify({ type: 'tool_execution_start', subtype: 'edit' }),
        JSON.stringify({ type: 'tool_execution_start', subtype: 'bash' }),
        JSON.stringify({ type: 'tool_execution_start', subtype: 'edit' }),
        JSON.stringify({ type: 'assistant_message', subtype: 'ignored' }),
        'not-json-at-all',
        '',
      ].join('\n')
    );

    await runCli(['show', 'run-abc']);

    // Only .jsonl files are read.
    expect(hoisted.readFileSyncMock).toHaveBeenCalledTimes(1);
    const readPath = String(hoisted.readFileSyncMock.mock.calls[0]![0]);
    expect(readPath.replaceAll('\\', '/')).toMatch(/streams\/issue-1\/a\.jsonl$/);
    // edit(2) sorted before bash(1); non-tool and invalid lines are ignored.
    expect(joinedLog()).toMatch(/tools: edit x2, bash x1/);
  });

  it('show omits the tools line when the unit has no readable stream directory', async () => {
    hoisted.getRunMock.mockReturnValue(makeRun());
    // Default beforeEach: readdirSync throws -> no tools counted.

    await runCli(['show', 'run-abc']);

    expect(joinedLog()).not.toMatch(/tools:/);
  });

  it('show labels a tool_execution_start with no subtype as "?"', async () => {
    hoisted.getRunMock.mockReturnValue(makeRun());
    hoisted.readdirSyncMock.mockReturnValue(['a.jsonl']);
    hoisted.readFileSyncMock.mockReturnValue(JSON.stringify({ type: 'tool_execution_start' }));

    await runCli(['show', 'run-abc']);

    expect(joinedLog()).toMatch(/tools: \? x1/);
  });
});
