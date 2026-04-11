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
 * OpenAI cache adapter.
 *
 * OpenAI uses automatic prefix-matching for prompt caching -- no explicit
 * cache directives are needed. The only optimization is content ordering:
 * static content first, then session, then ephemeral. This maximizes the
 * stable prefix length that OpenAI's automatic caching can match.
 *
 * wrapSystemBlock and wrapTools are passthroughs.
 */
export class OpenAICacheAdapter implements CacheAdapter {
  readonly provider = 'openai' as const;

  wrapSystemBlock(content: string, _stability: StabilityTier): ProviderSystemBlock {
    return { type: 'text', text: content };
  }

  wrapTools(tools: ToolDefinition[], _stability: StabilityTier): ProviderToolBlock {
    return { tools: tools.map((t) => ({ ...t })) };
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
    const details = usage?.prompt_tokens_details as Record<string, unknown> | undefined;
    return {
      cacheCreationTokens: 0,
      cacheReadTokens: (details?.cached_tokens as number) ?? 0,
    };
  }
}
