/**
 * Per-process LRU ETag cache. Keys: `feature:<externalId>`, `list:all`,
 * `list:status:<sortedStatuses>`. No cross-process invalidation.
 * See spec §"ETag store" and decision D-P2-E (no third-party LRU).
 */
export class ETagStore {
  private readonly max: number;
  private readonly cache = new Map<string, { etag: string; data: unknown }>();

  constructor(max = 500) {
    this.max = max;
  }

  get(key: string): { etag: string; data: unknown } | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    // touch: move to end of insertion order
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  set(key: string, etag: string, data: unknown): void {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, { etag, data });
    if (this.cache.size > this.max) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  /** Invalidate all keys matching a prefix. Used when writes invalidate `list:*`. */
  invalidatePrefix(prefix: string): void {
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  get size(): number {
    return this.cache.size;
  }
}
