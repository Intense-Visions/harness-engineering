import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runVerify } from './verify';
import { ExitCode } from '../utils/errors';

/**
 * Unit contract for `harness verify`. Pins the CURRENT behavior of the command:
 * branch-name resolution precedence (explicit -> env -> git), schema-default
 * config fallback, config-load failure surfacing, and the compliance exit codes
 * for both human and JSON output.
 *
 * Fully hermetic: `child_process.execSync`, the config loader
 * (`resolveConfig`/`findConfigFile`), `process.exit`, and console are all
 * stubbed, so there is no real subprocess, filesystem, or process exit. The real
 * `validateBranchName` + `BranchingConfigSchema` are exercised on purpose --
 * they are pure, and the schema defaults are the behavior under test.
 */

const hoisted = vi.hoisted(() => ({
  execSyncMock: vi.fn(),
  resolveConfigMock: vi.fn(),
  findConfigFileMock: vi.fn(),
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, execSync: hoisted.execSyncMock };
});

vi.mock('../config/loader', () => ({
  resolveConfig: hoisted.resolveConfigMock,
  findConfigFile: hoisted.findConfigFileMock,
}));

// Env vars the resolver consults, so tests start from a known-clean slate.
const BRANCH_ENV_KEYS = [
  'HARNESS_BRANCH',
  'GITHUB_HEAD_REF',
  'CI_COMMIT_REF_NAME',
  'BUILDKITE_BRANCH',
] as const;

/** Sentinel thrown by the mocked `process.exit` so control-flow halts like real exit. */
class ProcessExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
  }
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  hoisted.execSyncMock.mockReset();
  hoisted.resolveConfigMock.mockReset();
  hoisted.findConfigFileMock.mockReset();

  savedEnv = {};
  for (const key of BRANCH_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }

  vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
    throw new ProcessExitError(typeof code === 'number' ? code : 0);
  });
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const key of BRANCH_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.restoreAllMocks();
});

/** Runs `runVerify`, returning the exit code captured from the sentinel throw. */
async function runAndCaptureExit(options: Parameters<typeof runVerify>[0]): Promise<number> {
  try {
    await runVerify(options);
  } catch (err) {
    if (err instanceof ProcessExitError) return err.code;
    throw err;
  }
  throw new Error('runVerify returned without calling process.exit');
}

/** Concatenated `console.log` output (JSON payloads + human success/info lines). */
function stdout(): string {
  return logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
}

