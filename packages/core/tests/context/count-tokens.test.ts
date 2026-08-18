import { describe, it, expect } from 'vitest';
import {
  createAnthropicTokenCounter,
  resolveTokenCounter,
  DEFAULT_COUNT_TOKENS_MODEL,
  type FetchLike,
} from '../../src/context/count-tokens';
import { heuristicTokenCounter } from '../../src/context/attribution';
import { estimateTokens } from '../../src/compaction/envelope';

function okFetch(inputTokens: number, capture?: { url?: string; body?: string }): FetchLike {
  return async (url, init) => {
    if (capture) {
      capture.url = url;
      capture.body = init.body;
    }
    return { ok: true, status: 200, json: async () => ({ input_tokens: inputTokens }) };
  };
}

describe('createAnthropicTokenCounter', () => {
  it('returns null when no API key is resolvable (graceful heuristic path)', () => {
    expect(createAnthropicTokenCounter({ apiKey: '', fetchImpl: okFetch(1) })).toBeNull();
    expect(createAnthropicTokenCounter({ apiKey: '   ', fetchImpl: okFetch(1) })).toBeNull();
  });

  it('returns an exact count from /v1/messages/count_tokens', async () => {
    const capture: { url?: string; body?: string } = {};
    const counter = createAnthropicTokenCounter({
      apiKey: 'sk-test',
      fetchImpl: okFetch(123, capture),
    })!;
    expect(counter).not.toBeNull();
    const count = await counter('hello world');
    expect(count).toBe(123);
    expect(capture.url).toContain('/v1/messages/count_tokens');
    expect(capture.body).toContain(DEFAULT_COUNT_TOKENS_MODEL);
    expect(capture.body).toContain('hello world');
  });

  it('throws on a non-200 response so the report can degrade that entry', async () => {
    const counter = createAnthropicTokenCounter({
      apiKey: 'sk-test',
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
    })!;
    await expect(counter('x')).rejects.toThrow(/401/);
  });

  it('throws when input_tokens is missing or non-numeric', async () => {
    const counter = createAnthropicTokenCounter({
      apiKey: 'sk-test',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ input_tokens: 'nope' }),
      }),
    })!;
    await expect(counter('x')).rejects.toThrow(/input_tokens/);
  });

  it('honours a custom model and base URL', async () => {
    const capture: { url?: string; body?: string } = {};
    const counter = createAnthropicTokenCounter({
      apiKey: 'sk-test',
      model: 'claude-sonnet-5',
      baseUrl: 'https://example.test/',
      fetchImpl: okFetch(7, capture),
    })!;
    await counter('hi');
    expect(capture.url).toBe('https://example.test/v1/messages/count_tokens');
    expect(capture.body).toContain('claude-sonnet-5');
  });
});

describe('resolveTokenCounter', () => {
  it('resolves the exact counter when a key is present', async () => {
    const resolved = resolveTokenCounter({ apiKey: 'sk-test', fetchImpl: okFetch(9) });
    expect(resolved.mode).toBe('exact');
    expect(await resolved.counter('anything')).toBe(9);
  });

  it('falls back to the heuristic when no key is present', () => {
    const resolved = resolveTokenCounter({ apiKey: '', fetchImpl: okFetch(9) });
    expect(resolved.mode).toBe('heuristic');
    expect(resolved.counter).toBe(heuristicTokenCounter);
    expect(resolved.counter('x'.repeat(400))).toBe(estimateTokens('x'.repeat(400)));
  });
});
