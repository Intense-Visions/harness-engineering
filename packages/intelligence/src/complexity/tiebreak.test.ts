import { describe, it, expect, vi } from 'vitest';
import { llmTiebreak } from './tiebreak.js';
import type { AnalysisProvider, AnalysisRequest } from '../analysis-provider/interface.js';

function makeProvider(impl: (req: AnalysisRequest) => Promise<unknown>): {
  provider: AnalysisProvider;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn(impl);
  return { provider: { analyze: spy as AnalysisProvider['analyze'] }, spy };
}

describe('llmTiebreak', () => {
  it('returns the level/confidence the provider yields', async () => {
    const { provider } = makeProvider(async () => ({
      result: { level: 'moderate', confidence: 'medium' },
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      model: 'fast',
      latencyMs: 1,
    }));
    const out = await llmTiebreak(provider, 'classify this', 'fast-model');
    expect(out).toEqual({ level: 'moderate', confidence: 'medium' });
  });

  it('falls back conservatively on provider error (never throws)', async () => {
    const { provider } = makeProvider(async () => {
      throw new Error('provider exploded');
    });
    const out = await llmTiebreak(provider, 'classify this', 'fast-model');
    expect(out).toEqual({ level: 'moderate', confidence: 'low' });
  });

  it('passes a responseSchema and a fast-tier model hint; never sends/receives a tier token', async () => {
    const { provider, spy } = makeProvider(async () => ({
      result: { level: 'simple', confidence: 'high' },
      tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      model: 'fast',
      latencyMs: 1,
    }));
    await llmTiebreak(provider, 'classify this', 'fast-model');
    expect(spy).toHaveBeenCalledTimes(1);
    const req = spy.mock.calls[0]![0] as AnalysisRequest;
    expect(req.responseSchema).toBeDefined();
    expect(req.model).toBe('fast-model');
    // Schema only carries level/confidence — no tier field.
    const shape = (req.responseSchema as { shape?: Record<string, unknown> }).shape;
    expect(shape ? Object.keys(shape).sort() : []).toEqual(['confidence', 'level']);
  });
});
