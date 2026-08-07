import { describe, it, expect, vi } from 'vitest';
import type {
  AnalysisProvider,
  AnalysisRequest,
  AnalysisResponse,
} from '../../src/analysis-provider/interface.js';
import {
  SkillRegressionEvaluator,
  computeBaselineScore,
} from '../../src/skill-regression/evaluator.js';
import { judgeResponseSchema } from '../../src/skill-regression/prompts.js';
import type { SkillRegressionFixture } from '../../src/skill-regression/types.js';

const FIXTURE: SkillRegressionFixture = {
  schemaVersion: 1,
  skill: 'harness-spec-craft',
  id: 'minimal-adr',
  input: 'write an ADR',
  rubric: [
    { id: 'a', criterion: 'states a decision', weight: 2 },
    { id: 'b', criterion: 'weighs alternatives' },
    { id: 'c', criterion: 'records consequences' },
  ],
  referenceOutput: 'a good, complete ADR',
  baseline: { score: 1, k: 1, tolerance: 0.25 },
};

/**
 * A provider that rules a fixed set of criterion ids "met" and returns the given
 * confidence. Validates its payload through the response schema exactly as a
 * real structured-output provider does.
 */
function makeProvider(
  metIds: string[],
  confidence: 'low' | 'medium' | 'high' = 'high'
): { provider: AnalysisProvider; lastRequest: () => AnalysisRequest | undefined } {
  let captured: AnalysisRequest | undefined;
  const provider: AnalysisProvider = {
    async analyze<T>(request: AnalysisRequest): Promise<AnalysisResponse<T>> {
      captured = request;
      const payload = {
        criteria: FIXTURE.rubric.map((c) => ({
          id: c.id,
          met: metIds.includes(c.id),
          note: '',
        })),
        confidence,
      };
      return {
        result: judgeResponseSchema.parse(payload) as T,
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        model: request.model ?? 'stub',
        latencyMs: 0,
      };
    },
  };
  return { provider, lastRequest: () => captured };
}

function makeRejectingProvider(): AnalysisProvider {
  return {
    async analyze<T>(): Promise<AnalysisResponse<T>> {
      throw new Error('rate limited');
    },
  };
}

describe('SkillRegressionEvaluator', () => {
  it('self-test: a reference output meeting every criterion scores STABLE/advisory', async () => {
    const { provider } = makeProvider(['a', 'b', 'c'], 'high');
    const verdict = await new SkillRegressionEvaluator(provider).evaluate({ fixture: FIXTURE });
    expect(verdict.verdict).toBe('STABLE');
    expect(verdict.score).toBe(1);
    expect(verdict.sampledK).toBe(1);
    expect(verdict.authority).toBe('advisory');
  });

  it('a regressed candidate (few criteria met) drops below the floor → REGRESSED/blocking', async () => {
    // Only criterion 'a' (weight 2 of 4) met → score 0.5 < floor 0.75.
    const { provider } = makeProvider(['a'], 'high');
    const verdict = await new SkillRegressionEvaluator(provider).evaluate({
      fixture: FIXTURE,
      candidates: ['a weak ADR missing alternatives and consequences'],
    });
    expect(verdict.score).toBeCloseTo(0.5);
    expect(verdict.verdict).toBe('REGRESSED');
    expect(verdict.authority).toBe('blocking');
    expect(verdict.rationale).toContain('below the regression floor');
  });

  it('a low-confidence regression stays advisory (never blocks on a shaky signal)', async () => {
    const { provider } = makeProvider(['a'], 'low');
    const verdict = await new SkillRegressionEvaluator(provider).evaluate({
      fixture: FIXTURE,
      candidates: ['a weak ADR'],
    });
    expect(verdict.verdict).toBe('REGRESSED');
    expect(verdict.authority).toBe('advisory');
  });

  it('score@k averages across candidate samples', async () => {
    // Score each sample independently: this stub rules the same ids for all
    // candidates, so 2 samples average to the same 0.5. Confidence is the lowest.
    const { provider } = makeProvider(['a'], 'medium');
    const verdict = await new SkillRegressionEvaluator(provider).evaluate({
      fixture: FIXTURE,
      candidates: ['sample one', 'sample two'],
    });
    expect(verdict.sampledK).toBe(2);
    expect(verdict.score).toBeCloseTo(0.5);
  });

  it('degrades to INCONCLUSIVE/advisory when the provider rejects', async () => {
    const verdict = await new SkillRegressionEvaluator(makeRejectingProvider()).evaluate({
      fixture: FIXTURE,
    });
    expect(verdict.verdict).toBe('INCONCLUSIVE');
    expect(verdict.confidence).toBe('low');
    expect(verdict.authority).toBe('advisory');
  });

  it('forwards the model override and system prompt to the provider', async () => {
    const { provider, lastRequest } = makeProvider(['a', 'b', 'c']);
    await new SkillRegressionEvaluator(provider, { model: 'my-model' }).evaluate({
      fixture: FIXTURE,
    });
    expect(lastRequest()?.model).toBe('my-model');
    expect(lastRequest()?.systemPrompt).toContain('skill-output quality judge');
  });

  it('discards an injected authority/score key via the strict re-parse', async () => {
    // A malicious provider tries to inject authority + a numeric score. The
    // strict re-parse rejects the extra keys → degrade to INCONCLUSIVE/advisory.
    const provider: AnalysisProvider = {
      async analyze<T>(): Promise<AnalysisResponse<T>> {
        return {
          result: {
            criteria: FIXTURE.rubric.map((c) => ({ id: c.id, met: false, note: '' })),
            confidence: 'high',
            authority: 'blocking',
            score: 0,
          } as unknown as T,
          tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          model: 'stub',
          latencyMs: 0,
        };
      },
    };
    const verdict = await new SkillRegressionEvaluator(provider).evaluate({ fixture: FIXTURE });
    expect(verdict.verdict).toBe('INCONCLUSIVE');
    expect(verdict.authority).toBe('advisory');
  });
});

describe('computeBaselineScore', () => {
  it('returns the reference-output score for --update-baseline', async () => {
    const { provider } = makeProvider(['a', 'b', 'c'], 'high');
    const result = await computeBaselineScore(provider, FIXTURE);
    expect(result).toEqual({ score: 1, k: 1 });
  });

  it('returns null on a degrade (leaves the existing baseline untouched)', async () => {
    const result = await computeBaselineScore(makeRejectingProvider(), FIXTURE);
    expect(result).toBeNull();
  });
});
