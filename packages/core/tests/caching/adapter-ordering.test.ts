import { describe, it, expect } from 'vitest';
import { AnthropicCacheAdapter } from '../../src/caching/adapters/anthropic';
import { OpenAICacheAdapter } from '../../src/caching/adapters/openai';
import { GeminiCacheAdapter } from '../../src/caching/adapters/gemini';
import type { CacheAdapter, StabilityTaggedBlock } from '../../src/caching/adapter';

const adapters: CacheAdapter[] = [
  new AnthropicCacheAdapter(),
  new OpenAICacheAdapter(),
  new GeminiCacheAdapter(),
];

describe('Cross-adapter ordering consistency', () => {
  const scrambled: StabilityTaggedBlock[] = [
    { stability: 'ephemeral', content: 'e1', role: 'user' },
    { stability: 'static', content: 's1', role: 'system' },
    { stability: 'session', content: 'ss1', role: 'system' },
    { stability: 'ephemeral', content: 'e2', role: 'user' },
    { stability: 'static', content: 's2', role: 'system' },
  ];

  for (const adapter of adapters) {
    it(`${adapter.provider}: orders static -> session -> ephemeral`, () => {
      const result = adapter.orderContent(scrambled);
      const stabilities = result.map((b) => b.stability);
      expect(stabilities).toEqual(['static', 'static', 'session', 'ephemeral', 'ephemeral']);
    });
  }

  it('all adapters produce identical ordering for the same input', () => {
    const results = adapters.map((a) => a.orderContent(scrambled));
    const first = results[0].map((b) => b.content);
    for (const result of results.slice(1)) {
      expect(result.map((b) => b.content)).toEqual(first);
    }
  });
});

describe('Cross-adapter parseCacheUsage null safety', () => {
  for (const adapter of adapters) {
    it(`${adapter.provider}: returns zeros for undefined`, () => {
      const result = adapter.parseCacheUsage(undefined);
      expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
    });

    it(`${adapter.provider}: returns zeros for empty object`, () => {
      const result = adapter.parseCacheUsage({});
      expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
    });
  }
});
