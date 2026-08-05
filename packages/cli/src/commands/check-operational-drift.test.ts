import { describe, it, expect } from 'vitest';
import { resolveBaseRef, collectChangedFiles, type RunGit } from './check-operational-drift';

/**
 * Command-layer git-seam contract for `harness check-operational-drift`. The
 * detection logic is covered in operational-drift.test.ts; here we pin the git
 * interaction (base-ref resolution precedence + changed-file collection) using an
 * injected `runGit` so no real subprocess runs.
 */

/** Build a fake `runGit` from an argv[0..n] → output map; throws for unmapped calls. */
function fakeGit(responses: Record<string, string | (() => string)>): RunGit {
  return (args: string[]) => {
    const key = args.join(' ');
    const hit = responses[key];
    if (hit === undefined) throw new Error(`unmapped git call: ${key}`);
    return typeof hit === 'function' ? hit() : hit;
  };
}

describe('resolveBaseRef', () => {
  it('returns an explicit --base verbatim without touching git', () => {
    const runGit = fakeGit({});
    expect(resolveBaseRef({ base: 'abc123', runGit })).toBe('abc123');
  });

  it('resolves the merge-base with the default branch from origin/HEAD', () => {
    const runGit = fakeGit({
      'symbolic-ref refs/remotes/origin/HEAD': 'refs/remotes/origin/develop',
      'merge-base HEAD origin/develop': 'basesha',
    });
    expect(resolveBaseRef({ runGit })).toBe('basesha');
  });

  it('falls back to main when origin/HEAD is absent', () => {
    const runGit = fakeGit({
      'symbolic-ref refs/remotes/origin/HEAD': (() => {
        throw new Error('no ref');
      }) as unknown as string,
      'merge-base HEAD origin/main': 'mainbase',
    });
    expect(resolveBaseRef({ runGit })).toBe('mainbase');
  });

  it('falls back to HEAD when no merge-base can be resolved', () => {
    const throwing = (() => {
      throw new Error('fail');
    }) as unknown as string;
    const runGit = fakeGit({
      'symbolic-ref refs/remotes/origin/HEAD': throwing,
      'merge-base HEAD origin/main': throwing,
      'merge-base HEAD main': throwing,
    });
    expect(resolveBaseRef({ runGit })).toBe('HEAD');
  });
});

describe('collectChangedFiles', () => {
  it('unions tracked diff and untracked files, normalizing separators', () => {
    const runGit = fakeGit({
      'diff --name-only base': 'packages/cli/src/hooks/profiles.ts\nharness.config.json',
      'ls-files --others --exclude-standard': 'docs/knowledge/decisions/0100-new.md',
    });
    const files = collectChangedFiles('base', runGit);
    expect(files).toContain('packages/cli/src/hooks/profiles.ts');
    expect(files).toContain('harness.config.json');
    expect(files).toContain('docs/knowledge/decisions/0100-new.md');
    // Three distinct paths across the two git calls.
    const expectedCount = new Set([
      'packages/cli/src/hooks/profiles.ts',
      'harness.config.json',
      'docs/knowledge/decisions/0100-new.md',
    ]).size;
    expect(files).toHaveLength(expectedCount);
  });

  it('de-duplicates a path that appears in both tracked and untracked output', () => {
    const runGit = fakeGit({
      'diff --name-only base': '.husky/pre-commit',
      'ls-files --others --exclude-standard': '.husky/pre-commit',
    });
    expect(collectChangedFiles('base', runGit)).toEqual(['.husky/pre-commit']);
  });

  it('tolerates a failing diff and still returns untracked files', () => {
    const runGit: RunGit = (args) => {
      if (args[0] === 'diff') throw new Error('bad ref');
      if (args[0] === 'ls-files') return 'docs/knowledge/decisions/0101-x.md';
      throw new Error('unexpected');
    };
    expect(collectChangedFiles('HEAD', runGit)).toEqual(['docs/knowledge/decisions/0101-x.md']);
  });
});
