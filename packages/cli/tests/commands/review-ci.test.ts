import { describe, it, expect, vi } from 'vitest';
import { resolveDiffRange } from '../../src/commands/review-ci';

describe('resolveDiffRange', () => {
  it('uses provided range verbatim', () => {
    const runGit = vi.fn();
    expect(resolveDiffRange({ range: 'a...b', runGit })).toBe('a...b');
    expect(runGit).not.toHaveBeenCalled();
  });

  it('defaults to origin/<base>...HEAD using resolved base branch', () => {
    const runGit = vi.fn().mockReturnValue('refs/remotes/origin/main');
    expect(resolveDiffRange({ runGit })).toBe('origin/main...HEAD');
  });

  it('falls back to origin/main...HEAD when base cannot be resolved', () => {
    const runGit = vi.fn(() => {
      throw new Error('no upstream');
    });
    expect(resolveDiffRange({ runGit })).toBe('origin/main...HEAD');
  });

  it('resolves a non-main base branch from symbolic-ref', () => {
    const runGit = vi.fn().mockReturnValue('refs/remotes/origin/develop');
    expect(resolveDiffRange({ runGit })).toBe('origin/develop...HEAD');
  });
});
