/**
 * Map over `items` with at most `limit` concurrent invocations of `fn`.
 * Results are returned in input order. If `fn` rejects, the rejection's
 * Error is placed in that slot rather than rejecting the whole batch, so a
 * single failing task cannot sink a maintenance sweep.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<(R | Error)[]> {
  const cap = Math.max(1, Math.floor(limit) || 1);
  const results: (R | Error)[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i] as T, i);
      } catch (err) {
        results[i] = err instanceof Error ? err : new Error(String(err));
      }
    }
  }
  const workers = Array.from({ length: Math.min(cap, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
