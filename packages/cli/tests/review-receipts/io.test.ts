import { describe, it, expect, vi, beforeEach } from 'vitest';

const gh = vi.fn();
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: (...args: unknown[]) => gh(...args),
}));

import * as path from 'node:path';
import { defaultPrReader, sessionDirFrom, type CwdGit } from '../../src/review-receipts/io';

// A block body: a hook that returns a function registers it as a teardown, and mockReset returns the mock.
beforeEach(() => {
  gh.mockReset();
});
const argsOf = (call: unknown[]) => call[1] as string[];

describe('defaultPrReader, against a stub gh', () => {
  it('asks gh for the PR of the checked-out branch when no number is given', () => {
    gh.mockReturnValue('{"number":4,"body":"hello","headRefOid":"abc"}');
    expect(defaultPrReader('/repo')).toEqual({ number: 4, body: 'hello', headSha: 'abc' });
    expect(argsOf(gh.mock.calls[0]!)).toEqual(['pr', 'view', '--json', 'number,body,headRefOid']);
    expect(gh.mock.calls[0]![2]).toMatchObject({ cwd: '/repo' });
  });
  it('names the PR when a number is given, as a detached merge ref needs', () => {
    gh.mockReturnValue('{"number":31,"body":""}');
    expect(defaultPrReader('/repo', 31)).toEqual({ number: 31, body: '' });
    expect(argsOf(gh.mock.calls[0]!)).toEqual([
      'pr',
      'view',
      '31',
      '--json',
      'number,body,headRefOid',
    ]);
  });
  it.each([
    ['not an object', '7'],
    ['null', 'null'],
    ['no number', '{"body":"x"}'],
    ['a number that is a string', '{"number":"4","body":"x"}'],
  ])('output that is %s names no PR', (_name, out) => {
    gh.mockReturnValue(out);
    expect(defaultPrReader('/repo')).toBeUndefined();
  });
  it('a body or head that is not a string is left out, not passed on', () => {
    gh.mockReturnValue('{"number":4,"body":null,"headRefOid":7}');
    expect(defaultPrReader('/repo')).toEqual({ number: 4, body: '' });
  });
  it('a branch with no PR is "no PR", not a failure', () => {
    gh.mockImplementation(() => {
      throw Object.assign(new Error('exit 1'), {
        stderr: 'no pull requests found for branch "x"',
      });
    });
    expect(defaultPrReader('/repo')).toBeUndefined();
  });
  it.each([
    ['gh is not installed', { code: 'ENOENT' }],
    ['gh is not authenticated', { stderr: 'To get started with GitHub CLI, run: gh auth login' }],
    ['the API fails', { stderr: 'HTTP 502: Bad Gateway' }],
    ['a detached checkout', { stderr: 'could not determine current branch: not on any branch' }],
  ])('throws when %s: that is unknown, not "no PR"', (_name, props) => {
    gh.mockImplementation(() => {
      throw Object.assign(new Error('gh failed'), props);
    });
    expect(() => defaultPrReader('/repo')).toThrow('gh failed');
  });
});

/**
 * Input partition for the session directory. Where: {repository root, subdirectory, linked
 * worktree, outside a repository}. Slug: {plain, one core accepts and the old private pattern
 * refused, one the old pattern accepted and core refuses, empty, a path, dot-only, padded}.
 * The rule is core's resolveSessionDir, so the review commands read every session manage_state can create.
 */
describe('sessionDirFrom', () => {
  const at =
    (top: string | undefined): CwdGit =>
    (args) => {
      if (args.includes('--show-toplevel') && top !== undefined) return top;
      throw new Error('not a git repository');
    };
  const sessions = (root: string, slug: string) => path.join(root, '.harness', 'sessions', slug);
  it.each([
    ['the repository root', '/repo', '/repo', '/repo'],
    ['a subdirectory', '/repo/src/sub', '/repo', '/repo'],
    ['a linked worktree', '/wt/feature/pkg', '/wt/feature', '/wt/feature'],
    ['outside a repository', '/elsewhere', undefined, '/elsewhere'],
  ])('from %s the session is under the top level', (_name, cwd, top, root) => {
    expect(sessionDirFrom(at(top), cwd, 's1')).toEqual({ ok: true, value: sessions(root, 's1') });
  });
  it.each(['s1', 'changes--x--proposal', 'my session', '_lead', 'a+b (2)', '.harness'])(
    'accepts the slug %j, as core does',
    (slug) => {
      expect(sessionDirFrom(at('/repo'), '/repo', slug).ok).toBe(true);
    }
  );
  it.each(['', '   ', 'a..b', '..', '.', 'a/b', 'a\\b', 'C:x', ' padded', 'padded ', 'NUL'])(
    'refuses the slug %j, as core does',
    (slug) => {
      expect(sessionDirFrom(at('/repo'), '/repo', slug).ok).toBe(false);
    }
  );
});
