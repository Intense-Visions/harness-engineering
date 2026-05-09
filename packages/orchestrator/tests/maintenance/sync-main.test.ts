import { describe, it, expect } from 'vitest';
import type { ExecFileFn, SyncMainResult } from '../../src/maintenance/sync-main';
import { syncMain } from '../../src/maintenance/sync-main';

/**
 * Builds an `execFile`-compatible mock from a list of scripted handlers.
 * Each handler matches against the argv array and returns either
 * { stdout?, stderr? } (success) or { error } (non-zero exit).
 */
function makeGitMock(
  scripts: Array<{
    match: (args: string[]) => boolean;
    result: { stdout?: string; stderr?: string } | { error: NodeJS.ErrnoException };
  }>
): ExecFileFn {
  const fn = ((file: string, args: readonly string[], _opts: unknown, cb: unknown) => {
    const callback = cb as (
      err: NodeJS.ErrnoException | null,
      stdout: string,
      stderr: string
    ) => void;
    expect(file).toBe('git');
    const argv = [...(args ?? [])];
    const script = scripts.find((s) => s.match(argv));
    if (!script) {
      callback(
        new Error(`Unexpected git call: ${argv.join(' ')}`) as NodeJS.ErrnoException,
        '',
        ''
      );
      return undefined as never;
    }
    if ('error' in script.result) {
      callback(script.result.error, '', '');
    } else {
      callback(null, script.result.stdout ?? '', script.result.stderr ?? '');
    }
    return undefined as never;
  }) as unknown as ExecFileFn;
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
