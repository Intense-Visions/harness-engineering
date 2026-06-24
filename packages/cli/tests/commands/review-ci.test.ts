import { describe, it, expect, vi } from 'vitest';

const { parseDiffMock } = vi.hoisted(() => ({ parseDiffMock: vi.fn() }));
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return { ...actual, parseDiff: parseDiffMock };
});

import {
  resolveDiffRange,
  buildDiffInfo,
  runReviewCi,
  emitReviewCi,
  createReviewCiCommand,
  assertKnownRunner,
} from '../../src/commands/review-ci';
import type { CiReviewResult, RunCiReviewOptions } from '@harness-engineering/core';
import { logger } from '../../src/output/logger';

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

  it('reports totalDiffLines=0 for an empty diff (not 1)', () => {
    parseDiffMock.mockReturnValue({ ok: true, value: { files: [] } });
    const info = buildDiffInfo('');
    expect(info.totalDiffLines).toBe(0);
  });

  it('does not duplicate the whole raw diff on a path-key miss (path with a space)', () => {
    // core's parseDiff is mocked to return the b-side path; the per-file splitter
    // must key on the SAME path so the section is found and the whole raw diff is
    // never substituted for a single file. The split path keys must align with the
    // path parseDiff yields, even for paths containing spaces.
    parseDiffMock.mockReturnValue({
      ok: true,
      value: {
        files: [{ path: 'src/my file.ts', status: 'modified', additions: 1, deletions: 0 }],
      },
    });
    const raw = ['diff --git a/src/my file.ts b/src/my file.ts', '+changed'].join('\n');
    const info = buildDiffInfo(raw);
    const section = info.fileDiffs.get('src/my file.ts');
    expect(section).toBeDefined();
    // The section must be the per-file content, NOT the entire raw diff duplicated.
    expect(section).toContain('+changed');
    // It must contain exactly one diff --git header (its own), never duplicated.
    expect((section!.match(/diff --git/g) ?? []).length).toBe(1);
  });

  it('falls back to empty (not the whole raw diff) when a path key truly misses', () => {
    // parseDiff yields a path the splitter cannot key (forces a miss); the fallback
    // must be '' so the file contributes no diff rather than duplicating everything.
    parseDiffMock.mockReturnValue({
      ok: true,
      value: {
        files: [{ path: 'does/not/match.ts', status: 'modified', additions: 0, deletions: 0 }],
      },
    });
    const raw = ['diff --git a/other.ts b/other.ts', '+x', '+y', '+z'].join('\n');
    const info = buildDiffInfo(raw);
    expect(info.fileDiffs.get('does/not/match.ts')).toBe('');
  });
});

describe('assertKnownRunner', () => {
  it.each(['claude', 'gemini', 'antigravity', 'codex', 'cursor', 'local'])(
    'accepts real runner id %s',
    (id) => {
      expect(() => assertKnownRunner(id)).not.toThrow();
    }
  );

  it('accepts undefined (floor-only)', () => {
    expect(() => assertKnownRunner(undefined)).not.toThrow();
  });

  it('rejects an unknown runner with a clear, enumerated message', () => {
    expect(() => assertKnownRunner('foo')).toThrow(
      /unknown runner 'foo'.*claude.*antigravity.*codex.*cursor.*local/s
    );
  });
});

