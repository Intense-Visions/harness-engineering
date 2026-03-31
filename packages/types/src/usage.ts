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

/**
 * Aggregated usage for a single calendar day.
 */
export interface DailyUsage {
  /** ISO 8601 date string (YYYY-MM-DD) */
  date: string;
  /** Number of distinct sessions that had activity on this day */
  sessionCount: number;
  /** Summed token counts across all sessions */
  tokens: TokenUsage;
  /** Summed cache creation tokens (omitted if no cache data) */
  cacheCreationTokens?: number;
  /** Summed cache read tokens (omitted if no cache data) */
  cacheReadTokens?: number;
  /** Total cost in integer microdollars, null if any session has unknown pricing */
  costMicroUSD: number | null;
  /** Distinct model identifiers seen on this day */
  models: string[];
}

/**
 * Aggregated usage for a single session across all its turns.
 */
export interface SessionUsage {
  /** Harness session identifier */
  sessionId: string;
  /** ISO 8601 timestamp of the first event in this session */
  firstTimestamp: string;
  /** ISO 8601 timestamp of the last event in this session */
  lastTimestamp: string;
  /** Summed token counts across all turns */
  tokens: TokenUsage;
  /** Summed cache creation tokens (omitted if no cache data) */
  cacheCreationTokens?: number;
  /** Summed cache read tokens (omitted if no cache data) */
  cacheReadTokens?: number;
  /** Model identifier (may be populated from CC data) */
  model?: string;
  /** Total cost in integer microdollars, null if pricing unavailable */
  costMicroUSD: number | null;
  /** Data source: 'harness', 'claude-code', or 'merged' */
  source: 'harness' | 'claude-code' | 'merged';
}
