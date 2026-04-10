import type { StabilityTier } from '@harness-engineering/types';
import type {
  CacheAdapter,
  ProviderSystemBlock,
  ProviderToolBlock,
  StabilityTaggedBlock,
  ToolDefinition,
} from '../adapter';

/** Tier ordering: static=0, session=1, ephemeral=2 */
const TIER_ORDER: Record<StabilityTier, number> = {
  static: 0,
  session: 1,
  ephemeral: 2,
};

/**
 * Anthropic cache adapter.
 *
 * Uses explicit `cache_control` breakpoints on content blocks:
 * - static: cache_control with type "ephemeral" and ttl "1h"
 * - session: cache_control with type "ephemeral" (default 5m TTL)
 * - ephemeral: no cache_control (not cached)
 *
 * Tool definitions get cache_control on the last entry (Anthropic's
 * breakpoint model caches everything up to and including the marked block).
 */
export class AnthropicCacheAdapter implements CacheAdapter {
  readonly provider = 'claude' as const;

  wrapSystemBlock(content: string, stability: StabilityTier): ProviderSystemBlock {
    if (stability === 'ephemeral') {
      return { type: 'text', text: content };
    }

    const ttl = stability === 'static' ? '1h' : undefined;
    return {
      type: 'text',
      text: content,
      cache_control: {
        type: 'ephemeral',
        ...(ttl !== undefined && { ttl }),
      },
    };
  }

  wrapTools(tools: ToolDefinition[], stability: StabilityTier): ProviderToolBlock {
    if (tools.length === 0 || stability === 'ephemeral') {
      return { tools: tools.map((t) => ({ ...t })) };
    }

    const wrapped = tools.map((t) => ({ ...t }));
    wrapped[wrapped.length - 1].cache_control = { type: 'ephemeral' as const };
    return { tools: wrapped };
  }

  orderContent(blocks: StabilityTaggedBlock[]): StabilityTaggedBlock[] {
    return [...blocks].sort((a, b) => TIER_ORDER[a.stability] - TIER_ORDER[b.stability]);
  }

  parseCacheUsage(response: unknown): {
    cacheCreationTokens: number;
    cacheReadTokens: number;
  } {
    const resp = response as Record<string, unknown> | null | undefined;
    const usage = resp?.usage as Record<string, unknown> | undefined;
    return {
      cacheCreationTokens: (usage?.cache_creation_input_tokens as number) ?? 0,
      cacheReadTokens: (usage?.cache_read_input_tokens as number) ?? 0,
    };
  }
}
