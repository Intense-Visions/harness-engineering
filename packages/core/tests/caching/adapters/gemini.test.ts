import { describe, it, expect } from 'vitest';
import { GeminiCacheAdapter } from '../../../src/caching/adapters/gemini';
import type { StabilityTaggedBlock, ToolDefinition } from '../../../src/caching/adapter';

describe('GeminiCacheAdapter', () => {
  const adapter = new GeminiCacheAdapter();

  it('has provider set to gemini', () => {
    expect(adapter.provider).toBe('gemini');
  });

  describe('wrapSystemBlock', () => {
    it('returns cachedContentRef marker for static content', () => {
      const result = adapter.wrapSystemBlock('static system instructions', 'static');
      expect(result.type).toBe('text');
      expect(result.text).toBe('static system instructions');
      expect(result.cachedContentRef).toBeDefined();
      expect(typeof result.cachedContentRef).toBe('string');
    });

    it('returns plain text block for session content', () => {
      const result = adapter.wrapSystemBlock('session context', 'session');
      expect(result).toEqual({ type: 'text', text: 'session context' });
      expect(result).not.toHaveProperty('cachedContentRef');
    });

    it('returns plain text block for ephemeral content', () => {
      const result = adapter.wrapSystemBlock('ephemeral data', 'ephemeral');
      expect(result).toEqual({ type: 'text', text: 'ephemeral data' });
      expect(result).not.toHaveProperty('cachedContentRef');
    });
  });

  describe('wrapTools', () => {
    it('returns tools unchanged (passthrough) for all stability tiers', () => {
      const tools: ToolDefinition[] = [{ name: 'tool1', description: 'first', input_schema: {} }];
      for (const tier of ['static', 'session', 'ephemeral'] as const) {
        const result = adapter.wrapTools(tools, tier);
        expect(result.tools).toHaveLength(1);
        expect(result.tools[0]).not.toHaveProperty('cache_control');
      }
    });

    it('does not mutate original tool definitions', () => {
      const tools: ToolDefinition[] = [{ name: 'tool1', description: 'first', input_schema: {} }];
      adapter.wrapTools(tools, 'static');
      expect(tools[0]).not.toHaveProperty('cache_control');
    });
  });

  describe('orderContent', () => {
    it('orders static first, then session, then ephemeral', () => {
      const blocks: StabilityTaggedBlock[] = [
        { stability: 'ephemeral', content: 'e', role: 'user' },
        { stability: 'session', content: 'ss', role: 'system' },
        { stability: 'static', content: 's', role: 'system' },
      ];
      const result = adapter.orderContent(blocks);
      expect(result.map((b) => b.stability)).toEqual(['static', 'session', 'ephemeral']);
    });

    it('preserves order within the same tier', () => {
      const blocks: StabilityTaggedBlock[] = [
        { stability: 'static', content: 'a', role: 'system' },
        { stability: 'static', content: 'b', role: 'system' },
      ];
      const result = adapter.orderContent(blocks);
      expect(result[0].content).toBe('a');
      expect(result[1].content).toBe('b');
    });

    it('does not mutate original array', () => {
      const blocks: StabilityTaggedBlock[] = [
        { stability: 'ephemeral', content: 'e', role: 'user' },
        { stability: 'static', content: 's', role: 'system' },
      ];
      const original = [...blocks];
      adapter.orderContent(blocks);
      expect(blocks).toEqual(original);
    });
  });

  describe('parseCacheUsage', () => {
    it('extracts cachedContentTokenCount from usageMetadata', () => {
      const response = {
        usageMetadata: {
          promptTokenCount: 5000,
          cachedContentTokenCount: 3000,
          candidatesTokenCount: 200,
        },
      };
      const result = adapter.parseCacheUsage(response);
      expect(result).toEqual({
        cacheCreationTokens: 0,
        cacheReadTokens: 3000,
      });
    });

    it('returns zeros when usageMetadata is missing', () => {
      const result = adapter.parseCacheUsage({});
      expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
    });

    it('returns zeros when cachedContentTokenCount is missing', () => {
      const result = adapter.parseCacheUsage({
        usageMetadata: { promptTokenCount: 100 },
      });
      expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
    });

    it('handles null response gracefully', () => {
      const result = adapter.parseCacheUsage(null);
      expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
    });

    it('always returns cacheCreationTokens as 0 (Gemini does not separate in response)', () => {
      const response = {
        usageMetadata: { cachedContentTokenCount: 500 },
      };
      const result = adapter.parseCacheUsage(response);
      expect(result.cacheCreationTokens).toBe(0);
    });
  });
});
