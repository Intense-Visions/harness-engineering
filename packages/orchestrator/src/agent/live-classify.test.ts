import { describe, it, expect, vi } from 'vitest';
import type { RoutingRequest, RoutingTaskText } from '@harness-engineering/types';
import type { AnalysisProvider } from '@harness-engineering/intelligence';
import { makeLiveClassify } from './live-classify.js';

function req(taskText?: RoutingTaskText, extra?: Partial<RoutingRequest>): RoutingRequest {
  return {
    useCase: { kind: 'tier', tier: 'guided-change' },
    ...(taskText ? { taskText } : {}),
    ...extra,
  };
}

/** A short, well-scoped task ⇒ trivial/simple text signals. */
const TRIVIAL: RoutingTaskText = {
  descriptionLength: 20,
  specExists: true,
  acceptanceMeasurable: true,
  prompt: 'Bump the version string.',
};

/** A long, unscoped task ⇒ high text-complexity signals. */
const COMPLEX: RoutingTaskText = {
  descriptionLength: 5000,
  specExists: false,
  acceptanceMeasurable: false,
  prompt: 'Redesign the entire scheduling subsystem across many modules.',
};

const LEVEL_RANK = { trivial: 0, simple: 1, moderate: 2, complex: 3 } as const;

describe('makeLiveClassify — live pre-diff classification (SC1 live)', () => {
  it('is fully offline when no provider is available (never throws)', async () => {
    const classify = makeLiveClassify(() => undefined);
    const verdict = await classify(req(TRIVIAL));
    expect(verdict.source).toBe('static');
    // pre-diff never earns high confidence (S3-001).
    expect(verdict.confidence).not.toBe('high');
  });

  it('LIVE: a trivial-text task resolves to a strictly LOWER complexity level than a complex-text task', async () => {
    const classify = makeLiveClassify(() => undefined);
    const trivial = await classify(req(TRIVIAL));
    const complex = await classify(req(COMPLEX));
    expect(LEVEL_RANK[trivial.level]).toBeLessThan(LEVEL_RANK[complex.level]);
  });

  it('no taskText ⇒ conservative {moderate, low} fallback (D4), provider never consulted', async () => {
    const analyze = vi.fn();
    const provider = { analyze } as unknown as AnalysisProvider;
    const resolve = vi.fn(() => provider);
    const classify = makeLiveClassify(resolve);
    const verdict = await classify(req(undefined));
    expect(verdict).toEqual({
      level: 'moderate',
      confidence: 'low',
      signals: {},
      source: 'static',
    });
    // Fallback short-circuits before touching the provider thunk.
    expect(resolve).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
  });

  it('passes phase pre-diff: does NOT fabricate diff signals (blastRadius/filesTouched absent from verdict.signals)', async () => {
    const classify = makeLiveClassify(() => undefined);
    const verdict = await classify(req(COMPLEX));
    expect(verdict.signals.blastRadius).toBeUndefined();
    expect(verdict.signals.filesTouched).toBeUndefined();
  });

  it('resolves the provider lazily, once per dispatch', async () => {
    const resolve = vi.fn(() => undefined);
    const classify = makeLiveClassify(resolve);
    await classify(req(TRIVIAL));
    await classify(req(COMPLEX));
    expect(resolve).toHaveBeenCalledTimes(2);
  });
});
