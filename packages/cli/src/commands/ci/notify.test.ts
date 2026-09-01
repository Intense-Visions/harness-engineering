import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { createNotifyCommand } from './notify';
import { ExitCode } from '../../utils/errors';

/**
 * Behavior contract for `harness ci notify`. Characterizes the CURRENT behavior
 * of the notify action's control flow: report loading, config/tracker/token
 * resolution precedence, the pr-comment vs issue vs unknown target branches, the
 * skip-on-success issue path, and the JSON output shapes — the guard rails a
 * refactor of this orchestration must not silently change.
 *
 * Fully hermetic: the config loader, the core `CINotifier` +
 * `GitHubIssuesSyncAdapter`, `fs.readFileSync`, `process.exit`, and console are
 * all stubbed, so no real subprocess, filesystem read, HTTP call, or process
 * exit occurs. The token-resolution fork (no token found) is characterized
 * as-is: it surfaces an error and exits non-zero.
 */

const hoisted = vi.hoisted(() => ({
  resolveConfigMock: vi.fn(),
  notifyPRMock: vi.fn(),
  notifyIssueMock: vi.fn(),
  adapterCtorMock: vi.fn(),
  notifierCtorMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: hoisted.readFileSyncMock };
});

vi.mock('../../config/loader', () => ({
  resolveConfig: hoisted.resolveConfigMock,
}));

vi.mock('@harness-engineering/core', () => ({
  GitHubIssuesSyncAdapter: class {
    constructor(args: unknown) {
      hoisted.adapterCtorMock(args);
    }
  },
  CINotifier: class {
    constructor(adapter: unknown, repo: string) {
      hoisted.notifierCtorMock(adapter, repo);
    }
    notifyPR = hoisted.notifyPRMock;
    notifyIssue = hoisted.notifyIssueMock;
  },
}));

/** Sentinel thrown by the mocked `process.exit` so control-flow halts like real exit. */
class ProcessExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
  }
}

const okReport = { exitCode: 0, project: 'demo', summary: { failed: 0 } };
const failReport = { exitCode: 1, project: 'demo', summary: { failed: 2 } };

const githubTracker = { kind: 'github', repo: 'owner/repo' };

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let savedToken: string | undefined;
let savedGhToken: string | undefined;

/** Drive the notify command through a parent program that carries the global --json flag. */
async function runNotify(argv: string[], report: unknown = failReport): Promise<number | null> {
  if (report === null) {
    hoisted.readFileSyncMock.mockImplementation(() => {
      throw new Error('ENOENT');
    });
  } else {
    hoisted.readFileSyncMock.mockReturnValue(JSON.stringify(report));
  }
  const program = new Command();
  program.option('--json').option('--quiet').option('--config <path>');
  program.addCommand(createNotifyCommand());
  try {
    await program.parseAsync(['node', 'harness', 'notify', ...argv]);
    return null;
  } catch (err) {
    if (err instanceof ProcessExitError) return err.code;
    throw err;
  }
}

beforeEach(() => {
  hoisted.resolveConfigMock.mockReset();
  hoisted.notifyPRMock.mockReset();
  hoisted.notifyIssueMock.mockReset();
  hoisted.adapterCtorMock.mockReset();
  hoisted.notifierCtorMock.mockReset();
  hoisted.readFileSyncMock.mockReset();

  // Default: a valid github tracker config.
  hoisted.resolveConfigMock.mockReturnValue({
    ok: true,
    value: { roadmap: { tracker: githubTracker } },
  });

  savedToken = process.env.GITHUB_TOKEN;
  savedGhToken = process.env.GH_TOKEN;
  process.env.GITHUB_TOKEN = 'tok-abc';
  delete process.env.GH_TOKEN;

  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new ProcessExitError(code ?? 0);
  }) as never);
});

