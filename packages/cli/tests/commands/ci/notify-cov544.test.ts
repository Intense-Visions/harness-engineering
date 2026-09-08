import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// --- Mock state (hoisted so the module factories can close over it) ---
const state = vi.hoisted(() => ({
  config: { ok: true, value: {} as Record<string, unknown> } as
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; error: { message: string } },
  prResult: { ok: true } as { ok: boolean; error?: { message: string } },
  issueResult: { ok: true, value: { url: 'https://gh/issue/1', number: 1 } } as {
    ok: boolean;
    value?: { url: string; number: number };
    error?: { message: string };
  },
}));

vi.mock('../../../src/config/loader', () => ({
  resolveConfig: () => state.config,
}));

vi.mock('@harness-engineering/core', () => ({
  GitHubIssuesSyncAdapter: class {
    constructor(_opts: unknown) {}
  },
  CINotifier: class {
    constructor(_adapter: unknown, _repo: string) {}
    async notifyPR() {
      return state.prResult;
    }
    async notifyIssue() {
      return state.issueResult;
    }
  },
}));

import { createNotifyCommand } from '../../../src/commands/ci/notify';
import { Command } from 'commander';
import { logger } from '../../../src/output/logger';

function makeReport(exitCode: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-cov-'));
  const p = path.join(dir, 'report.json');
  fs.writeFileSync(p, JSON.stringify({ exitCode, checks: [] }));
  return p;
}

interface RunOutcome {
  exitCode: number | null;
  logs: string[];
}

