/**
 * CacheMetricsRecorder — in-memory ring buffer recording prompt-cache
 * hits/misses per backend invocation. Powers `GET /api/v1/telemetry/cache/stats`
 * and the dashboard `/insights/cache` widget.
 *
 * Design notes:
 * - Sliding window of the last `capacity` records (default 1000). When
 *   the buffer is full, oldest records are evicted FIFO. Restarts reset
 *   the window — this is intentional: prompt-cache hit-rate is a
 *   debugging/observability signal, not an audit record.
 * - `windowStartedAt` is set on the first `record()` after construction
 *   (or after `reset()`) and is reported as a unix-ms timestamp. Empty
 *   recorders report `0` so the API response remains JSON-stable.
 * - All operations are O(1) amortized; `record()` is on the hot path
 *   for every Anthropic response and must not allocate.
 */

import type { PromptCacheStats } from '@harness-engineering/types';

interface Sample {
  backendId: string;
  hit: boolean;
  tokensCreated: number;
  tokensRead: number;
}

const DEFAULT_CAPACITY = 1000;

export interface CacheMetricsRecorderOptions {
  capacity?: number;
  /** Injectable clock for deterministic testing. Defaults to `Date.now`. */
  now?: () => number;
}

export class CacheMetricsRecorder {
  private readonly capacity: number;
  private readonly now: () => number;
  private readonly buffer: Sample[] = [];
  private windowStartedAt = 0;

  constructor(opts: CacheMetricsRecorderOptions = {}) {
    this.capacity = opts.capacity ?? DEFAULT_CAPACITY;
    this.now = opts.now ?? Date.now;
  }

  /**
   * Append a single cache observation. Hot-path: O(1) amortized, no
   * allocations beyond the sample object itself.
   */
  record(backendId: string, hit: boolean, tokensCreated: number, tokensRead: number): void {
    if (this.windowStartedAt === 0) this.windowStartedAt = this.now();
    if (this.buffer.length >= this.capacity) this.buffer.shift();
    this.buffer.push({ backendId, hit, tokensCreated, tokensRead });
  }

  /** Aggregate the current window into a `PromptCacheStats` snapshot. */
  getStats(): PromptCacheStats {
    let hits = 0;
    let misses = 0;
    const byBackend: Record<string, { hits: number; misses: number }> = {};

    for (const s of this.buffer) {
      if (s.hit) hits++;
      else misses++;
      const slot = byBackend[s.backendId] ?? { hits: 0, misses: 0 };
      if (s.hit) slot.hits++;
      else slot.misses++;
      byBackend[s.backendId] = slot;
    }

    const totalRequests = hits + misses;
    const hitRate = totalRequests === 0 ? 0 : hits / totalRequests;

    return {
      totalRequests,
      hits,
      misses,
      hitRate,
      byBackend,
      windowStartedAt: this.windowStartedAt,
    };
  }

  /** Clear the buffer and reset the window-start marker. */
  reset(): void {
    this.buffer.length = 0;
    this.windowStartedAt = 0;
  }
}
