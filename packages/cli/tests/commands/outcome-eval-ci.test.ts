import { describe, it, expect, vi } from 'vitest';
import type { OutcomeVerdict } from '@harness-engineering/intelligence';
import {
  deriveExitCode,
  resolveSpecPath,
  runOutcomeEvalCi,
  buildOutcomeBody,
  emitOutcomeEvalCi,
  type OutcomeEvaluatorLike,
} from '../../src/commands/outcome-eval-ci';

/** A minimal verdict factory. */
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

/** An evaluator seam that returns a fixed verdict and records its input. */
function stubEvaluator(v: OutcomeVerdict): {
  evaluator: OutcomeEvaluatorLike;
  calls: Array<{ specPath: string; diff: string; testOutput: string; commit?: string }>;
} {
  const calls: Array<{ specPath: string; diff: string; testOutput: string; commit?: string }> = [];
  return {
    calls,
    evaluator: {
      evaluate: async (input) => {
        calls.push(input);
        return v;
      },
    },
  };
}

describe('deriveExitCode — the TS authority becomes the gate', () => {
  it('blocks (exit 1) on a blocking verdict when --block-on blocking', () => {
    expect(deriveExitCode(verdict({ authority: 'blocking' }), 'blocking')).toBe(1);
  });

  it('does not block an advisory verdict', () => {
    expect(deriveExitCode(verdict({ authority: 'advisory' }), 'blocking')).toBe(0);
  });

  it('never blocks when --block-on none, even on a blocking verdict', () => {
    expect(deriveExitCode(verdict({ authority: 'blocking' }), 'none')).toBe(0);
  });
});

describe('resolveSpecPath', () => {
  it('uses an explicit spec verbatim (no git call)', () => {
    const runGit = vi.fn();
    expect(
      resolveSpecPath({ specPath: 'docs/x/proposal.md', range: 'r', cwd: '/repo', runGit })
    ).toBe('docs/x/proposal.md');
    expect(runGit).not.toHaveBeenCalled();
  });

  it('auto-discovers a docs/changes/<slug>/proposal.md from the diff', () => {
    const runGit = vi
      .fn()
      .mockReturnValue('src/a.ts\ndocs/changes/my-feature/proposal.md\nREADME.md');
    expect(resolveSpecPath({ range: 'r', cwd: '/repo', runGit })).toBe(
      '/repo/docs/changes/my-feature/proposal.md'
    );
  });

  it('returns undefined when no spec is in the diff (degradation path)', () => {
    const runGit = vi.fn().mockReturnValue('src/a.ts\nsrc/b.ts');
    expect(resolveSpecPath({ range: 'r', cwd: '/repo', runGit })).toBeUndefined();
  });

  it('returns undefined when git fails (degradation path)', () => {
    const runGit = vi.fn(() => {
      throw new Error('no git');
    });
    expect(resolveSpecPath({ range: 'r', cwd: '/repo', runGit })).toBeUndefined();
  });
});