async function runNotify(args: string[], globalFlags: string[] = []): Promise<RunOutcome> {
  const program = new Command();
  program.option('--json');
  program.option('--quiet');
  program.option('--verbose');
  program.option('--config <path>');
  program.addCommand(createNotifyCommand());
  program.exitOverride();

  let exitCode: number | null = null;
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__exit__:${exitCode}`);
  }) as never);

  const logs: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((m?: unknown) => {
    logs.push(String(m));
  });

  try {
    await program.parseAsync([...globalFlags, 'notify', ...args], { from: 'user' });
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith('__exit__')) throw err;
  } finally {
    exitSpy.mockRestore();
    logSpy.mockRestore();
  }
  return { exitCode, logs };
}

describe('notify command — error guards', () => {
  const goodConfig = { roadmap: { tracker: { kind: 'github', repo: 'o/r' } } };

  beforeEach(() => {
    state.config = { ok: true, value: goodConfig };
    state.prResult = { ok: true };
    state.issueResult = { ok: true, value: { url: 'https://gh/issue/1', number: 1 } };
    process.env.GITHUB_TOKEN = 'tok';
    delete process.env.GH_TOKEN;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
  });

  it('exits ERROR when the report cannot be read', async () => {
    const { exitCode } = await runNotify(['/nonexistent/report.json', '--target', 'pr-comment']);
    expect(exitCode).toBe(2);
  });

  it('exits ERROR when config resolution fails', async () => {
    state.config = { ok: false, error: { message: 'bad config' } };
    const report = makeReport(1);
    const { exitCode } = await runNotify([report, '--target', 'issue']);
    expect(exitCode).toBe(2);
  });

  it('exits ERROR when no github tracker is configured', async () => {
    state.config = { ok: true, value: { roadmap: {} } };
    const report = makeReport(1);
    const { exitCode } = await runNotify([report, '--target', 'issue']);
    expect(exitCode).toBe(2);
  });

  it('exits ERROR when tracker kind is not github', async () => {
    state.config = { ok: true, value: { roadmap: { tracker: { kind: 'gitlab', repo: 'o/r' } } } };
    const report = makeReport(1);
    const { exitCode } = await runNotify([report, '--target', 'issue']);
    expect(exitCode).toBe(2);
  });

  it('exits ERROR when no github token is present', async () => {
    delete process.env.GITHUB_TOKEN;
    const report = makeReport(1);
    const { exitCode } = await runNotify([report, '--target', 'issue']);
    expect(exitCode).toBe(2);
  });

  it('reads GH_TOKEN as a fallback token', async () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = 'ghtok';
    const report = makeReport(1);
    const { exitCode } = await runNotify([report, '--target', 'issue']);
    delete process.env.GH_TOKEN;
    // No error exit — issue was created.
    expect(exitCode).toBeNull();
  });

  it('exits ERROR for an unknown target', async () => {
    const report = makeReport(1);
    const { exitCode } = await runNotify([report, '--target', 'nope']);
    expect(exitCode).toBe(2);
  });
});

describe('notify command — pr-comment target', () => {
  beforeEach(() => {
    state.config = { ok: true, value: { roadmap: { tracker: { kind: 'github', repo: 'o/r' } } } };
    state.prResult = { ok: true };
    process.env.GITHUB_TOKEN = 'tok';
  });
  afterEach(() => delete process.env.GITHUB_TOKEN);

  it('requires --pr for pr-comment', async () => {
    const report = makeReport(1);
    const { exitCode } = await runNotify([report, '--target', 'pr-comment']);
    expect(exitCode).toBe(2);
  });

  it('rejects a non-numeric --pr', async () => {
    const report = makeReport(1);
    const { exitCode } = await runNotify([report, '--target', 'pr-comment', '--pr', 'abc']);
    expect(exitCode).toBe(2);
  });

  it('exits ERROR when posting the PR comment fails', async () => {
    state.prResult = { ok: false, error: { message: 'api down' } };
    const report = makeReport(1);
    const { exitCode } = await runNotify([report, '--target', 'pr-comment', '--pr', '5']);
    expect(exitCode).toBe(2);
  });

  it('emits JSON on a successful PR comment in --json mode', async () => {
    const report = makeReport(1);
    const successSpy = vi.spyOn(logger, 'success').mockImplementation(() => {});
    const { exitCode, logs } = await runNotify(
      [report, '--target', 'pr-comment', '--pr', '5'],
      ['--json']
    );
    successSpy.mockRestore();
    expect(exitCode).toBeNull();
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toMatchObject({ target: 'pr-comment', pr: 5, status: 'posted' });
  });

  it('logs success text on a successful PR comment (text mode)', async () => {
    const report = makeReport(1);
    const successSpy = vi.spyOn(logger, 'success').mockImplementation(() => {});
    const { exitCode } = await runNotify([report, '--target', 'pr-comment', '--pr', '7']);
    expect(exitCode).toBeNull();
    expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('#7'));
    successSpy.mockRestore();
  });

  it('stays silent on a successful PR comment in --quiet mode', async () => {
    const report = makeReport(1);
    const successSpy = vi.spyOn(logger, 'success').mockImplementation(() => {});
    const { exitCode } = await runNotify(
      [report, '--target', 'pr-comment', '--pr', '9'],
      ['--quiet']
    );
    expect(exitCode).toBeNull();
    expect(successSpy).not.toHaveBeenCalled();
    successSpy.mockRestore();
  });
});

describe('notify command — issue target', () => {
  beforeEach(() => {
    state.config = { ok: true, value: { roadmap: { tracker: { kind: 'github', repo: 'o/r' } } } };
    state.issueResult = { ok: true, value: { url: 'https://gh/issue/42', number: 42 } };
    process.env.GITHUB_TOKEN = 'tok';
  });
  afterEach(() => delete process.env.GITHUB_TOKEN);

  it('skips issue creation when the report has no failures (text)', async () => {
    const dimSpy = vi.spyOn(logger, 'dim').mockImplementation(() => {});
    const report = makeReport(0);
    const { exitCode } = await runNotify([report, '--target', 'issue']);
    expect(exitCode).toBeNull();
    expect(dimSpy).toHaveBeenCalled();
    dimSpy.mockRestore();
  });

  it('reports a skip as JSON when there are no failures', async () => {
    const report = makeReport(0);
    const { exitCode, logs } = await runNotify([report, '--target', 'issue'], ['--json']);
    expect(exitCode).toBeNull();
    expect(JSON.parse(logs[0]!)).toMatchObject({ status: 'skipped', reason: 'no failures' });
  });

  it('creates an issue and logs success (text), honoring --title and --labels', async () => {
    const successSpy = vi.spyOn(logger, 'success').mockImplementation(() => {});
    const report = makeReport(1);
    const { exitCode } = await runNotify([
      report,
      '--target',
      'issue',
      '--title',
      'Custom title',
      '--labels',
      'bug, ci',
    ]);
    expect(exitCode).toBeNull();
    expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('https://gh/issue/42'));
    successSpy.mockRestore();
  });

  it('emits JSON with the created issue in --json mode', async () => {
    const report = makeReport(1);
    const { exitCode, logs } = await runNotify([report, '--target', 'issue'], ['--json']);
    expect(exitCode).toBeNull();
    expect(JSON.parse(logs[0]!)).toMatchObject({ target: 'issue', status: 'created', number: 42 });
  });

  it('exits ERROR when issue creation fails', async () => {
    state.issueResult = { ok: false, error: { message: 'create failed' } };
    const report = makeReport(1);
    const { exitCode } = await runNotify([report, '--target', 'issue']);
    expect(exitCode).toBe(2);
  });
});
