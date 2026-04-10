import type { StabilityTier } from '@harness-engineering/types';

/**
 * A content block tagged with its stability classification.
 * Used by CacheAdapter.orderContent() to sort blocks for optimal cache hits.
 */
export interface StabilityTaggedBlock {
  /** Stability classification of this content */
  stability: StabilityTier;
  /** The content payload (system prompt text, tool output, etc.) */
  content: string;
  /** The role this block serves in the message (system, user, assistant) */
  role: 'system' | 'user' | 'assistant';
}

/**
 * Provider-formatted system prompt block.
 * Shape varies by provider -- may include cache_control (Anthropic),
 * cachedContentRef (Gemini), or plain text (OpenAI).
 */
export interface ProviderSystemBlock {
  type: 'text';
  text: string;
  /** Anthropic cache control directive */
  cache_control?: { type: 'ephemeral'; ttl?: string };
  /** Gemini cached content reference */
  cachedContentRef?: string;
}

/**
 * A tool definition as passed to provider APIs.
 * Minimal shape -- provider adapters may extend individual entries.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  /** Anthropic cache control directive (added by adapter) */
  cache_control?: { type: 'ephemeral'; ttl?: string };
}

/**
 * Provider-formatted tool block wrapping an array of tool definitions.
 */
export interface ProviderToolBlock {
  tools: ToolDefinition[];
}

/**
 * Unified interface for provider-specific prompt cache behavior.
 *
 * Each provider has different mechanisms for prompt caching:
 * - Anthropic: explicit cache_control breakpoints
 * - OpenAI: automatic prefix-matching (content ordering matters)
 * - Gemini: cachedContents resource for static content
 *
 * Adapters translate stability tiers into provider-native directives.
 */
export interface CacheAdapter {
  /** Provider identifier */
  provider: 'claude' | 'openai' | 'gemini';

  /** Wrap a system prompt block with provider-specific cache directives */
  wrapSystemBlock(content: string, stability: StabilityTier): ProviderSystemBlock;

  /** Wrap tool definitions with provider-specific cache directives */
  wrapTools(tools: ToolDefinition[], stability: StabilityTier): ProviderToolBlock;

  /** Order message content blocks for optimal cache hit rates */
  orderContent(blocks: StabilityTaggedBlock[]): StabilityTaggedBlock[];

  /** Extract cache token counts from a provider API response */
  parseCacheUsage(response: unknown): {
    cacheCreationTokens: number;
    cacheReadTokens: number;
  };
}
