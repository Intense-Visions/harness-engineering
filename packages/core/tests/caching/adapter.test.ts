import { describe, it, expect } from 'vitest';
import type {
  CacheAdapter,
  StabilityTaggedBlock,
  ProviderSystemBlock,
  ProviderToolBlock,
} from '../../src/caching/adapter';

describe('CacheAdapter types', () => {
  it('StabilityTaggedBlock has required fields', () => {
    const block: StabilityTaggedBlock = {
      stability: 'static',
      content: 'system prompt content',
      role: 'system',
    };
    expect(block.stability).toBe('static');
    expect(block.content).toBe('system prompt content');
    expect(block.role).toBe('system');
  });

  it('StabilityTaggedBlock accepts all stability tiers', () => {
    const tiers = ['static', 'session', 'ephemeral'] as const;
    for (const tier of tiers) {
      const block: StabilityTaggedBlock = {
        stability: tier,
        content: 'test',
        role: 'system',
      };
      expect(block.stability).toBe(tier);
    }
  });

  it('ProviderSystemBlock supports text-only shape', () => {
    const block: ProviderSystemBlock = { type: 'text', text: 'hello' };
    expect(block.type).toBe('text');
    expect(block.text).toBe('hello');
  });

  it('ProviderSystemBlock supports cache_control shape', () => {
    const block: ProviderSystemBlock = {
      type: 'text',
      text: 'hello',
      cache_control: { type: 'ephemeral' },
    };
    expect(block.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('ProviderSystemBlock supports cachedContentRef shape', () => {
    const block: ProviderSystemBlock = {
      type: 'text',
      text: 'hello',
      cachedContentRef: 'cachedContents/abc123',
    };
    expect(block.cachedContentRef).toBe('cachedContents/abc123');
  });

  it('ProviderToolBlock wraps an array of tool definitions', () => {
    const block: ProviderToolBlock = {
      tools: [
        { name: 'tool1', description: 'first', input_schema: {} },
        { name: 'tool2', description: 'second', input_schema: {} },
      ],
    };
    expect(block.tools).toHaveLength(2);
  });

  it('ProviderToolBlock supports cache_control on individual tools', () => {
    const block: ProviderToolBlock = {
      tools: [
        {
          name: 'tool1',
          description: 'first',
          input_schema: {},
          cache_control: { type: 'ephemeral' },
        },
      ],
    };
    expect(block.tools[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('CacheAdapter interface is structurally valid', () => {
    // Structural type check -- an object that satisfies CacheAdapter
    const adapter: CacheAdapter = {
      provider: 'claude',
      wrapSystemBlock: (content, stability) => ({ type: 'text', text: content }),
      wrapTools: (tools, stability) => ({ tools }),
      orderContent: (blocks) => blocks,
      parseCacheUsage: () => ({ cacheCreationTokens: 0, cacheReadTokens: 0 }),
    };
    expect(adapter.provider).toBe('claude');
    expect(typeof adapter.wrapSystemBlock).toBe('function');
    expect(typeof adapter.wrapTools).toBe('function');
    expect(typeof adapter.orderContent).toBe('function');
    expect(typeof adapter.parseCacheUsage).toBe('function');
  });
});
