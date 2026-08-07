import { describe, it, expect, vi } from 'vitest';

const { parseDiffMock } = vi.hoisted(() => ({ parseDiffMock: vi.fn() }));
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return { ...actual, parseDiff: parseDiffMock };
});

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveDiffRange,
  buildDiffInfo,
  runReviewCi,
  buildDegradedResult,
  defaultRunGit,
  GIT_MAX_BUFFER_BYTES,
  emitReviewCi,
  buildReviewBody,
  createReviewCiCommand,
  assertKnownRunner,
} from '../../src/commands/review-ci';
import { parseCiReviewVerdict } from '@harness-engineering/core';
import type { CiReviewResult, RunCiReviewOptions } from '@harness-engineering/core';
import { ExitCode } from '../../src/utils/errors';
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

// Regression coverage for issue #1098: a git diff larger than Node's default
// 1 MB `spawnSync` maxBuffer must not crash review-ci with `spawnSync git
// ENOBUFS` / exit 2 / empty stdout.
describe('defaultRunGit maxBuffer (issue #1098)', () => {
  it('exposes a generous bounded (finite) maxBuffer well above the 1 MB default', () => {
    expect(GIT_MAX_BUFFER_BYTES).toBe(256 * 1024 * 1024);
    expect(Number.isFinite(GIT_MAX_BUFFER_BYTES)).toBe(true);
    expect(GIT_MAX_BUFFER_BYTES).toBeGreaterThan(1024 * 1024);
  });

  it('returns a git diff larger than the 1 MB default without throwing ENOBUFS', () => {
    const repo = mkdtempSync(join(tmpdir(), 'review-ci-enobufs-'));
    try {
      const raw = ['-C', repo] as const;
      execFileSync('git', [...raw, 'init', '-q']);
      execFileSync('git', [...raw, 'config', 'user.email', 'test@example.com']);
      execFileSync('git', [...raw, 'config', 'user.name', 'Harness Test']);
      // ~1.7 MB single staged addition, so `git diff --cached` emits the whole
      // payload — comfortably over the 1,048,576-byte default that trips ENOBUFS.
      const big = ('x'.repeat(120) + '\n').repeat(14000);
      writeFileSync(join(repo, 'big.txt'), big);
      execFileSync('git', [...raw, 'add', 'big.txt']);

      // Baseline: the SAME call on the default (unset) maxBuffer throws ENOBUFS —
      // this is the exact bug the fix removes.
      expect(() =>
        execFileSync('git', [...raw, 'diff', '--cached'], { encoding: 'utf-8' })
      ).toThrow(/ENOBUFS/);

      // Fixed seam: the bounded maxBuffer carries the >1 MB payload back intact.
      const diff = defaultRunGit([...raw, 'diff', '--cached']);
      expect(Buffer.byteLength(diff, 'utf-8')).toBeGreaterThan(1024 * 1024);
      expect(diff).toContain('big.txt');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('graceful degradation on git failure (issue #1098)', () => {
  it('buildDegradedResult produces a parseable abstained verdict with exit 3', () => {
    const result = buildDegradedResult(new Error('spawnSync git ENOBUFS'));
    // Parseable envelope — a `--json` consumer always gets a valid verdict.
    const verdict = parseCiReviewVerdict(result.verdict);
    expect(verdict.skipped).toBe(true);
    expect(verdict.skipReason).toBe('internal error: spawnSync git ENOBUFS');
    expect(verdict.runner).toBe('floor-only');
    expect(verdict.ranLlmTier).toBe(false);
    expect(verdict.findings).toEqual([]);
    // Abstained: non-zero (never reads green) but distinct from 1 (objected) and
    // 2 (crash).
    expect(result.exitCode).toBe(ExitCode.ZERO_DENOMINATOR);
    expect(result.exitCode).toBe(3);
    expect(result.terminalOutput).toContain('not an approval');
  });

  it('degrades (does not throw) when the raw-diff resolution overflows/errors', async () => {
    const runGit = vi.fn(() => 'refs/remotes/origin/main');
    const resolveRaw = vi.fn(() => {
      throw new Error('spawnSync git ENOBUFS');
    });
    const runCiReviewImpl = vi.fn();
    const result = await runReviewCi({
      runGit,
      resolveRaw,
      runCiReviewImpl,
      diffRange: 'origin/main...HEAD',
    });
    // No throw, no exit 2: a degraded verdict is returned instead.
    expect(runCiReviewImpl).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(3);
    const verdict = parseCiReviewVerdict(result.verdict);
    expect(verdict.skipped).toBe(true);
    expect(verdict.skipReason).toContain('internal error: spawnSync git ENOBUFS');
  });

  it('degrades when the diff cannot be parsed (buildDiffInfo throws)', async () => {
    parseDiffMock.mockReturnValue({ ok: false, error: { message: 'bad diff' } });
    const runGit = vi.fn(() => 'refs/remotes/origin/main');
    const resolveRaw = vi.fn(() => 'not a valid diff');
    const runCiReviewImpl = vi.fn();
    const result = await runReviewCi({
      runGit,
      resolveRaw,
      runCiReviewImpl,
      diffRange: 'a...b',
    });
    expect(runCiReviewImpl).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(3);
    expect(parseCiReviewVerdict(result.verdict).skipReason).toContain('internal error:');
  });

  it('runs the review normally on a large (>1 MB) diff payload — no degradation', async () => {
    parseDiffMock.mockReturnValue({
      ok: true,
      value: { files: [{ path: 'big.txt', status: 'added', additions: 1, deletions: 0 }] },
    });
    const bigRaw = 'diff --git a/big.txt b/big.txt\n' + '+x'.repeat(600_000);
    expect(bigRaw.length).toBeGreaterThan(1024 * 1024);
    const runGit = vi.fn(() => 'refs/remotes/origin/main');
    const resolveRaw = vi.fn(() => bigRaw);
    const runCiReviewImpl = vi.fn(
      async () =>
        ({
          verdict: { assessment: 'approve' } as CiReviewResult['verdict'],
          exitCode: 0,
          terminalOutput: 'ok',
          ranLlmTier: true,
        }) as CiReviewResult
    );
    const result = await runReviewCi({
      runGit,
      resolveRaw,
      runCiReviewImpl,
      diffRange: 'a...b',
    });
    // The large diff reaches the real reviewer — a genuine verdict, not an abstention.
    expect(runCiReviewImpl).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(0);
    expect(result.verdict.assessment).toBe('approve');
  });

  it('still fails fast (throws) on an unknown runner — NOT laundered into an abstention', async () => {
    const runGit = vi.fn(() => 'refs/remotes/origin/main');
    const resolveRaw = vi.fn(() => 'diff --git a/x b/x\n+x');
    await expect(
      runReviewCi({ runGit, resolveRaw, runner: 'nope', diffRange: 'a...b' })
    ).rejects.toThrow(/unknown runner 'nope'/);
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

  it('emits the JSON artifact to stdout (not a file) when jsonPath is true', () => {
    const writeFile = vi.fn();
    const log = vi.fn();
    emitReviewCi(result, { jsonPath: true }, writeFile, log);
    expect(writeFile).not.toHaveBeenCalled();
    // Human summary is suppressed so stdout stays valid, pipeable JSON.
    expect(log).not.toHaveBeenCalledWith('TERMINAL_SUMMARY');
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
      assessment: 'request-changes',
    });
  });

  it('posts the verdict via the PR poster when --comment is set', () => {
    const postReview = vi.fn();
    emitReviewCi(result, { comment: true }, vi.fn(), vi.fn(), postReview);
    expect(postReview).toHaveBeenCalledTimes(1);
    expect(postReview.mock.calls[0]![0]).toMatchObject({ assessment: 'request-changes' });
  });

  it('warns (does not throw) when the PR poster fails', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const postReview = vi.fn(() => {
      throw new Error('gh: no PR found');
    });
    expect(() =>
      emitReviewCi(result, { comment: true }, vi.fn(), vi.fn(), postReview)
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('failed to post PR comment');
    warn.mockRestore();
  });

  it('does not post when --comment is absent', () => {
    const postReview = vi.fn();
    emitReviewCi(result, {}, vi.fn(), vi.fn(), postReview);
    expect(postReview).not.toHaveBeenCalled();
  });
});

describe('buildReviewBody', () => {
  it('renders assessment, counts, and blocking findings as Markdown', () => {
    const verdict = {
      assessment: 'request-changes',
      runner: 'claude',
      findings: [
        { id: 'a', file: 'src/a.ts', lineRange: [10, 10], severity: 'critical', title: 'Boom' },
        { id: 'b', file: 'src/b.ts', lineRange: [3, 3], severity: 'info', title: 'Nit' },
      ],
      blockingFindings: [
        { id: 'a', file: 'src/a.ts', lineRange: [10, 10], severity: 'critical', title: 'Boom' },
      ],
    } as unknown as CiReviewResult['verdict'];

    const body = buildReviewBody(verdict);

    expect(body).toContain('harness review-ci — request-changes');
    expect(body).toContain('Findings:** 2 (blocking: 1)');
    expect(body).toContain('### Blocking');
    expect(body).toContain('`critical` **src/a.ts:10** — Boom');
    expect(body).toContain('### Other findings');
    expect(body).toContain('`info` **src/b.ts:3** — Nit');
  });

  it('renders a clean verdict when there are no findings', () => {
    const verdict = {
      assessment: 'approve',
      runner: 'floor-only',
      findings: [],
      blockingFindings: [],
    } as unknown as CiReviewResult['verdict'];
    expect(buildReviewBody(verdict)).toContain('No findings.');
  });
});

describe('createReviewCiCommand', () => {
  it('is named review-ci and exposes all five options', () => {
    const cmd = createReviewCiCommand();
    expect(cmd.name()).toBe('review-ci');
    const flags = cmd.options.map((o) => o.long);
    expect(flags).toEqual(
      expect.arrayContaining(['--runner', '--block-on', '--diff', '--comment', '--out'])
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
