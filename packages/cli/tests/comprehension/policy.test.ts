import { describe, it, expect } from 'vitest';
import {
  MAIN_BRANCH,
  resolveComprehensionBranch,
  isMainPassContext,
  committedSemanticAllowed,
} from '../../src/comprehension/policy';

describe('resolveComprehensionBranch', () => {
  it('prefers explicit CI env vars over git', () => {
    const env = { GITHUB_HEAD_REF: 'feat/x' } as NodeJS.ProcessEnv;
    // exec must NOT be consulted when an env branch is present.
    const branch = resolveComprehensionBranch(env, () => {
      throw new Error('git should not be called');
    });
    expect(branch).toBe('feat/x');
  });

  it('falls back to git rev-parse when no env branch is set', () => {
    const branch = resolveComprehensionBranch({} as NodeJS.ProcessEnv, () => 'main\n');
    expect(branch).toBe(MAIN_BRANCH);
  });

  it('treats a detached-HEAD "HEAD" as unknown (null)', () => {
    expect(resolveComprehensionBranch({} as NodeJS.ProcessEnv, () => 'HEAD\n')).toBeNull();
  });

  it('returns null when git throws (no repo)', () => {
    expect(
      resolveComprehensionBranch({} as NodeJS.ProcessEnv, () => {
        throw new Error('not a git repo');
      })
    ).toBeNull();
  });
});

describe('isMainPassContext (ADR 0116 single-writer)', () => {
  it('is TRUE on the main branch (maintainer-local main pass)', () => {
    expect(isMainPassContext({ branch: 'main', env: {} as NodeJS.ProcessEnv })).toBe(true);
  });

  it('is FALSE on any feature branch (the PR path)', () => {
    expect(isMainPassContext({ branch: 'feat/x', env: {} as NodeJS.ProcessEnv })).toBe(false);
  });

  it('is FALSE when the branch is unknown (conservative: not the single writer)', () => {
    expect(isMainPassContext({ branch: null, env: {} as NodeJS.ProcessEnv })).toBe(false);
  });

  it('is TRUE when GITHUB_REF is refs/heads/main (CI push to main, detached HEAD)', () => {
    expect(
      isMainPassContext({
        branch: null,
        env: { GITHUB_REF: 'refs/heads/main' } as NodeJS.ProcessEnv,
      })
    ).toBe(true);
  });

  it('is FALSE when GITHUB_REF is a PR merge ref', () => {
    expect(
      isMainPassContext({
        branch: 'feat/x',
        env: { GITHUB_REF: 'refs/pull/42/merge' } as NodeJS.ProcessEnv,
      })
    ).toBe(false);
  });

  it('honours the explicit HARNESS_COMPREHENSION_MAIN_PASS=1 override (the #1689 / post-merge seam)', () => {
    expect(
      isMainPassContext({
        branch: 'feat/x',
        env: { HARNESS_COMPREHENSION_MAIN_PASS: '1' } as NodeJS.ProcessEnv,
      })
    ).toBe(true);
  });
});

describe('committedSemanticAllowed', () => {
  it('delegates to the branch resolver + env (allowed on main)', () => {
    expect(committedSemanticAllowed({} as NodeJS.ProcessEnv, () => 'main')).toBe(true);
  });

  it('denies committed semantic on a branch', () => {
    expect(committedSemanticAllowed({} as NodeJS.ProcessEnv, () => 'feat/x')).toBe(false);
  });

  it('denies when the branch cannot be resolved (null)', () => {
    expect(committedSemanticAllowed({} as NodeJS.ProcessEnv, () => null)).toBe(false);
  });
});
