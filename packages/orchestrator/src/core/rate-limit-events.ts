import type { AgentEvent } from '@harness-engineering/types';

/**
 * Shape of the structured payload carried by subscription-level `rate_limit`
 * and `rate_limit_sleep` events. Backends populate this when the CLI reports
 * a plan-quota exhaustion with a known reset time.
 */
export interface SubscriptionLimitContent {
  message: string;
  resetsAtMs: number;
  /** Present on rate_limit_sleep; ms we plan to sleep. */
  sleepMs?: number;
  /** Present when parser had to guess the reset (unknown timezone, bad format). */
  resolved?: 'exact' | 'fallback';
  /** Present when the planned sleep was capped by MAX_SLEEP_MS. */
  truncated?: boolean;
  resetTime?: string;
  timezone?: string;
}

/**
 * Extract a subscription-level reset timestamp from an AgentEvent's content.
 * Returns null for per-request limits (no structured content) or when the
 * timestamp is missing/invalid.
 */
export function extractRateLimitReset(event: AgentEvent): number | null {
  const content = event.content;
  if (typeof content !== 'object' || content === null) return null;
  const resets = (content as { resetsAtMs?: unknown }).resetsAtMs;
  return typeof resets === 'number' && Number.isFinite(resets) ? resets : null;
}
