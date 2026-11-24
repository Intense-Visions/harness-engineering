import { describe, it, expect, vi, beforeEach } from 'vitest';

const gh = vi.fn();
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: (...args: unknown[]) => gh(...args),
}));

import * as path from 'node:path';
import { sessionDirFrom, type CwdGit } from '../../src/review-receipts/io';

// A block body: a hook that returns a function registers it as a teardown, and mockReset returns the mock.
beforeEach(() => {
  gh.mockReset();
});
const argsOf = (call: unknown[]) => call[1] as string[];

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
  it.each(['s1', 'changes--x--proposal', 'my session', '_lead', 'a+b (2)'])(
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
