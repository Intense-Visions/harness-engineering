/**
 * Computes the delay (in ms) needed before the next API request can be made,
 * based on a snapshot of recent request/token activity and rate-limit config.
 *
 * Returns 0 when no throttling is needed.
 */
export interface RateLimitSnapshot {
  globalCooldownUntilMs: number | null;
  recentRequestTimestamps: number[];
  recentInputTokens: { timestamp: number; tokens: number }[];
  recentOutputTokens: { timestamp: number; tokens: number }[];
}

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxRequestsPerSecond: number;
  maxInputTokensPerMinute: number;
  maxOutputTokensPerMinute: number;
}

export function computeRateLimitDelay(
  snapshot: RateLimitSnapshot,
  config: RateLimitConfig
): number {
  const now = Date.now();

  // Global cooldown (e.g. from an explicit rate_limit event)
  if (snapshot.globalCooldownUntilMs && now < snapshot.globalCooldownUntilMs) {
    return snapshot.globalCooldownUntilMs - now;
  }

  // Per-minute request limit
  const recentMin = snapshot.recentRequestTimestamps.filter((ts) => now - ts < 60_000);
  if (recentMin.length > config.maxRequestsPerMinute) {
    const oldest = Math.min(...recentMin);
    return 60_000 - (now - oldest);
  }

  // Per-second request limit
  const recentSec = snapshot.recentRequestTimestamps.filter((ts) => now - ts < 1_000);
  if (recentSec.length >= config.maxRequestsPerSecond) {
    const oldest = Math.min(...recentSec);
    return 1_000 - (now - oldest);
  }

  // Input token limit
  if (config.maxInputTokensPerMinute > 0) {
    const window = snapshot.recentInputTokens.filter((t) => now - t.timestamp < 60_000);
    const total = window.reduce((sum, t) => sum + t.tokens, 0);
    if (total >= config.maxInputTokensPerMinute && window.length > 0) {
      const oldest = Math.min(...window.map((t) => t.timestamp));
      return 60_000 - (now - oldest);
    }
  }

  // Output token limit
  if (config.maxOutputTokensPerMinute > 0) {
    const window = snapshot.recentOutputTokens.filter((t) => now - t.timestamp < 60_000);
    const total = window.reduce((sum, t) => sum + t.tokens, 0);
    if (total >= config.maxOutputTokensPerMinute && window.length > 0) {
      const oldest = Math.min(...window.map((t) => t.timestamp));
      return 60_000 - (now - oldest);
    }
  }

  return 0;
}
