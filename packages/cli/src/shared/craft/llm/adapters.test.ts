import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
  AnalysisProviderAdapter,
  adaptClaudeCli,
  adaptAnthropic,
  adaptOpenAICompatible,
} from './adapters';
import type { LlmCallCost } from './contracts';

// The `@harness-engineering/intelligence` imports in adapters.ts are type-only
// and erased at compile time, so no runtime mock of that package is needed.
// We drive the adapter through a hand-built fake that satisfies the internal
// `AnalyzeFn` shape (an object exposing an `analyze` method).

interface AnalyzeRequest {
  prompt: string;
  systemPrompt?: string;
  responseSchema: z.ZodType;
  model?: string;
  maxTokens?: number;
}

interface AnalyzeResponse {
  result: { raw: string };
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  model: string;
  latencyMs: number;
}

/**
 * Build a fake inner AnalysisProvider whose `analyze` records the request it
 * received and returns a caller-supplied response. Returns both the fake (to
 * pass as `inner`) and the mock so tests can inspect captured arguments.
 */
function makeFakeInner(response: AnalyzeResponse) {
  const analyze = vi.fn(async (_req: AnalyzeRequest): Promise<AnalyzeResponse> => response);
  return { fake: { analyze }, analyze };
}

const RAW_INSTRUCTIONS =
  'Return a JSON object with a single field "raw" whose string value is the fenced JSON block ' +
  'you would normally emit. Do not add prose outside the JSON object.';

function makeResponse(overrides: Partial<AnalyzeResponse> = {}): AnalyzeResponse {
  return {
    result: { raw: '```json\n{"score":5}\n```' },
    tokenUsage: { inputTokens: 11, outputTokens: 22, totalTokens: 33 },
    model: 'model-from-response',
    latencyMs: 7,
    ...overrides,
  };
}

