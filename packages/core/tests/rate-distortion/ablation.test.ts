import { describe, it, expect } from 'vitest';
import { applyAblation, ablationSuite, runAblationSuite } from '../../src/rate-distortion/ablation';
import { INFORMATION_CLASSES, BASELINE } from '../../src/rate-distortion/types';
import type { Ablation, ReplayOutcome, ReplayRun } from '../../src/rate-distortion/types';

const run: ReplayRun = {
  runId: 'r1',
  taskClass: 'implementation',
  context: {
    'prior-tool-results': 'tool output',
    'stated-constraints': 'must not break the API',
    'code-excerpts': 'function foo() {}',
  },
};

describe('applyAblation', () => {
  it('returns an unchanged copy for the baseline', () => {
    const result = applyAblation(run, BASELINE);
    expect(result).toEqual(run.context);
    expect(result).not.toBe(run.context); // copy, not the same reference
  });

  it('removes exactly the ablated class', () => {
    const result = applyAblation(run, {
      kind: 'ablated',
      informationClass: 'stated-constraints',
    });
    expect(result['stated-constraints']).toBeUndefined();
    expect(result['prior-tool-results']).toBe('tool output');
    expect(result['code-excerpts']).toBe('function foo() {}');
  });

  it('never mutates the source context', () => {
    applyAblation(run, { kind: 'ablated', informationClass: 'code-excerpts' });
    expect(run.context['code-excerpts']).toBe('function foo() {}');
  });

  it('is a no-op when ablating a class the run does not carry', () => {
    const result = applyAblation(run, {
      kind: 'ablated',
      informationClass: 'conversational-history',
    });
    expect(result).toEqual(run.context);
  });
});

describe('ablationSuite', () => {
  it('is the baseline plus one ablation per information class, in order', () => {
    const suite = ablationSuite();
    expect(suite).toHaveLength(INFORMATION_CLASSES.length + 1);
    expect(suite[0]).toEqual(BASELINE);
    expect(suite.slice(1).map((a) => (a.kind === 'ablated' ? a.informationClass : null))).toEqual([
      ...INFORMATION_CLASSES,
    ]);
  });
});

describe('runAblationSuite', () => {
  it('produces one observation per (run × ablation)', async () => {
    const runner = (r: ReplayRun, a: Ablation): ReplayOutcome => ({
      rework: a.kind === 'baseline' ? 0 : 1,
    });
    const runs = [run, { ...run, runId: 'r2', taskClass: 'debugging' }];

    const observations = await runAblationSuite(runs, runner);

    expect(observations).toHaveLength(runs.length * (INFORMATION_CLASSES.length + 1));
    expect(observations.filter((o) => o.ablation.kind === 'baseline')).toHaveLength(2);
    expect(observations.every((o) => runs.some((r) => r.runId === o.runId))).toBe(true);
  });

  it('propagates a runner rejection rather than dropping the observation', async () => {
    const runner = (): ReplayOutcome => {
      throw new Error('replay driver failed');
    };
    await expect(runAblationSuite([run], runner)).rejects.toThrow('replay driver failed');
  });

  it('awaits an async runner', async () => {
    const runner = async (_r: ReplayRun, a: Ablation): Promise<ReplayOutcome> => {
      await Promise.resolve();
      return { rework: a.kind === 'baseline' ? 0 : 2 };
    };
    const observations = await runAblationSuite([run], runner);
    const ablated = observations.filter((o) => o.ablation.kind === 'ablated');
    expect(ablated.every((o) => o.outcome.rework === 2)).toBe(true);
  });
});
