import { describe, it, expect } from 'vitest';
import * as util from 'node:util';
import type { ExecFileFn, SyncMainResult } from '../../src/maintenance/sync-main';
import { syncMain } from '../../src/maintenance/sync-main';

interface ScriptedResult {
  stdout?: string;
  stderr?: string;
}
interface ScriptedError {
  error: NodeJS.ErrnoException;
}
type ScriptedOutcome = ScriptedResult | ScriptedError;
type ScriptedHandler = ScriptedOutcome | (() => ScriptedOutcome);

interface Script {
  match: (args: string[]) => boolean;
  /** Static outcome, or a function that returns one (for stateful handlers). */
  result: ScriptedHandler;
}

/**
 * Builds an `execFile`-compatible mock from a list of scripted handlers.
 * Each handler matches against the argv array and returns either
 * { stdout?, stderr? } (success) or { error } (non-zero exit).
 *
 * Note: the real `child_process.execFile` carries a `util.promisify.custom`
 * symbol so that `promisify(execFile)` resolves to `{stdout, stderr}` rather
 * than the first callback argument. We mirror that here so the production
 * code path (`promisify(execFileFn)`) works against the mock unchanged.
 */
function makeGitMock(scripts: Script[]): ExecFileFn {
  function resolveScript(argv: string[]): ScriptedOutcome {
    const script = scripts.find((s) => s.match(argv));
    if (!script) {
      return {
        error: new Error(`Unexpected git call: ${argv.join(' ')}`) as NodeJS.ErrnoException,
      };
    }
    return typeof script.result === 'function' ? script.result() : script.result;
  }
  const fn = ((file: string, args: readonly string[], _opts: unknown, cb: unknown) => {
    const callback = cb as (
      err: NodeJS.ErrnoException | null,
      stdout: string,
      stderr: string
    ) => void;
    expect(file).toBe('git');
    const argv = [...(args ?? [])];
    const result = resolveScript(argv);
    if ('error' in result) {
      callback(result.error, '', '');
    } else {
      callback(null, result.stdout ?? '', result.stderr ?? '');
    }
    return undefined as never;
  }) as unknown as ExecFileFn;
  // Attach the promisify.custom symbol so `promisify(fn)` returns
  // `Promise<{stdout, stderr}>` (matching real execFile behavior).
  (fn as unknown as { [k: symbol]: unknown })[util.promisify.custom] = (
    file: string,
    args: readonly string[],
    _opts?: unknown
  ) => {
    expect(file).toBe('git');
    const argv = [...(args ?? [])];
    const result = resolveScript(argv);
    if ('error' in result) return Promise.reject(result.error);
    return Promise.resolve({
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    });
  };
  return fn;
}

const eq =
  (expected: string[]) =>
  (a: string[]): boolean =>
    a.length === expected.length && a.every((v, i) => v === expected[i]);
const startsWith =
  (prefix: string[]) =>
  (a: string[]): boolean =>
    prefix.every((v, i) => a[i] === v);

describe('syncMain — wrong-branch path', () => {
  it('returns skipped:wrong-branch when current branch is not default', async () => {
    const execFileFn = makeGitMock([
      {
        match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
        result: { stdout: 'origin/main\n' },
      },
      {
        match: eq(['rev-parse', '--abbrev-ref', 'HEAD']),
        result: { stdout: 'feature/topic\n' },
      },
    ]);
    const r = await syncMain('/repo', { execFileFn });
    expect(r.status).toBe('skipped');
    if (r.status === 'skipped') {
      expect(r.reason).toBe('wrong-branch');
      expect(r.defaultBranch).toBe('main');
    }
  });
});