describe('runVerify', () => {
  describe('branch resolution precedence', () => {
    it('uses an explicit --branch over env and git', async () => {
      hoisted.findConfigFileMock.mockReturnValue({ ok: false });
      process.env.HARNESS_BRANCH = 'chore/from-env';
      hoisted.execSyncMock.mockReturnValue(Buffer.from('chore/from-git'));

      const code = await runAndCaptureExit({ branch: 'feat/explicit-wins', json: true });

      expect(code).toBe(ExitCode.SUCCESS);
      expect(JSON.parse(stdout())).toMatchObject({ valid: true, branchName: 'feat/explicit-wins' });
      expect(hoisted.execSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to env vars when no explicit branch is given', async () => {
      hoisted.findConfigFileMock.mockReturnValue({ ok: false });
      process.env.GITHUB_HEAD_REF = 'fix/from-env';

      const code = await runAndCaptureExit({ json: true });

      expect(code).toBe(ExitCode.SUCCESS);
      expect(JSON.parse(stdout())).toMatchObject({ valid: true, branchName: 'fix/from-env' });
      expect(hoisted.execSyncMock).not.toHaveBeenCalled();
    });

    it('falls back to git rev-parse when no explicit branch or env is set', async () => {
      hoisted.findConfigFileMock.mockReturnValue({ ok: false });
      hoisted.execSyncMock.mockReturnValue(Buffer.from('feat/from-git\n'));

      const code = await runAndCaptureExit({ json: true });

      expect(code).toBe(ExitCode.SUCCESS);
      expect(JSON.parse(stdout())).toMatchObject({ valid: true, branchName: 'feat/from-git' });
      expect(hoisted.execSyncMock).toHaveBeenCalledOnce();
    });

    it('treats a detached-HEAD git result as no branch', async () => {
      hoisted.findConfigFileMock.mockReturnValue({ ok: false });
      hoisted.execSyncMock.mockReturnValue(Buffer.from('HEAD\n'));

      const code = await runAndCaptureExit({ json: true });

      expect(code).toBe(ExitCode.ERROR);
      expect(JSON.parse(stdout())).toMatchObject({ valid: false, branchName: '' });
    });
  });

  describe('unresolvable branch', () => {
    it('errors with exit code ERROR and human message when git throws', async () => {
      hoisted.findConfigFileMock.mockReturnValue({ ok: false });
      hoisted.execSyncMock.mockImplementation(() => {
        throw new Error('not a git repository');
      });

      const code = await runAndCaptureExit({});

      expect(code).toBe(ExitCode.ERROR);
      expect(errorSpy).toHaveBeenCalledOnce();
      expect(errorSpy.mock.calls[0]!.join(' ')).toContain('Could not determine the current branch');
      // Human mode must not emit a JSON payload on stdout.
      expect(stdout()).toBe('');
    });

    it('emits a JSON error payload with exit code ERROR in --json mode', async () => {
      hoisted.findConfigFileMock.mockReturnValue({ ok: false });
      hoisted.execSyncMock.mockImplementation(() => {
        throw new Error('not a git repository');
      });

      const code = await runAndCaptureExit({ json: true });

      expect(code).toBe(ExitCode.ERROR);
      const payload = JSON.parse(stdout());
      expect(payload.valid).toBe(false);
      expect(payload.branchName).toBe('');
      expect(payload.message).toContain('Could not determine the current branch');
    });
  });

  describe('compliance results with schema-default config', () => {
    it('exits SUCCESS and prints a compliant success line for a valid branch (human)', async () => {
      hoisted.findConfigFileMock.mockReturnValue({ ok: false });

      const code = await runAndCaptureExit({ branch: 'feat/add-widget' });

      expect(code).toBe(ExitCode.SUCCESS);
      expect(stdout()).toContain('is compliant');
      expect(stdout()).toContain('feat/add-widget');
    });

    it('exits VALIDATION_FAILED with message + suggestion for a prefix-less branch (JSON)', async () => {
      hoisted.findConfigFileMock.mockReturnValue({ ok: false });

      const code = await runAndCaptureExit({ branch: 'noprefixbranch', json: true });

      expect(code).toBe(ExitCode.VALIDATION_FAILED);
      const payload = JSON.parse(stdout());
      expect(payload.valid).toBe(false);
      expect(payload.branchName).toBe('noprefixbranch');
      expect(payload.message).toContain('must have a prefix');
      expect(payload.suggestion).toContain('feat/noprefixbranch');
    });

    it('exits VALIDATION_FAILED and logs message + suggestion for a non-compliant branch (human)', async () => {
      hoisted.findConfigFileMock.mockReturnValue({ ok: false });

      const code = await runAndCaptureExit({ branch: 'bogus/Not_Kebab' });

      expect(code).toBe(ExitCode.VALIDATION_FAILED);
      // Prefix "bogus" is not in the default allowlist -> error + allowed-prefixes suggestion.
      const errText = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
      expect(errText).toContain('bogus');
      expect(stdout()).toContain('Suggestion');
    });

    it('does not consult the config loader when no config path or discoverable config exists', async () => {
      hoisted.findConfigFileMock.mockReturnValue({ ok: false });

      await runAndCaptureExit({ branch: 'feat/x', json: true });

      expect(hoisted.resolveConfigMock).not.toHaveBeenCalled();
    });
  });

  describe('config loading', () => {
    it('loads a discoverable config and applies its branching rules', async () => {
      hoisted.findConfigFileMock.mockReturnValue({ ok: true, value: '/repo/harness.config.json' });
      // Custom regex requires branches to start with "release-".
      hoisted.resolveConfigMock.mockReturnValue({
        ok: true,
        value: { compliance: { branching: { customRegex: '^release-', ignore: [] } } },
      });

      const code = await runAndCaptureExit({ branch: 'release-1.2.0', json: true });

      expect(code).toBe(ExitCode.SUCCESS);
      expect(hoisted.resolveConfigMock).toHaveBeenCalledWith(undefined);
      expect(JSON.parse(stdout())).toMatchObject({ valid: true, branchName: 'release-1.2.0' });
    });

    it('rejects a branch that violates a loaded custom regex', async () => {
      hoisted.findConfigFileMock.mockReturnValue({ ok: true, value: '/repo/harness.config.json' });
      hoisted.resolveConfigMock.mockReturnValue({
        ok: true,
        value: { compliance: { branching: { customRegex: '^release-', ignore: [] } } },
      });

      const code = await runAndCaptureExit({ branch: 'feat/nope', json: true });

      expect(code).toBe(ExitCode.VALIDATION_FAILED);
      expect(JSON.parse(stdout())).toMatchObject({ valid: false, branchName: 'feat/nope' });
    });

    it('falls back to schema defaults when a discoverable config has no branching section', async () => {
      hoisted.findConfigFileMock.mockReturnValue({ ok: true, value: '/repo/harness.config.json' });
      hoisted.resolveConfigMock.mockReturnValue({ ok: true, value: {} });

      const code = await runAndCaptureExit({ branch: 'feat/default-rules', json: true });

      expect(code).toBe(ExitCode.SUCCESS);
      expect(JSON.parse(stdout())).toMatchObject({ valid: true, branchName: 'feat/default-rules' });
    });

    it('surfaces the loader error and exits with its exit code when an explicit config path fails', async () => {
      // configPath provided -> loader is consulted regardless of findConfigFile.
      hoisted.resolveConfigMock.mockReturnValue({
        ok: false,
        error: { message: 'config not found', exitCode: ExitCode.ERROR },
      });

      const code = await runAndCaptureExit({ configPath: '/missing/harness.config.json' });

      expect(code).toBe(ExitCode.ERROR);
      expect(hoisted.resolveConfigMock).toHaveBeenCalledWith('/missing/harness.config.json');
      expect(errorSpy.mock.calls[0]!.join(' ')).toContain('config not found');
    });
  });
});
