import { describe, it, expect, vi } from 'vitest';

const { parseDiffMock } = vi.hoisted(() => ({ parseDiffMock: vi.fn() }));
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return { ...actual, parseDiff: parseDiffMock };
});

import { resolveDiffRange, buildDiffInfo } from '../../src/commands/review-ci';

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

describe('buildDiffInfo', () => {
  it('maps parsed files into a DiffInfo (changed/new/deleted) and splits per-file diffs', () => {
    parseDiffMock.mockReturnValue({
      ok: true,
      value: {
        files: [
          { path: 'src/a.ts', status: 'added', additions: 1, deletions: 0 },
          { path: 'src/b.ts', status: 'deleted', additions: 0, deletions: 1 },
        ],
      },
    });
    const raw = [
      'diff --git a/src/a.ts b/src/a.ts',
      '+new line a',
      'diff --git a/src/b.ts b/src/b.ts',
      '-old line b',
    ].join('\n');
    const info = buildDiffInfo(raw);
    expect(info.changedFiles).toEqual(['src/a.ts', 'src/b.ts']);
    expect(info.newFiles).toEqual(['src/a.ts']);
    expect(info.deletedFiles).toEqual(['src/b.ts']);
    expect(info.totalDiffLines).toBe(4);
    // fileDiffs carries the real per-file unified-diff section (not empty),
    // so core's diffToStdin reconstructs a non-empty diff for the LLM tier.
    expect(info.fileDiffs.get('src/a.ts')).toContain('+new line a');
    expect(info.fileDiffs.get('src/a.ts')).toContain('diff --git a/src/a.ts');
    expect(info.fileDiffs.get('src/b.ts')).toContain('-old line b');
  });

  it('throws a descriptive error when parseDiff fails', () => {
    parseDiffMock.mockReturnValue({ ok: false, error: { message: 'bad diff' } });
    expect(() => buildDiffInfo('garbage')).toThrow(/Failed to parse diff: bad diff/);
  });
});