describe('syncMain — no-remote path', () => {
  it('returns skipped:no-remote when origin/HEAD unset and origin/main+master missing', async () => {
    const execFileFn = makeGitMock([
      {
        match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
        result: {
          error: Object.assign(new Error('no symbolic ref'), {
            code: 1,
          }) as NodeJS.ErrnoException,
        },
      },
      {
        match: eq(['rev-parse', '--verify', '--quiet', 'origin/main']),
        result: {
          error: Object.assign(new Error('not a ref'), {
            code: 1,
          }) as NodeJS.ErrnoException,
        },
      },
      {
        match: eq(['rev-parse', '--verify', '--quiet', 'origin/master']),
        result: {
          error: Object.assign(new Error('not a ref'), {
            code: 1,
          }) as NodeJS.ErrnoException,
        },
      },
    ]);
    const r = await syncMain('/repo', { execFileFn });
    expect(r.status).toBe('skipped');
    if (r.status === 'skipped') expect(r.reason).toBe('no-remote');
  });

  it('falls back to origin/main when origin/HEAD unset', async () => {
    const execFileFn = makeGitMock([
      {
        match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
        result: {
          error: Object.assign(new Error('no symbolic ref'), {
            code: 1,
          }) as NodeJS.ErrnoException,
        },
      },
      {
        match: eq(['rev-parse', '--verify', '--quiet', 'origin/main']),
        result: { stdout: 'abc123\n' },
      },
      {
        match: eq(['rev-parse', '--abbrev-ref', 'HEAD']),
        result: { stdout: 'main\n' },
      },
      {
        match: startsWith(['fetch', 'origin', 'main']),
        result: { stdout: '' },
      },
      {
        match: eq(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']),
        result: { stdout: '' }, // exit 0 → ancestor
      },
      {
        match: eq(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']),
        result: { stdout: '' }, // exit 0 → also ancestor → equal → no-op
      },
    ]);
    const r = await syncMain('/repo', { execFileFn });
    expect(r.status).toBe('no-op');
    if (r.status === 'no-op') expect(r.defaultBranch).toBe('main');
  });
});

describe('syncMain — no-op path', () => {
  it('returns no-op when HEAD equals origin/<default>', async () => {
    const execFileFn = makeGitMock([
      {
        match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
        result: { stdout: 'origin/main\n' },
      },
      {
        match: eq(['rev-parse', '--abbrev-ref', 'HEAD']),
        result: { stdout: 'main\n' },
      },
      { match: startsWith(['fetch', 'origin', 'main']), result: { stdout: '' } },
      {
        match: eq(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']),
        result: { stdout: '' },
      },
      {
        match: eq(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']),
        result: { stdout: '' },
      },
    ]);
    const r: SyncMainResult = await syncMain('/repo', { execFileFn });
    expect(r.status).toBe('no-op');
  });
});

describe('syncMain — updated path', () => {
  it('runs ff-only merge and returns updated with both SHAs when HEAD strict-ancestor of origin', async () => {
    // First `rev-parse HEAD` returns the "before" SHA, second returns "after".
    let revParseHeadCalls = 0;
    const execFileFn = makeGitMock([
      {
        match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
        result: { stdout: 'origin/main\n' },
      },
      {
        match: eq(['rev-parse', '--abbrev-ref', 'HEAD']),
        result: { stdout: 'main\n' },
      },
      { match: startsWith(['fetch', 'origin', 'main']), result: { stdout: '' } },
      {
        match: eq(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']),
        result: { stdout: '' }, // exit 0 → HEAD is ancestor
      },
      {
        match: eq(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']),
        result: {
          error: Object.assign(new Error(''), {
            code: 1,
          }) as NodeJS.ErrnoException,
        }, // origin not ancestor of HEAD → strict
      },
      {
        match: eq(['rev-parse', 'HEAD']),
        result: () => {
          revParseHeadCalls += 1;
          const sha = revParseHeadCalls === 1 ? 'aaaaaaaa' : 'bbbbbbbb';
          return { stdout: `${sha}\n` };
        },
      },
      {
        match: eq(['merge', '--ff-only', 'origin/main']),
        result: { stdout: 'Updating aaaaaaa..bbbbbbb\n' },
      },
    ]);
    const r = await syncMain('/repo', { execFileFn });
    expect(r.status).toBe('updated');
    if (r.status === 'updated') {
      expect(r.from).toBe('aaaaaaaa');
      expect(r.to).toBe('bbbbbbbb');
      expect(r.defaultBranch).toBe('main');
    }
  });
});

describe('syncMain — diverged path', () => {
  it('returns skipped:diverged when HEAD is not ancestor of origin', async () => {
    const execFileFn = makeGitMock([
      {
        match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
        result: { stdout: 'origin/main\n' },
      },
      {
        match: eq(['rev-parse', '--abbrev-ref', 'HEAD']),
        result: { stdout: 'main\n' },
      },
      { match: startsWith(['fetch', 'origin', 'main']), result: { stdout: '' } },
      {
        match: eq(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']),
        result: {
          error: Object.assign(new Error(''), {
            code: 1,
          }) as NodeJS.ErrnoException,
        },
      },
      {
        match: eq(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']),
        result: { stdout: '' }, // origin is ancestor of HEAD; HEAD is not ancestor → diverged
      },
    ]);
    const r = await syncMain('/repo', { execFileFn });
    expect(r.status).toBe('skipped');
    if (r.status === 'skipped') expect(r.reason).toBe('diverged');
  });
});

describe('syncMain — dirty-conflict path', () => {
  it('returns skipped:dirty-conflict when ff-only merge fails with conflict stderr', async () => {
    const execFileFn = makeGitMock([
      {
        match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
        result: { stdout: 'origin/main\n' },
      },
      {
        match: eq(['rev-parse', '--abbrev-ref', 'HEAD']),
        result: { stdout: 'main\n' },
      },
      { match: startsWith(['fetch', 'origin', 'main']), result: { stdout: '' } },
      {
        match: eq(['merge-base', '--is-ancestor', 'HEAD', 'origin/main']),
        result: { stdout: '' },
      },
      {
        match: eq(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']),
        result: {
          error: Object.assign(new Error(''), {
            code: 1,
          }) as NodeJS.ErrnoException,
        },
      },
      { match: eq(['rev-parse', 'HEAD']), result: { stdout: 'aaaaaaaa\n' } },
      {
        match: eq(['merge', '--ff-only', 'origin/main']),
        result: {
          error: Object.assign(
            new Error(
              'error: Your local changes to the following files would be overwritten by merge'
            ),
            {
              code: 1,
              stderr: 'error: Your local changes ... would be overwritten by merge',
            }
          ) as NodeJS.ErrnoException,
        },
      },
    ]);
    const r = await syncMain('/repo', { execFileFn });
    expect(r.status).toBe('skipped');
    if (r.status === 'skipped') expect(r.reason).toBe('dirty-conflict');
  });
});

describe('syncMain — fetch-failed path', () => {
  it('returns skipped:fetch-failed when git fetch exits non-zero', async () => {
    const execFileFn = makeGitMock([
      {
        match: eq(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']),
        result: { stdout: 'origin/main\n' },
      },
      {
        match: eq(['rev-parse', '--abbrev-ref', 'HEAD']),
        result: { stdout: 'main\n' },
      },
      {
        match: startsWith(['fetch', 'origin', 'main']),
        result: {
          error: Object.assign(new Error('Could not resolve host'), {
            code: 128,
            stderr: 'fatal: Could not resolve host',
          }) as NodeJS.ErrnoException,
        },
      },
    ]);
    const r = await syncMain('/repo', { execFileFn });
    expect(r.status).toBe('skipped');
    if (r.status === 'skipped') expect(r.reason).toBe('fetch-failed');
  });
});

describe('syncMain — error path', () => {
  it('returns error when git binary is missing (ENOENT)', async () => {
    const execFileFn = makeGitMock([
      {
        match: () => true,
        result: {
          error: Object.assign(new Error('spawn git ENOENT'), {
            code: 'ENOENT',
          }) as NodeJS.ErrnoException,
        },
      },
    ]);
    const r = await syncMain('/repo', { execFileFn });
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.message).toMatch(/ENOENT|spawn git/);
  });
});
