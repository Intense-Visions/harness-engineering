import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import type { OutcomeVerdict } from '@harness-engineering/intelligence';

// Force the provider to resolve to null so the REAL buildEvaluator path degrades
// deterministically (unconfiguredProvider → evaluate rejects → advisory) without
// touching the network, an API key, or the claude CLI.
vi.mock('../../src/mcp/utils/analysis-provider', () => ({
  resolveAnalysisProvider: vi.fn().mockResolvedValue(null),
}));

import {
  runOutcomeEvalCi,
  buildOutcomeBody,
  emitOutcomeEvalCi,
  createOutcomeEvalCiCommand,
  type OutcomeEvaluatorLike,
} from '../../src/commands/outcome-eval-ci';

// -----------------------------------------------------------------------------
// outcome-eval-ci-cov544b — branch-coverage lift for src/commands/outcome-eval-ci.ts.
// Targets the degrade seams and pure branches the existing suite leaves uncovered:
// the default resolveDiff path + its catch, resolveTestOutput's no-path and catch
// branches, safeHeadSha success/failure, persistGraph's no-save-method / no-store
// guards, buildOutcomeBody's advisory (💬) icon + empty-rationale branch, and
// emitOutcomeEvalCi's neither-json path + comment-success path.
// -----------------------------------------------------------------------------

function verdict(overrides: Partial<OutcomeVerdict> = {}): OutcomeVerdict {
  return {
    verdict: 'SATISFIED',
    confidence: 'high',
    rationale: 'ok',
    judgedAgainst: 'success-criteria',
    unmetCriteria: [],
    authority: 'advisory',
    ...overrides,
  };
}

function capturingEvaluator(v: OutcomeVerdict): {
  evaluator: OutcomeEvaluatorLike;
  calls: Array<Record<string, unknown>>;
} {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    evaluator: { evaluate: async (input) => (calls.push(input), v) },
  };
}

describe('runOutcomeEvalCi — diff/test-output/commit seams', () => {
  const specPath = 'docs/changes/f/proposal.md';

  it('uses the default resolveRaw (git diff) and stamps the HEAD sha when no commit given', async () => {
    const runGit = vi.fn((args: string[]) => (args[0] === 'rev-parse' ? 'SHA123' : 'DIFF-TEXT'));
    const { evaluator, calls } = capturingEvaluator(verdict());
    const res = await runOutcomeEvalCi({
      cwd: '/repo',
      diffRange: 'main...HEAD',
      specPath,
      runGit,
      makeEvaluator: async () => evaluator,
      store: {}, // no save() method → persistGraph early-returns
    });
    expect(res.exitCode).toBe(0);
    expect(calls[0]).toMatchObject({ diff: 'DIFF-TEXT', commit: 'SHA123', testOutput: '' });
  });

  it('degrades the diff to empty string when resolveRaw throws', async () => {
    const { evaluator, calls } = capturingEvaluator(verdict());
    await runOutcomeEvalCi({
      cwd: '/repo',
      diffRange: 'main...HEAD',
      specPath,
      commit: 'c0',
      runGit: vi.fn().mockReturnValue('x'),
      resolveRaw: () => {
        throw new Error('git diff boom');
      },
      makeEvaluator: async () => evaluator,
      store: undefined, // store undefined → persist skipped entirely
    });
    expect(calls[0].diff).toBe('');
  });

  it('degrades test output to empty string when the reader throws', async () => {
    const { evaluator, calls } = capturingEvaluator(verdict());
    await runOutcomeEvalCi({
      cwd: '/repo',
      diffRange: 'r',
      specPath,
      commit: 'c0',
      runGit: vi.fn().mockReturnValue('x'),
      resolveRaw: () => 'd',
      testOutputPath: '/tmp/does-not-exist.txt',
      readTestOutput: () => {
        throw new Error('ENOENT');
      },
      makeEvaluator: async () => evaluator,
    });
    expect(calls[0].testOutput).toBe('');
  });

  it('leaves the commit unset when rev-parse fails (safeHeadSha returns undefined)', async () => {
    const runGit = vi.fn((args: string[]) => {
      if (args[0] === 'rev-parse') throw new Error('no HEAD');
      return 'd';
    });
    const { evaluator, calls } = capturingEvaluator(verdict());
    await runOutcomeEvalCi({
      cwd: '/repo',
      diffRange: 'r',
      specPath,
      runGit,
      resolveRaw: () => 'd',
      makeEvaluator: async () => evaluator,
    });
    expect(calls[0]).not.toHaveProperty('commit');
  });
});

describe('buildOutcomeBody — advisory icon + empty rationale', () => {
  it('uses the 💬 icon for an advisory, non-satisfied verdict', () => {
    const body = buildOutcomeBody(
      verdict({ verdict: 'INCONCLUSIVE', authority: 'advisory', rationale: '' })
    );
    expect(body).toContain('💬');
    expect(body).toContain('harness outcome-eval — INCONCLUSIVE');
    // Empty rationale must not add a stray body line beyond the header block.
    expect(body).toContain('Ship authority is derived in TypeScript');
  });
});

describe('emitOutcomeEvalCi — neither-json + comment-success', () => {
  it('prints only the human summary when jsonPath is undefined', () => {
    const logs: string[] = [];
    const writes: Array<[string, string]> = [];
    emitOutcomeEvalCi(
      { verdict: verdict(), exitCode: 0 },
      {},
      (p, d) => writes.push([p, d]),
      (m) => logs.push(m)
    );
    expect(writes).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('harness outcome-eval');
  });

  it('invokes postOutcome without a warning when comment succeeds', () => {
    const post = vi.fn();
    emitOutcomeEvalCi(
      { verdict: verdict(), exitCode: 0 },
      { comment: true },
      () => {},
      () => {},
      post
    );
    expect(post).toHaveBeenCalledOnce();
  });
});

describe('createOutcomeEvalCiCommand — real buildEvaluator degrade path', () => {
  let exitCode: number | null;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let outSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitCode = null;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      exitCode = c ?? 0;
      throw new Error(`__exit__:${exitCode}`);
    }) as never);
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    outSpy.mockRestore();
  });

  it('builds the real evaluator, degrades to advisory with no provider, and exits 0', async () => {
    const program = new Command();
    program.option('--json');
    program.addCommand(createOutcomeEvalCiCommand());
    try {
      // Explicit --spec (verbatim, no git needed to resolve it) and a trivial
      // --diff range keep the run deterministic; the mocked provider forces the
      // degrade branch inside the REAL buildEvaluator/OutcomeEvaluator.
      await program.parseAsync(
        ['outcome-eval-ci', '--spec', 'docs/changes/none/proposal.md', '--diff', 'HEAD'],
        { from: 'user' }
      );
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
    }
    // Degrade-safe: no provider → advisory verdict → gate never blocks.
    expect(exitCode).toBe(0);
  });
});
