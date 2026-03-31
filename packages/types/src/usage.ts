import type { TokenUsage } from './orchestrator';

// Re-export TokenUsage for convenience
export type { TokenUsage } from './orchestrator';

/**
 * Extended entry for cost tracking storage and display.
 * Composes TokenUsage — does not extend it.
 */
export interface UsageRecord {
  /** Harness session identifier */
  sessionId: string;
  /** ISO 8601 timestamp of the usage event */
  timestamp: string;
  /** Token counts for this event */
  tokens: TokenUsage;
  /** Tokens used to create prompt cache entries */
  cacheCreationTokens?: number;
  /** Tokens read from prompt cache */
  cacheReadTokens?: number;
  /** Model identifier (e.g., "claude-sonnet-4-20250514") */
  model?: string;
  /** Cost in integer microdollars (USD * 1,000,000), calculated at read time */
  costMicroUSD?: number;
}

/**
 * Per-model pricing rates, all in USD per 1 million tokens.
 */
export interface ModelPricing {
  /** Input token cost per 1M tokens */
  inputPer1M: number;
  /** Output token cost per 1M tokens */
  outputPer1M: number;
  /** Cache read cost per 1M tokens (not all models support caching) */
  cacheReadPer1M?: number;
  /** Cache write/creation cost per 1M tokens */
  cacheWritePer1M?: number;
}