describe('AnalysisProviderAdapter.callText', () => {
  it('returns the raw envelope field from the inner analyze result', async () => {
    const raw = '```json\n{"verdict":"pass"}\n```';
    const { fake } = makeFakeInner(makeResponse({ result: { raw } }));
    const adapter = new AnalysisProviderAdapter({
      providerId: 'test',
      model: 'test-model',
      inner: fake as never,
    });

    const out = await adapter.callText('judge this');

    expect(out).toBe(raw);
  });

  it('forwards the user prompt unchanged to the inner provider', async () => {
    const { fake, analyze } = makeFakeInner(makeResponse());
    const adapter = new AnalysisProviderAdapter({
      providerId: 'test',
      model: 'test-model',
      inner: fake as never,
    });

    await adapter.callText('the exact prompt');

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0]![0].prompt).toBe('the exact prompt');
  });

  it('appends the raw-envelope instructions after the caller system prompt', async () => {
    const { fake, analyze } = makeFakeInner(makeResponse());
    const adapter = new AnalysisProviderAdapter({
      providerId: 'test',
      model: 'test-model',
      inner: fake as never,
    });

    await adapter.callText('p', { systemPrompt: 'You are a strict reviewer.' });

    expect(analyze.mock.calls[0]![0].systemPrompt).toBe(
      `You are a strict reviewer.\n\n${RAW_INSTRUCTIONS}`
    );
  });

  it('uses only the raw-envelope instructions when no system prompt is given', async () => {
    const { fake, analyze } = makeFakeInner(makeResponse());
    const adapter = new AnalysisProviderAdapter({
      providerId: 'test',
      model: 'test-model',
      inner: fake as never,
    });

    await adapter.callText('p');

    expect(analyze.mock.calls[0]![0].systemPrompt).toBe(RAW_INSTRUCTIONS);
  });

  it('passes a passthrough response schema that accepts a raw string envelope', async () => {
    const { fake, analyze } = makeFakeInner(makeResponse());
    const adapter = new AnalysisProviderAdapter({
      providerId: 'test',
      model: 'test-model',
      inner: fake as never,
    });

    await adapter.callText('p');

    const schema = analyze.mock.calls[0]![0].responseSchema;
    // The bridge schema is z.object({ raw: z.string() }): accepts a raw string,
    // rejects a missing/non-string field.
    expect(schema.parse({ raw: 'hello' })).toEqual({ raw: 'hello' });
    expect(schema.safeParse({ raw: 42 }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe('AnalysisProviderAdapter cost recording', () => {
  it('records one cost entry per call with token usage from the response', async () => {
    const { fake } = makeFakeInner(
      makeResponse({ tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 } })
    );
    const adapter = new AnalysisProviderAdapter({
      providerId: 'anthropic',
      model: 'fallback-model',
      inner: fake as never,
    });

    await adapter.callText('p');
    const costs = adapter.getCosts();

    expect(costs).toHaveLength(1);
    expect(costs[0]).toEqual({
      provider: 'anthropic',
      model: 'model-from-response',
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0,
    });
  });

  it('falls back to the adapter model when the response model is empty', async () => {
    const { fake } = makeFakeInner(makeResponse({ model: '' }));
    const adapter = new AnalysisProviderAdapter({
      providerId: 'anthropic',
      model: 'fallback-model',
      inner: fake as never,
    });

    await adapter.callText('p');

    expect(adapter.getCosts()[0]!.model).toBe('fallback-model');
  });

  it('accumulates a cost entry for each callText invocation', async () => {
    const { fake } = makeFakeInner(makeResponse());
    const adapter = new AnalysisProviderAdapter({
      providerId: 'test',
      model: 'test-model',
      inner: fake as never,
    });

    await adapter.callText('a');
    await adapter.callText('b');

    expect(adapter.getCosts()).toHaveLength(2);
  });

  it('appends externally supplied cost entries via recordCost', () => {
    const { fake } = makeFakeInner(makeResponse());
    const adapter = new AnalysisProviderAdapter({
      providerId: 'test',
      model: 'test-model',
      inner: fake as never,
    });
    const entry: LlmCallCost = {
      provider: 'external',
      model: 'm',
      inputTokens: 1,
      outputTokens: 2,
      costUsd: 0.5,
    };

    adapter.recordCost(entry);

    expect(adapter.getCosts()).toEqual([entry]);
  });
});

describe('AnalysisProviderAdapter.callVision', () => {
  it('throws with the provider id since vision is not wired', async () => {
    const { fake } = makeFakeInner(makeResponse());
    const adapter = new AnalysisProviderAdapter({
      providerId: 'claude-cli',
      model: 'test-model',
      inner: fake as never,
    });

    await expect(adapter.callVision('p', { imageUrl: 'x' })).rejects.toThrow(
      /claude-cli adapter does not implement callVision/
    );
  });
});

describe('factory helpers', () => {
  it('adaptClaudeCli sets provider id and default model', () => {
    const { fake } = makeFakeInner(makeResponse());
    const provider = adaptClaudeCli(fake as never);

    expect(provider.providerId).toBe('claude-cli');
    expect(provider.model).toBe('claude');
  });

  it('adaptClaudeCli honors an explicit model override', () => {
    const { fake } = makeFakeInner(makeResponse());
    const provider = adaptClaudeCli(fake as never, 'claude-opus');

    expect(provider.model).toBe('claude-opus');
  });

  it('adaptAnthropic sets provider id and default model', () => {
    const { fake } = makeFakeInner(makeResponse());
    const provider = adaptAnthropic(fake as never);

    expect(provider.providerId).toBe('anthropic');
    expect(provider.model).toBe('claude-sonnet-4-20250514');
  });

  it('adaptOpenAICompatible sets provider id and default model', () => {
    const { fake } = makeFakeInner(makeResponse());
    const provider = adaptOpenAICompatible(fake as never);

    expect(provider.providerId).toBe('openai-compatible');
    expect(provider.model).toBe('unknown');
  });

  it('a factory-built adapter bridges callText through the inner provider', async () => {
    const raw = '```json\n{"ok":true}\n```';
    const { fake, analyze } = makeFakeInner(makeResponse({ result: { raw } }));
    const provider = adaptOpenAICompatible(fake as never, 'gpt-4o-mini');

    const out = await provider.callText('bridge me');

    expect(out).toBe(raw);
    expect(analyze).toHaveBeenCalledTimes(1);
  });
});
