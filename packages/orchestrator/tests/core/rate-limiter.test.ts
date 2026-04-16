import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeRateLimitDelay } from '../../src/core/rate-limiter';

const baseConfig = {
  maxRequestsPerMinute: 50,
  maxRequestsPerSecond: 2,
  maxInputTokensPerMinute: 80_000,
  maxOutputTokensPerMinute: 40_000,
};

const emptySnapshot = {
  globalCooldownUntilMs: null,
  recentRequestTimestamps: [],
  recentInputTokens: [],
  recentOutputTokens: [],
};

describe('computeRateLimitDelay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 when no usage and no cooldown', () => {
    expect(computeRateLimitDelay(emptySnapshot, baseConfig)).toBe(0);
  });

  it('returns remaining cooldown when globalCooldownUntilMs is in the future', () => {
    const cooldownUntil = Date.now() + 5_000;
    expect(
      computeRateLimitDelay({ ...emptySnapshot, globalCooldownUntilMs: cooldownUntil }, baseConfig)
    ).toBe(5_000);
  });

  it('ignores cooldown that has already passed', () => {
    expect(
      computeRateLimitDelay(
        { ...emptySnapshot, globalCooldownUntilMs: Date.now() - 1_000 },
        baseConfig
      )
    ).toBe(0);
  });

  it('returns delay when per-minute request limit is exceeded', () => {
    const now = Date.now();
    // 51 requests in the last minute (limit is 50)
    const recentRequestTimestamps = Array.from({ length: 51 }, (_, i) => now - i * 100);
    const result = computeRateLimitDelay({ ...emptySnapshot, recentRequestTimestamps }, baseConfig);
    expect(result).toBeGreaterThan(0);
  });

  it('returns delay when per-second request limit is exceeded', () => {
    const now = Date.now();
    // 3 requests in the last 500ms (limit is 2/sec) — the state machine pushes
    // the current turn's timestamp before this function is called, so the
    // snapshot already includes it. We exceed only when length > max.
    const recentRequestTimestamps = [now, now - 100, now - 200];
    const result = computeRateLimitDelay({ ...emptySnapshot, recentRequestTimestamps }, baseConfig);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(1_000);
  });

  it('does not throttle the first request when per-second limit is 1', () => {
    // Regression: the orchestrator pushes the turn_start timestamp into the
    // snapshot before calling computeRateLimitDelay. With maxRequestsPerSecond=1
    // and a fresh state, the snapshot contains exactly one timestamp (the
    // current request). An off-by-one `>=` check previously throttled this
    // single request for ~999ms on every fresh dispatch.
    const now = Date.now();
    const result = computeRateLimitDelay(
      { ...emptySnapshot, recentRequestTimestamps: [now] },
      { ...baseConfig, maxRequestsPerSecond: 1 }
    );
    expect(result).toBe(0);
  });

  it('throttles the second request within the same second when limit is 1', () => {
    const now = Date.now();
    const result = computeRateLimitDelay(
      { ...emptySnapshot, recentRequestTimestamps: [now - 100, now] },
      { ...baseConfig, maxRequestsPerSecond: 1 }
    );
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(1_000);
  });

  it('returns delay when input token budget is exceeded', () => {
    const now = Date.now();
    const recentInputTokens = [{ timestamp: now - 30_000, tokens: 100_000 }];
    const result = computeRateLimitDelay({ ...emptySnapshot, recentInputTokens }, baseConfig);
    expect(result).toBeGreaterThan(0);
  });

  it('returns delay when output token budget is exceeded', () => {
    const now = Date.now();
    const recentOutputTokens = [{ timestamp: now - 10_000, tokens: 50_000 }];
    const result = computeRateLimitDelay({ ...emptySnapshot, recentOutputTokens }, baseConfig);
    expect(result).toBeGreaterThan(0);
  });

  it('skips token checks when limit is 0', () => {
    const now = Date.now();
    const recentInputTokens = [{ timestamp: now - 10_000, tokens: 1_000_000 }];
    expect(
      computeRateLimitDelay(
        { ...emptySnapshot, recentInputTokens },
        { ...baseConfig, maxInputTokensPerMinute: 0 }
      )
    ).toBe(0);
  });

  it('ignores entries outside the rolling window', () => {
    const now = Date.now();
    const recentRequestTimestamps = Array.from({ length: 100 }, (_, i) => now - 70_000 - i);
    expect(computeRateLimitDelay({ ...emptySnapshot, recentRequestTimestamps }, baseConfig)).toBe(
      0
    );
  });

  it('cooldown takes precedence over usage limits', () => {
    const cooldownUntil = Date.now() + 10_000;
    const now = Date.now();
    const recentRequestTimestamps = Array.from({ length: 51 }, (_, i) => now - i * 100);
    expect(
      computeRateLimitDelay(
        { ...emptySnapshot, globalCooldownUntilMs: cooldownUntil, recentRequestTimestamps },
        baseConfig
      )
    ).toBe(10_000);
  });
});
