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
 * Marker prefix for Gemini cachedContents references.
 * In a live integration, the orchestrator replaces this with the actual
 * cachedContents/{id} from the Gemini API. This adapter produces the marker
 * so the orchestrator knows which blocks to cache.
 */
const CACHED_CONTENT_MARKER = 'cachedContents:pending';

/**
 * Gemini cache adapter.
 *
 * Gemini uses explicit `cachedContents` resources for static content:
 * - static: marked with cachedContentRef for the orchestrator to resolve
 *   into a real cachedContents/{id} via the Gemini API
 * - session: passthrough (relies on implicit caching in Gemini 2.5+)
 * - ephemeral: passthrough
 *
 * Tools are passed through unchanged -- Gemini caches tools as part
 * of the cachedContents resource when applicable.
 */
export class GeminiCacheAdapter implements CacheAdapter {
  readonly provider = 'gemini' as const;

  wrapSystemBlock(content: string, stability: StabilityTier): ProviderSystemBlock {
    if (stability === 'static') {
      return {
        type: 'text',
        text: content,
        cachedContentRef: CACHED_CONTENT_MARKER,
      };
    }
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
    const metadata = resp?.usageMetadata as Record<string, unknown> | undefined;
    return {
      cacheCreationTokens: 0,
      cacheReadTokens: (metadata?.cachedContentTokenCount as number) ?? 0,
    };
  }
}
