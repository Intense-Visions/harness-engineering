import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import {
  runCheckOperationalDrift,
  createCheckOperationalDriftCommand,
  type RunGit,
} from './check-operational-drift';
import { ExitCode } from '../utils/errors';

/**
 * Behavior contract for the `harness check-operational-drift` action + render
 * layers. The git-seam helpers (resolveBaseRef / collectChangedFiles) are pinned
 * in check-operational-drift.test.ts; here we characterize the CURRENT behavior
 * of `runCheckOperationalDrift` (policy layering, ADR-in-diff pass, config
 * undiffable fallback, strict override) and the command's `printResult` rendering
 * + exit-code contract (advisory flags exit 0, blocking flags exit non-zero).
 *
 * Hermetic: the config loader and the `execFileSync` git seam are stubbed, so no
 * real subprocess or config file is read. Behavior is characterized as-is.
 */

const hoisted = vi.hoisted(() => ({
  resolveConfigMock: vi.fn(),
  execFileSyncMock: vi.fn(),
}));

vi.mock('../config/loader', () => ({ resolveConfig: hoisted.resolveConfigMock }));
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFileSync: hoisted.execFileSyncMock };
});

class ProcessExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
  }
}

/** Build a fake `runGit` from an argv-joined → output map; throws for unmapped calls. */
function fakeGit(responses: Record<string, string | (() => string)>): RunGit {
  return (args: string[]) => {
    const key = args.join(' ');
    const hit = responses[key];
    if (hit === undefined) throw new Error(`unmapped git call: ${key}`);
    return typeof hit === 'function' ? hit() : hit;
  };
}

const HUSKY = '.husky/pre-commit';
const ADR = 'docs/knowledge/decisions/0100-x.md';

beforeEach(() => {
  hoisted.resolveConfigMock.mockReset();
  hoisted.execFileSyncMock.mockReset();
  hoisted.resolveConfigMock.mockReturnValue({ ok: true, value: {} });
});

afterEach(() => vi.restoreAllMocks());

describe('runCheckOperationalDrift — policy + detection', () => {
  it('short-circuits to valid when the policy is disabled', async () => {
    hoisted.resolveConfigMock.mockReturnValue({
      ok: true,
      value: { operationalPolicy: { enabled: false } },
    });
    const runGit = fakeGit({}); // never consulted once disabled
    const res = await runCheckOperationalDrift({ base: 'BASE', runGit });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toMatchObject({ valid: true, flagged: false, operationalChanges: [] });
  });

  it('passes clean when no watched surface changed', async () => {
    const runGit = fakeGit({
      'diff --name-only BASE': 'packages/cli/src/foo.ts',
      'ls-files --others --exclude-standard': '',
    });
    const res = await runCheckOperationalDrift({ base: 'BASE', runGit });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.flagged).toBe(false);
    expect(res.value.operationalChanges).toHaveLength(0);
  });

  it('flags an operational change with no accompanying ADR (advisory by default)', async () => {
    const runGit = fakeGit({
      'diff --name-only BASE': HUSKY,
      'ls-files --others --exclude-standard': '',
    });
    const res = await runCheckOperationalDrift({ base: 'BASE', runGit });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.flagged).toBe(true);
    expect(res.value.valid).toBe(false);
    expect(res.value.severity).toBe('advisory');
    expect(res.value.operationalChanges.map((c) => c.surface)).toContain(HUSKY);
    expect(res.value.adrFiles).toHaveLength(0);
  });

  it('passes when an ADR accompanies the operational change in the same diff', async () => {
    const runGit = fakeGit({
      'diff --name-only BASE': `${HUSKY}\n${ADR}`,
      'ls-files --others --exclude-standard': '',
    });
    const res = await runCheckOperationalDrift({ base: 'BASE', runGit });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.flagged).toBe(false);
    expect(res.value.valid).toBe(true);
    expect(res.value.adrFiles).toContain(ADR);
  });

  it('forces blocking severity under strict, overriding the advisory default', async () => {
    const runGit = fakeGit({
      'diff --name-only BASE': HUSKY,
      'ls-files --others --exclude-standard': '',
    });
    const res = await runCheckOperationalDrift({ base: 'BASE', strict: true, runGit });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.severity).toBe('blocking');
    expect(res.value.flagged).toBe(true);
  });

  it('falls back to flagging the whole config file when the base version is undiffable', async () => {
    const runGit = fakeGit({
      'diff --name-only BASE': 'harness.config.json',
      'ls-files --others --exclude-standard': '',
      'show BASE:harness.config.json': (() => {
        throw new Error('unknown revision');
      }) as unknown as string,
    });
    // cwd points nowhere so the working-tree read also yields undefined.
    const res = await runCheckOperationalDrift({ base: 'BASE', cwd: '/nonexistent-dir', runGit });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.flagged).toBe(true);
    expect(res.value.operationalChanges.map((c) => c.surface)).toContain('harness.config.json');
  });

  it('surfaces a config-resolution failure as an Err result', async () => {
    hoisted.resolveConfigMock.mockReturnValue({ ok: false, error: { message: 'bad' } });
    const res = await runCheckOperationalDrift({ base: 'BASE', runGit: fakeGit({}) });
    expect(res.ok).toBe(false);
  });
});

