import { describe, it, expect } from 'vitest';
import { OpenAICacheAdapter } from '../../../src/caching/adapters/openai';
import type { StabilityTaggedBlock, ToolDefinition } from '../../../src/caching/adapter';

describe('OpenAICacheAdapter', () => {
  const adapter = new OpenAICacheAdapter();

  it('has provider set to openai', () => {
    expect(adapter.provider).toBe('openai');
  });

  describe('wrapSystemBlock', () => {
    it('returns plain text block for static content (passthrough)', () => {
      const result = adapter.wrapSystemBlock('static prompt', 'static');
      expect(result).toEqual({ type: 'text', text: 'static prompt' });
      expect(result).not.toHaveProperty('cache_control');
    });

    it('returns plain text block for session content (passthrough)', () => {
      const result = adapter.wrapSystemBlock('session context', 'session');
      expect(result).toEqual({ type: 'text', text: 'session context' });
    });

    it('returns plain text block for ephemeral content (passthrough)', () => {
      const result = adapter.wrapSystemBlock('ephemeral data', 'ephemeral');
      expect(result).toEqual({ type: 'text', text: 'ephemeral data' });
    });
  });

  describe('wrapTools', () => {
    it('returns tools unchanged (passthrough)', () => {
      const tools: ToolDefinition[] = [
        { name: 'tool1', description: 'first', input_schema: { type: 'object' } },
        { name: 'tool2', description: 'second', input_schema: {} },
      ];
      const result = adapter.wrapTools(tools, 'static');
      expect(result.tools).toHaveLength(2);
      expect(result.tools[0]).toEqual(tools[0]);
      expect(result.tools[1]).toEqual(tools[1]);
    });

    it('does not add cache_control to any tool', () => {
      const tools: ToolDefinition[] = [{ name: 'tool1', description: 'first', input_schema: {} }];
      const result = adapter.wrapTools(tools, 'static');
      expect(result.tools[0]).not.toHaveProperty('cache_control');
    });

    it('does not mutate original tool definitions', () => {
      const tools: ToolDefinition[] = [{ name: 'tool1', description: 'first', input_schema: {} }];
      adapter.wrapTools(tools, 'static');
      expect(tools[0]).not.toHaveProperty('cache_control');
    });
  });

  describe('orderContent', () => {
    it('orders static first, session second, ephemeral last', () => {
      const blocks: StabilityTaggedBlock[] = [
        { stability: 'session', content: 'ss', role: 'system' },
        { stability: 'ephemeral', content: 'e', role: 'user' },
        { stability: 'static', content: 's', role: 'system' },
      ];
      const result = adapter.orderContent(blocks);
      expect(result.map((b) => b.stability)).toEqual(['static', 'session', 'ephemeral']);
    });

    it('preserves order within the same tier', () => {
      const blocks: StabilityTaggedBlock[] = [
        { stability: 'session', content: 'a', role: 'system' },
        { stability: 'session', content: 'b', role: 'user' },
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
    it('extracts cached_tokens from prompt_tokens_details', () => {
      const response = {
        usage: {
          prompt_tokens: 5000,
          prompt_tokens_details: {
            cached_tokens: 2000,
          },
        },
      };
      const result = adapter.parseCacheUsage(response);
      expect(result).toEqual({
        cacheCreationTokens: 0,
        cacheReadTokens: 2000,
      });
    });

    it('returns zeros when usage is missing', () => {
      const result = adapter.parseCacheUsage({});
      expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
    });

    it('returns zeros when prompt_tokens_details is missing', () => {
      const result = adapter.parseCacheUsage({ usage: { prompt_tokens: 100 } });
      expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
    });

    it('handles null response gracefully', () => {
      const result = adapter.parseCacheUsage(null);
      expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
    });

    it('always returns cacheCreationTokens as 0 (OpenAI does not separate creation)', () => {
      const response = {
        usage: { prompt_tokens_details: { cached_tokens: 999 } },
      };
      const result = adapter.parseCacheUsage(response);
      expect(result.cacheCreationTokens).toBe(0);
    });
  });
});
