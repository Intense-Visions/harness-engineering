import { describe, it, expect, vi } from 'vitest';
import { classify } from './classifier.js';
import type { ClassifyInput } from './classifier.js';
import type { ComplexitySignals } from './types.js';
import type { AnalysisProvider } from '../analysis-provider/interface.js';

function makeProvider(results: Array<{ level: string; confidence: string }>): {
  provider: AnalysisProvider;
  spy: ReturnType<typeof vi.fn>;
} {
  let call = 0;
  const spy = vi.fn(async () => {
    const result = results[Math.min(call, results.length - 1)];
    call += 1;
    return {
      result,
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      model: 'stub',
      latencyMs: 1,
    };
  });
  return { provider: { analyze: spy as AnalysisProvider['analyze'] }, spy };
}

// Decisive post-diff signals → high-confidence static (no LLM needed).
const highConfSignals: ComplexitySignals = {
  filesTouched: 1,
  layersTouched: 1,
  blastRadius: 1,
  hotspotChurn: 0,
  descriptionLength: 30,
  specExists: true,
  acceptanceMeasurable: true,
};

// Ambiguous mid-range post-diff signals → low-confidence static (drives tie-break).
const lowConfSignals: ComplexitySignals = {
  filesTouched: 6,
  layersTouched: 2,
  blastRadius: 12,
  hotspotChurn: 0.5,
  descriptionLength: 150,
  specExists: false,
  acceptanceMeasurable: false,
};

describe('classify', () => {
  it('high-confidence static → source:static, provider never called', async () => {
    const { provider, spy } = makeProvider([{ level: 'moderate', confidence: 'high' }]);
    const input: ClassifyInput = {
      signals: highConfSignals,
      phase: 'post-diff',
      riskHigh: false,
      prompt: 'x',
    };
    const v = await classify(input, provider);
    expect(v.source).toBe('static');
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('low-confidence static, tie-break returns high → source:llm-tiebreak, provider called once', async () => {
    const { provider, spy } = makeProvider([{ level: 'complex', confidence: 'high' }]);
    const input: ClassifyInput = {
      signals: lowConfSignals,
      phase: 'post-diff',
      riskHigh: false,
      prompt: 'x',
    };
    const v = await classify(input, provider);
    expect(v.source).toBe('llm-tiebreak');
    expect(v.level).toBe('complex');
    expect(v.confidence).toBe('high');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('low-confidence static, tie-break stays low, risk HIGH → escalation branch', async () => {
    const { provider, spy } = makeProvider([
      { level: 'moderate', confidence: 'low' },
      { level: 'complex', confidence: 'medium' },
    ]);
    const input: ClassifyInput = {
      signals: lowConfSignals,
      phase: 'post-diff',
      riskHigh: true,
      prompt: 'x',
    };
    const v = await classify(input, provider);
    expect(v.source).toBe('escalated');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('low-confidence static, tie-break stays low, risk LOW → NO escalation, source:llm-tiebreak', async () => {
    const { provider, spy } = makeProvider([{ level: 'moderate', confidence: 'low' }]);
    const input: ClassifyInput = {
      signals: lowConfSignals,
      phase: 'post-diff',
      riskHigh: false,
      prompt: 'x',
    };
    const v = await classify(input, provider);
    expect(v.source).toBe('llm-tiebreak');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('pre-diff → no blastRadius key in signals, confidence never high', async () => {
    const { provider } = makeProvider([{ level: 'moderate', confidence: 'high' }]);
    const input: ClassifyInput = {
      signals: { descriptionLength: 200, specExists: true, acceptanceMeasurable: true },
      phase: 'pre-diff',
      riskHigh: false,
      prompt: 'x',
    };
    const v = await classify(input, provider);
    expect('blastRadius' in v.signals).toBe(false);
    expect(v.confidence).not.toBe('high');
  });

  it('no provider → returns static verdict unchanged (offline path)', async () => {
    const input: ClassifyInput = {
      signals: lowConfSignals,
      phase: 'post-diff',
      riskHigh: true,
      prompt: 'x',
    };
    const v = await classify(input);
    expect(v.source).toBe('static');
  });
});