// ── Command action + printResult rendering (execFileSync git seam mocked) ──

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
  program.option('--json').option('--quiet').option('--config <path>');
  program.addCommand(createCheckOperationalDriftCommand());
  let code: number | null = null;
  try {
    await program.parseAsync(['node', 'harness', 'check-operational-drift', ...argv]);
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

/** Route the mocked execFileSync's git call by argv, given a diff payload. */
function stubGit(diff: string): void {
  hoisted.execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
    const key = args.join(' ');
    if (key === 'diff --name-only HEAD') return diff;
    if (key === 'ls-files --others --exclude-standard') return '';
    // resolveBaseRef is skipped because tests pass --base HEAD.
    return '';
  });
}

describe('createCheckOperationalDriftCommand — render + exit codes', () => {
  it('reports a clean tree and exits SUCCESS', async () => {
    stubGit('');
    const { code, out } = await runCommand(['--base', 'HEAD']);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(out).toContain('No operational-policy surfaces changed against HEAD');
  });

  it('renders an advisory flag (no ADR) and still exits SUCCESS', async () => {
    stubGit(HUSKY);
    const { code, out } = await runCommand(['--base', 'HEAD']);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(out).toContain('Operational-policy surfaces changed against HEAD');
    expect(out).toContain(HUSKY);
    expect(out).toContain('advisory');
  });

  it('renders a blocking flag under --strict and exits VALIDATION_FAILED', async () => {
    stubGit(HUSKY);
    const { code, out } = await runCommand(['--base', 'HEAD', '--strict']);
    expect(code).toBe(ExitCode.VALIDATION_FAILED);
    expect(out).toContain('No ADR found');
  });

  it('renders the ADR-satisfied branch and exits SUCCESS', async () => {
    stubGit(`${HUSKY}\n${ADR}`);
    const { code, out } = await runCommand(['--base', 'HEAD']);
    expect(code).toBe(ExitCode.SUCCESS);
    expect(out).toContain('documented by an ADR');
    expect(out).toContain(ADR);
  });

  it('emits a single JSON object under --json', async () => {
    stubGit(HUSKY);
    const { out } = await runCommand(['--base', 'HEAD', '--json']);
    const parsed = JSON.parse(out);
    expect(parsed.flagged).toBe(true);
    expect(parsed.base).toBe('HEAD');
  });

  it('prints the error and exits with the CLIError code when config fails', async () => {
    hoisted.resolveConfigMock.mockReturnValue({
      ok: false,
      error: { message: 'no config found', exitCode: ExitCode.ERROR },
    });
    stubGit('');
    const { code, out } = await runCommand(['--base', 'HEAD']);
    expect(code).toBe(ExitCode.ERROR);
    expect(out).toContain('no config found');
  });
});
