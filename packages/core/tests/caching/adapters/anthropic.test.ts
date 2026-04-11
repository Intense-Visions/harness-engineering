import { describe, it, expect } from 'vitest';
import { AnthropicCacheAdapter } from '../../../src/caching/adapters/anthropic';
import type { StabilityTaggedBlock, ToolDefinition } from '../../../src/caching/adapter';

describe('AnthropicCacheAdapter', () => {
  const adapter = new AnthropicCacheAdapter();

  it('has provider set to claude', () => {
    expect(adapter.provider).toBe('claude');
  });

  describe('wrapSystemBlock', () => {
    it('adds cache_control with ttl for static content', () => {
      const result = adapter.wrapSystemBlock('static system prompt', 'static');
      expect(result).toEqual({
        type: 'text',
        text: 'static system prompt',
        cache_control: { type: 'ephemeral', ttl: '1h' },
      });
    });

    it('adds cache_control without ttl for session content', () => {
      const result = adapter.wrapSystemBlock('session context', 'session');
      expect(result).toEqual({
        type: 'text',
        text: 'session context',
        cache_control: { type: 'ephemeral' },
      });
    });

    it('returns plain text block for ephemeral content', () => {
      const result = adapter.wrapSystemBlock('ephemeral data', 'ephemeral');
      expect(result).toEqual({
        type: 'text',
        text: 'ephemeral data',
      });
      expect(result).not.toHaveProperty('cache_control');
    });
  });

  describe('wrapTools', () => {
    it('adds cache_control to the last tool definition', () => {
      const tools: ToolDefinition[] = [
        { name: 'tool1', description: 'first', input_schema: {} },
        { name: 'tool2', description: 'second', input_schema: {} },
      ];
      const result = adapter.wrapTools(tools, 'static');
      expect(result.tools).toHaveLength(2);
      expect(result.tools[0]).not.toHaveProperty('cache_control');
      expect(result.tools[1].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('adds cache_control to single tool', () => {
      const tools: ToolDefinition[] = [
        { name: 'only', description: 'only tool', input_schema: {} },
      ];
      const result = adapter.wrapTools(tools, 'session');
      expect(result.tools[0].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('returns empty tools array unchanged', () => {
      const result = adapter.wrapTools([], 'static');
      expect(result.tools).toEqual([]);
    });

    it('does not add cache_control for ephemeral stability', () => {
      const tools: ToolDefinition[] = [{ name: 'tool1', description: 'first', input_schema: {} }];
      const result = adapter.wrapTools(tools, 'ephemeral');
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
        { stability: 'ephemeral', content: 'e', role: 'system' },
        { stability: 'static', content: 's', role: 'system' },
        { stability: 'session', content: 'ss', role: 'system' },
      ];
      const result = adapter.orderContent(blocks);
      expect(result.map((b) => b.stability)).toEqual(['static', 'session', 'ephemeral']);
    });

    it('preserves order within the same tier', () => {
      const blocks: StabilityTaggedBlock[] = [
        { stability: 'static', content: 'a', role: 'system' },
        { stability: 'static', content: 'b', role: 'system' },
        { stability: 'ephemeral', content: 'c', role: 'user' },
      ];
      const result = adapter.orderContent(blocks);
      expect(result[0].content).toBe('a');
      expect(result[1].content).toBe('b');
    });

    it('does not mutate original array', () => {
      const blocks: StabilityTaggedBlock[] = [
        { stability: 'ephemeral', content: 'e', role: 'system' },
        { stability: 'static', content: 's', role: 'system' },
      ];
      const original = [...blocks];
      adapter.orderContent(blocks);
      expect(blocks).toEqual(original);
    });
  });

  describe('parseCacheUsage', () => {
    it('extracts cache_creation_input_tokens and cache_read_input_tokens', () => {
      const response = {
        usage: {
          cache_creation_input_tokens: 1500,
          cache_read_input_tokens: 3000,
        },
      };
      const result = adapter.parseCacheUsage(response);
      expect(result).toEqual({
        cacheCreationTokens: 1500,
        cacheReadTokens: 3000,
      });
    });

    it('returns zeros when usage is missing', () => {
      const result = adapter.parseCacheUsage({});
      expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
    });

    it('returns zeros when cache fields are missing from usage', () => {
      const result = adapter.parseCacheUsage({ usage: { input_tokens: 100 } });
      expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
    });

    it('handles null response gracefully', () => {
      const result = adapter.parseCacheUsage(null);
      expect(result).toEqual({ cacheCreationTokens: 0, cacheReadTokens: 0 });
    });
  });
});
