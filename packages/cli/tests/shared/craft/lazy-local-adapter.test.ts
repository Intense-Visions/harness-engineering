import { describe, it, expect, vi } from 'vitest';
import { LazyLocalAdapter } from '../../../src/shared/craft/llm/lazy-local-adapter';

describe('LazyLocalAdapter', () => {
  it('resolves to the first configured model that the endpoint reports as loaded', async () => {
    const fetchModels = vi.fn(async () => ['qwen3:8b', 'deepseek-coder-v2']);
    const adapter = new LazyLocalAdapter({
      endpoint: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      configured: ['gemma-4-e4b', 'qwen3:8b', 'deepseek-coder-v2'],
      fetchModels,
    });

    // Pre-call: resolution hasn't happened yet.
    expect(adapter.getResolvedModel()).toBeNull();

    // Trigger resolution by calling callText — but the underlying OpenAI
    // adapter will reach for the real HTTP client. We catch the resulting
    // network error and still inspect the resolution.
    try {
      await adapter.callText('test prompt');
    } catch {
      /* expected — no actual server */
    }
    expect(adapter.getResolvedModel()).toBe('qwen3:8b');
    expect(fetchModels).toHaveBeenCalledTimes(1);
  });

  it('caches resolution across calls (probe runs exactly once)', async () => {
    const fetchModels = vi.fn(async () => ['gemma-4-e4b']);
    const adapter = new LazyLocalAdapter({
      endpoint: 'http://localhost:1234/v1',
      apiKey: 'lm-studio',
      configured: ['gemma-4-e4b', 'qwen3:8b'],
      fetchModels,
      // Fail fast on the unreachable port — the test is about caching, not HTTP.
      // Without this, the OpenAI SDK's default 90s timeout + retry backoff blows
      // past vitest's 30s testTimeout when looping 3 calls.
      llmTimeoutMs: 100,
    });

    for (let i = 0; i < 3; i++) {
      try {
        await adapter.callText(`prompt-${i}`);
      } catch {
        /* expected */
      }
    }
    expect(fetchModels).toHaveBeenCalledTimes(1);
    expect(adapter.getResolvedModel()).toBe('gemma-4-e4b');
  });

  it('errors clearly when no configured model is loaded', async () => {
    const fetchModels = vi.fn(async () => ['llama3:8b', 'mistral:7b']);
    const adapter = new LazyLocalAdapter({
      endpoint: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      configured: ['gemma-4-e4b', 'qwen3:8b'],
      fetchModels,
    });

    await expect(adapter.callText('p')).rejects.toThrow(
      /no configured model is loaded.*Configured.*Detected/s
    );
  });

  it('errors with server-down hint when probe fails', async () => {
    const fetchModels = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const adapter = new LazyLocalAdapter({
      endpoint: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      configured: ['gemma-4-e4b'],
      fetchModels,
    });

    await expect(adapter.callText('p')).rejects.toThrow(/probe failed.*Is the server running/);
  });

  it('callVision throws (not wired for local backends)', async () => {
    const adapter = new LazyLocalAdapter({
      endpoint: 'http://localhost:11434/v1',
      apiKey: 'ollama',
      configured: ['gemma-4-e4b'],
      fetchModels: async () => ['gemma-4-e4b'],
    });
    await expect(adapter.callVision('p', {})).rejects.toThrow(/callVision is not wired/);
  });

  it('uses providerId "pi" when constructed for a pi backend', () => {
    const adapter = new LazyLocalAdapter(
      {
        endpoint: 'http://localhost:1234/v1',
        apiKey: 'pi',
        configured: ['gemma-4-e4b'],
        fetchModels: async () => ['gemma-4-e4b'],
      },
      'pi'
    );
    expect(adapter.providerId).toBe('pi');
  });
});
