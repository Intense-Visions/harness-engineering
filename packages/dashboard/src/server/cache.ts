import type { CacheEntry } from '../shared/types';

/**
 * Simple in-memory cache with configurable TTL.
 * Used by gatherers and SSE polling to avoid redundant computation.
 */
export class DataCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /** Get a cached entry. Returns null if missing or expired. */
  get<T>(key: string): CacheEntry<T> | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry as CacheEntry<T>;
  }

  /** Store a value with the default TTL. */
  set<T>(key: string, data: T, ttlMs?: number): void {
    const now = Date.now();
    this.store.set(key, {
      data,
      timestamp: now,
      expiresAt: now + (ttlMs ?? this.defaultTtlMs),
    });
  }

  /** Remove a specific key from the cache. */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Remove all entries from the cache. */
  clear(): void {
    this.store.clear();
  }
}
