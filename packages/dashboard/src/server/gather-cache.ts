/**
 * Cache for expensive gather operations.
 * Tracks per-key last-run timestamps and supports explicit refresh.
 * Unlike DataCache (TTL-based), GatherCache entries never expire --
 * they persist until explicitly refreshed or the server restarts.
 */
export class GatherCache {
  private store = new Map<string, { data: unknown; lastRun: number }>();

  /** Check whether a gatherer has been run at least once. */
  hasRun(key: string): boolean {
    return this.store.has(key);
  }

  /** Get the timestamp (ms since epoch) of the last run, or null if never run. */
  lastRunTime(key: string): number | null {
    return this.store.get(key)?.lastRun ?? null;
  }

  /** Get the cached result, or null if never run. */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    return entry ? (entry.data as T) : null;
  }

  /**
   * Run a gather function if this key has not been run before.
   * Returns the cached result on subsequent calls.
   */
  async run<T>(key: string, gatherFn: () => Promise<T>): Promise<T> {
    const existing = this.store.get(key);
    if (existing) {
      return existing.data as T;
    }
    return this.refresh(key, gatherFn);
  }

  /**
   * Force re-run a gather function and update the cache.
   * Always executes the function regardless of cache state.
   */
  async refresh<T>(key: string, gatherFn: () => Promise<T>): Promise<T> {
    const data = await gatherFn();
    this.store.set(key, { data, lastRun: Date.now() });
    return data;
  }
}