describe('runOutcomeEvalCi — the gate fires and honors the verdict authority', () => {
  const baseOpts = {
    cwd: '/repo',
    diffRange: 'main...HEAD',
    specPath: 'docs/changes/f/proposal.md',
    runGit: vi.fn().mockReturnValue('abc123'),
    resolveRaw: () => 'diff --git a/x b/x\n+content',
  };

  it('exits 1 on a high-confidence NOT_SATISFIED (blocking)', async () => {
    const { evaluator } = stubEvaluator(
      verdict({ verdict: 'NOT_SATISFIED', confidence: 'high', authority: 'blocking' })
    );
    const store = { save: vi.fn().mockResolvedValue(undefined) };
    const res = await runOutcomeEvalCi({
      ...baseOpts,
      makeEvaluator: async () => evaluator,
      store,
    });
    expect(res.exitCode).toBe(1);
    expect(res.verdict.authority).toBe('blocking');
    // Persistence still happens on a blocking verdict.
    expect(store.save).toHaveBeenCalledOnce();
  });

  it('exits 0 on an advisory NOT_SATISFIED (medium confidence)', async () => {
    const { evaluator } = stubEvaluator(
      verdict({ verdict: 'NOT_SATISFIED', confidence: 'medium', authority: 'advisory' })
    );
    const res = await runOutcomeEvalCi({
      ...baseOpts,
      makeEvaluator: async () => evaluator,
      store: { save: vi.fn().mockResolvedValue(undefined) },
    });
    expect(res.exitCode).toBe(0);
  });

  it('never blocks when --block-on none even on a blocking verdict', async () => {
    const { evaluator } = stubEvaluator(verdict({ authority: 'blocking' }));
    const res = await runOutcomeEvalCi({
      ...baseOpts,
      blockOn: 'none',
      makeEvaluator: async () => evaluator,
      store: { save: vi.fn().mockResolvedValue(undefined) },
    });
    expect(res.exitCode).toBe(0);
  });

  it('threads the resolved diff, test output, and commit into the evaluator', async () => {
    const stub = stubEvaluator(verdict());
    await runOutcomeEvalCi({
      ...baseOpts,
      commit: 'deadbeef',
      testOutputPath: '/tmp/tests.txt',
      readTestOutput: () => 'PASS 10 tests',
      makeEvaluator: async () => stub.evaluator,
      store: { save: vi.fn().mockResolvedValue(undefined) },
    });
    expect(stub.calls[0]).toMatchObject({
      specPath: 'docs/changes/f/proposal.md',
      diff: 'diff --git a/x b/x\n+content',
      testOutput: 'PASS 10 tests',
      commit: 'deadbeef',
    });
  });

  it('degrades to advisory (exit 0) when no spec can be resolved — never blocks a spec-less PR', async () => {
    const res = await runOutcomeEvalCi({
      cwd: '/repo',
      diffRange: 'main...HEAD',
      runGit: vi.fn().mockReturnValue('src/only.ts'),
    });
    expect(res.exitCode).toBe(0);
    expect(res.verdict.verdict).toBe('INCONCLUSIVE');
    expect(res.verdict.authority).toBe('advisory');
  });

  it('degrades to advisory (exit 0) when the evaluator throws — never blocks on infra noise', async () => {
    const throwing: OutcomeEvaluatorLike = {
      evaluate: async () => {
        throw new Error('provider exploded');
      },
    };
    const res = await runOutcomeEvalCi({
      ...baseOpts,
      makeEvaluator: async () => throwing,
      store: { save: vi.fn() },
    });
    expect(res.exitCode).toBe(0);
    expect(res.verdict.authority).toBe('advisory');
  });

  it('swallows a persistence failure — the verdict and gate are unaffected', async () => {
    const { evaluator } = stubEvaluator(verdict({ authority: 'blocking' }));
    const store = {
      save: vi.fn().mockRejectedValue(new Error('disk full')),
    };
    const res = await runOutcomeEvalCi({
      ...baseOpts,
      makeEvaluator: async () => evaluator,
      store,
    });
    expect(res.exitCode).toBe(1);
    expect(store.save).toHaveBeenCalledOnce();
  });
});

describe('buildOutcomeBody', () => {
  it('renders a blocking verdict with the unmet criteria', () => {
    const body = buildOutcomeBody(
      verdict({
        verdict: 'NOT_SATISFIED',
        confidence: 'high',
        authority: 'blocking',
        rationale: 'the 404 branch is missing',
        unmetCriteria: ['404 path unimplemented'],
      })
    );
    expect(body).toContain('harness outcome-eval — NOT_SATISFIED');
    expect(body).toContain('`blocking`');
    expect(body).toContain('- 404 path unimplemented');
    expect(body).toContain('the 404 branch is missing');
  });

  it('renders a satisfied verdict without an unmet-criteria section', () => {
    const body = buildOutcomeBody(verdict());
    expect(body).toContain('SATISFIED');
    expect(body).not.toContain('### Unmet criteria');
  });
});

describe('emitOutcomeEvalCi', () => {
  it('streams verdict JSON to stdout and suppresses the summary when jsonPath === true', () => {
    const logs: string[] = [];
    emitOutcomeEvalCi(
      { verdict: verdict(), exitCode: 0 },
      { jsonPath: true },
      () => {},
      (m) => logs.push(m)
    );
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]).verdict).toBe('SATISFIED');
  });

  it('writes the JSON artifact to a path and prints the human summary', () => {
    const writes: Array<[string, string]> = [];
    const logs: string[] = [];
    emitOutcomeEvalCi(
      { verdict: verdict(), exitCode: 0 },
      { jsonPath: '/tmp/out.json' },
      (p, d) => writes.push([p, d]),
      (m) => logs.push(m)
    );
    expect(writes[0][0]).toBe('/tmp/out.json');
    expect(logs.join('\n')).toContain('harness outcome-eval');
  });

  it('posts a PR comment when comment=true, degrading a post failure to a warning', () => {
    const post = vi.fn(() => {
      throw new Error('gh missing');
    });
    expect(() =>
      emitOutcomeEvalCi(
        { verdict: verdict(), exitCode: 0 },
        { comment: true },
        () => {},
        () => {},
        post
      )
    ).not.toThrow();
    expect(post).toHaveBeenCalledOnce();
  });
});