describe('runReviewCi', () => {
  function makeResult(exitCode: number): CiReviewResult {
    return {
      verdict: { assessment: 'approve' } as CiReviewResult['verdict'],
      exitCode,
      terminalOutput: 'ok',
      ranLlmTier: false,
    } as CiReviewResult;
  }

  function setup(exitCode = 0) {
    parseDiffMock.mockReturnValue({ ok: true, value: { files: [] } });
    const captured: { opts?: RunCiReviewOptions } = {};
    const runCiReviewImpl = vi.fn(async (opts: RunCiReviewOptions) => {
      captured.opts = opts;
      return makeResult(exitCode);
    });
    const runGit = vi.fn(() => 'refs/remotes/origin/main');
    const resolveRaw = vi.fn(() => 'diff --git a/x b/x\n+x');
    return { captured, runCiReviewImpl, runGit, resolveRaw };
  }

  it('floor-only: no runner -> runner undefined and no localInvoke', async () => {
    const { captured, runCiReviewImpl, runGit, resolveRaw } = setup();
    await runReviewCi({ runCiReviewImpl, runGit, resolveRaw, diffRange: 'a...b' });
    expect(runCiReviewImpl).toHaveBeenCalledTimes(1);
    expect(captured.opts!.runner).toBeUndefined();
    expect(captured.opts!.localInvoke).toBeUndefined();
  });

  it('runner=local -> a localInvoke function is injected', async () => {
    const { captured, runCiReviewImpl, runGit, resolveRaw } = setup();
    await runReviewCi({ runCiReviewImpl, runGit, resolveRaw, runner: 'local', diffRange: 'a...b' });
    expect(captured.opts!.runner).toBe('local');
    expect(typeof captured.opts!.localInvoke).toBe('function');
  });

  it('runner=local honors an explicitly injected localInvoke seam', async () => {
    const { captured, runCiReviewImpl, runGit, resolveRaw } = setup();
    const localInvoke = vi.fn(async () => '{}');
    await runReviewCi({
      runCiReviewImpl,
      runGit,
      resolveRaw,
      runner: 'local',
      localInvoke,
      diffRange: 'a...b',
    });
    expect(captured.opts!.localInvoke).toBe(localInvoke);
  });

  it('agent-cli runner (claude) -> runner passed through, no localInvoke', async () => {
    const { captured, runCiReviewImpl, runGit, resolveRaw } = setup();
    await runReviewCi({
      runCiReviewImpl,
      runGit,
      resolveRaw,
      runner: 'claude',
      diffRange: 'a...b',
    });
    expect(captured.opts!.runner).toBe('claude');
    expect(captured.opts!.localInvoke).toBeUndefined();
  });

  it('propagates the orchestrator exitCode unchanged', async () => {
    const { runCiReviewImpl, runGit, resolveRaw } = setup(1);
    const result = await runReviewCi({ runCiReviewImpl, runGit, resolveRaw, diffRange: 'a...b' });
    expect(result.exitCode).toBe(1);
  });

  it('forwards blockOn when provided', async () => {
    const { captured, runCiReviewImpl, runGit, resolveRaw } = setup();
    await runReviewCi({
      runCiReviewImpl,
      runGit,
      resolveRaw,
      blockOn: 'critical',
      diffRange: 'a...b',
    });
    expect(captured.opts!.blockOn).toBe('critical');
  });

  it('rejects an unknown runner before delegating (fails closed with a clear error)', async () => {
    const { runCiReviewImpl, runGit, resolveRaw } = setup();
    await expect(
      runReviewCi({ runCiReviewImpl, runGit, resolveRaw, runner: 'foo', diffRange: 'a...b' })
    ).rejects.toThrow(/unknown runner 'foo'/);
    // It must reject at the boundary, never reaching the orchestrator with a bad cast.
    expect(runCiReviewImpl).not.toHaveBeenCalled();
  });
});

describe('emitReviewCi', () => {
  const result = {
    verdict: { assessment: 'request-changes', findings: [] },
    exitCode: 1,
    terminalOutput: 'TERMINAL_SUMMARY',
    ranLlmTier: false,
  } as unknown as CiReviewResult;

  it('prints terminalOutput to the log seam', () => {
    const log = vi.fn();
    emitReviewCi(result, {}, vi.fn(), log);
    expect(log).toHaveBeenCalledWith('TERMINAL_SUMMARY');
  });

  it('writes JSON.stringify(verdict) to jsonPath when given', () => {
    const writeFile = vi.fn();
    emitReviewCi(result, { jsonPath: '/tmp/v.json' }, writeFile, vi.fn());
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [path, data] = writeFile.mock.calls[0]!;
    expect(path).toBe('/tmp/v.json');
    expect(JSON.parse(data as string)).toMatchObject({ assessment: 'request-changes' });
  });

  it('does not write a file when jsonPath is omitted', () => {
    const writeFile = vi.fn();
    emitReviewCi(result, {}, writeFile, vi.fn());
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('warns the documented stub when --comment is set', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    emitReviewCi(result, { comment: true }, vi.fn(), vi.fn());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('comment posting is not yet wired');
    warn.mockRestore();
  });

  it('does not warn when --comment is absent', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    emitReviewCi(result, {}, vi.fn(), vi.fn());
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('createReviewCiCommand', () => {
  it('is named review-ci and exposes all five options', () => {
    const cmd = createReviewCiCommand();
    expect(cmd.name()).toBe('review-ci');
    const flags = cmd.options.map((o) => o.long);
    expect(flags).toEqual(
      expect.arrayContaining(['--runner', '--block-on', '--diff', '--comment', '--json'])
    );
  });

  it('defaults --block-on to request-changes', () => {
    const cmd = createReviewCiCommand();
    const blockOn = cmd.options.find((o) => o.long === '--block-on');
    expect(blockOn?.defaultValue).toBe('request-changes');
  });

  it('constrains --runner to the real runner id list via commander choices', () => {
    const cmd = createReviewCiCommand();
    const runner = cmd.options.find((o) => o.long === '--runner');
    expect(runner?.argChoices).toEqual(
      expect.arrayContaining(['claude', 'gemini', 'antigravity', 'codex', 'cursor', 'local'])
    );
  });

  it('constrains --block-on to the real assessment levels + none via commander choices', () => {
    // `critical` is a finding severity, NOT an assessment; the valid block-on
    // levels are core's CI_ASSESSMENTS (approve|comment|request-changes) plus none.
    const cmd = createReviewCiCommand();
    const blockOn = cmd.options.find((o) => o.long === '--block-on');
    expect(blockOn?.argChoices).toEqual(['approve', 'comment', 'request-changes', 'none']);
  });
});
