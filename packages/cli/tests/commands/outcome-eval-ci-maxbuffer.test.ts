import { describe, it, expect, vi } from 'vitest';

// Capture the options the DEFAULT git runner hands execFileSync. Node's default
// maxBuffer is 1MB; a larger `git diff` throws ENOBUFS, which is how the ship
// gate came to grade an empty diff on exactly the large changes (#2321).
const { execFileSync } = vi.hoisted(() => ({
  execFileSync: vi.fn((_cmd: string, args: string[]) =>
    args[0] === 'rev-parse' ? 'abc123\n' : 'diff --git a/x b/x\n+x\n'
  ),
}));
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync,
}));

import { runOutcomeEvalCi, GIT_DIFF_MAX_BUFFER } from '../../src/commands/outcome-eval-ci';

describe('outcome-eval-ci default git runner — maxBuffer (#2321)', () => {
  it('reads the diff with a maxBuffer well above Node’s 1MB default', async () => {
    const calls: Array<{ diff: string }> = [];
    await runOutcomeEvalCi({
      cwd: '/repo',
      diffRange: 'main...HEAD',
      specPath: 'docs/changes/f/proposal.md',
      makeEvaluator: async () => ({
        evaluate: async (input) => {
          calls.push(input);
          return {
            verdict: 'SATISFIED',
            confidence: 'high',
            rationale: 'ok',
            judgedAgainst: 'success-criteria',
            unmetCriteria: [],
            authority: 'advisory',
          };
        },
      }),
    });
    const diffCall = execFileSync.mock.calls.find((c) => c[1][0] === 'diff');
    expect(diffCall).toBeDefined();
    const opts = diffCall![2] as { maxBuffer?: number };
    expect(typeof opts.maxBuffer).toBe('number');
    expect(opts.maxBuffer).toBeGreaterThanOrEqual(64 * 1024 * 1024);
    expect(opts.maxBuffer).toBe(GIT_DIFF_MAX_BUFFER);
    expect(calls[0].diff).toContain('diff --git');
  });
});
