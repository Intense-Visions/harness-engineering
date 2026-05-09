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

describe('syncMain — updated path', () => {
  it('runs ff-only merge and returns updated with both SHAs when HEAD strict-ancestor of origin', async () => {
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
        // Two `rev-parse HEAD` calls — first returns "before", second "after".
        match: eq(['rev-parse', 'HEAD']),
        result: { stdout: '' }, // overridden below
      },
      {
        match: eq(['merge', '--ff-only', 'origin/main']),
        result: { stdout: 'Updating aaaaaaa..bbbbbbb\n' },
      },
    ]);
    // Wrap to give the two rev-parse HEAD calls different outputs.
    const wrapped = ((file: string, args: readonly string[], opts: unknown, cb: unknown) => {
      const argv = [...(args ?? [])];
      const isHead = argv.length === 2 && argv[0] === 'rev-parse' && argv[1] === 'HEAD';
      if (isHead) {
        revParseHeadCalls += 1;
        const sha = revParseHeadCalls === 1 ? 'aaaaaaaa' : 'bbbbbbbb';
        (cb as (e: unknown, o: string, s: string) => void)(null, `${sha}\n`, '');
        return undefined as never;
      }
      return (
        execFileFn as unknown as (
          f: string,
          a: readonly string[],
          o: unknown,
          c: unknown
        ) => unknown
      )(file, args, opts, cb);
    }) as unknown as ExecFileFn;
    const r = await syncMain('/repo', { execFileFn: wrapped });
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