afterEach(() => {
  if (savedToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = savedToken;
  if (savedGhToken === undefined) delete process.env.GH_TOKEN;
  else process.env.GH_TOKEN = savedGhToken;
  vi.restoreAllMocks();
});

describe('ci notify — report + config guards', () => {
  it('exits ERROR and reports when the report file cannot be read/parsed', async () => {
    const code = await runNotify(['report.json', '--target', 'issue'], null);
    expect(code).toBe(ExitCode.ERROR);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('report.json')
    );
    // Never constructs a notifier when the report is unreadable.
    expect(hoisted.notifierCtorMock).not.toHaveBeenCalled();
  });

  it('exits ERROR when config resolution fails', async () => {
    hoisted.resolveConfigMock.mockReturnValue({ ok: false, error: { message: 'bad config' } });
    const code = await runNotify(['report.json', '--target', 'issue']);
    expect(code).toBe(ExitCode.ERROR);
    expect(errorSpy).toHaveBeenCalledWith(expect.anything(), 'bad config');
  });

  it('exits ERROR when no github tracker is configured', async () => {
    hoisted.resolveConfigMock.mockReturnValue({ ok: true, value: { roadmap: {} } });
    const code = await runNotify(['report.json', '--target', 'issue']);
    expect(code).toBe(ExitCode.ERROR);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('No GitHub tracker configured')
    );
  });

  it('exits ERROR when the tracker kind is not github', async () => {
    hoisted.resolveConfigMock.mockReturnValue({
      ok: true,
      value: { roadmap: { tracker: { kind: 'gitlab', repo: 'o/r' } } },
    });
    const code = await runNotify(['report.json', '--target', 'issue']);
    expect(code).toBe(ExitCode.ERROR);
    expect(hoisted.notifierCtorMock).not.toHaveBeenCalled();
  });

  it('characterizes the no-token fork: reports and exits ERROR', async () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    const code = await runNotify(['report.json', '--target', 'issue']);
    expect(code).toBe(ExitCode.ERROR);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('No GitHub token found')
    );
  });

  it('falls back to GH_TOKEN when GITHUB_TOKEN is unset, wiring it into the adapter', async () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = 'gh-fallback';
    hoisted.notifyIssueMock.mockResolvedValue({
      ok: true,
      value: { externalId: 'github:owner/repo#7', url: 'https://x/7' },
    });
    await runNotify(['report.json', '--target', 'issue']);
    expect(hoisted.adapterCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'gh-fallback', config: githubTracker })
    );
    // Notifier is constructed against the tracker's repo.
    expect(hoisted.notifierCtorMock).toHaveBeenCalledWith(expect.anything(), 'owner/repo');
  });
});

describe('ci notify — pr-comment target', () => {
  it('requires --pr for pr-comment', async () => {
    const code = await runNotify(['report.json', '--target', 'pr-comment']);
    expect(code).toBe(ExitCode.ERROR);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('--pr <number> is required')
    );
    expect(hoisted.notifyPRMock).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric --pr', async () => {
    const code = await runNotify(['report.json', '--target', 'pr-comment', '--pr', 'abc']);
    expect(code).toBe(ExitCode.ERROR);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Invalid PR number: abc')
    );
  });

  it('posts a PR comment and prints the JSON status shape', async () => {
    hoisted.notifyPRMock.mockResolvedValue({ ok: true, value: undefined });
    const code = await runNotify(['report.json', '--target', 'pr-comment', '--pr', '42', '--json']);
    expect(code).toBeNull();
    expect(hoisted.notifyPRMock).toHaveBeenCalledWith(expect.objectContaining({ exitCode: 1 }), 42);
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ target: 'pr-comment', pr: 42, status: 'posted' })
    );
  });

  it('exits ERROR when the PR comment post fails', async () => {
    hoisted.notifyPRMock.mockResolvedValue({ ok: false, error: { message: 'network down' } });
    const code = await runNotify(['report.json', '--target', 'pr-comment', '--pr', '42']);
    expect(code).toBe(ExitCode.ERROR);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('network down')
    );
  });
});

describe('ci notify — issue target', () => {
  it('skips issue creation when the report has no failures (exitCode 0)', async () => {
    const code = await runNotify(['report.json', '--target', 'issue', '--json'], okReport);
    expect(code).toBeNull();
    expect(hoisted.notifyIssueMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ target: 'issue', status: 'skipped', reason: 'no failures' })
    );
  });

  it('creates an issue and forwards parsed title + trimmed labels', async () => {
    hoisted.notifyIssueMock.mockResolvedValue({
      ok: true,
      value: { externalId: 'github:owner/repo#9', url: 'https://x/9' },
    });
    const code = await runNotify([
      'report.json',
      '--target',
      'issue',
      '--title',
      'Custom Title',
      '--labels',
      'ci, bug , urgent',
      '--json',
    ]);
    expect(code).toBeNull();
    expect(hoisted.notifyIssueMock).toHaveBeenCalledWith(expect.objectContaining({ exitCode: 1 }), {
      issueTitle: 'Custom Title',
      labels: ['ci', 'bug', 'urgent'],
    });
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({
        target: 'issue',
        externalId: 'github:owner/repo#9',
        url: 'https://x/9',
        status: 'created',
      })
    );
  });

  it('exits ERROR when issue creation fails', async () => {
    hoisted.notifyIssueMock.mockResolvedValue({ ok: false, error: { message: 'rate limited' } });
    const code = await runNotify(['report.json', '--target', 'issue']);
    expect(code).toBe(ExitCode.ERROR);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('rate limited')
    );
  });
});

describe('ci notify — unknown target', () => {
  it('exits ERROR on an unrecognized target', async () => {
    const code = await runNotify(['report.json', '--target', 'slack']);
    expect(code).toBe(ExitCode.ERROR);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('Unknown target: slack')
    );
  });
});
