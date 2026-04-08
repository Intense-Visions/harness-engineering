# TanStack Query: Query Invalidation

> Control cache freshness with invalidateQueries, staleTime, gcTime, and refetch strategies

## When to Use

- Refreshing data after a mutation without a full page reload
- Tuning how long cached data is considered fresh before background refetching
- Controlling when stale queries are garbage collected from memory
- Deciding between active refetch (immediate) and background refetch (on next mount/focus)

## Instructions

1. Call `queryClient.invalidateQueries({ queryKey })` after mutations to mark related queries as stale and trigger refetch.
2. Use hierarchical keys for broad invalidation — `{ queryKey: ['posts'] }` invalidates all queries whose key starts with `['posts']`.
3. Set `refetchType: 'active'` (default) to refetch only currently mounted queries; use `refetchType: 'all'` to refetch mounted and unmounted cached queries; use `refetchType: 'none'` to mark stale without refetching.
4. Configure `staleTime` in `queryOptions` or globally in `QueryClient` defaults — this is how long data is considered fresh (no background refetch on mount).
5. Configure `gcTime` (formerly `cacheTime`) to control how long inactive query data stays in memory — defaults to 5 minutes.
6. Use `queryClient.refetchQueries()` when you want immediate refetch without going through the stale check.
7. Prefer `invalidateQueries` over `refetchQueries` for post-mutation refresh — invalidation is more composable with `staleTime`.

```typescript
// Global defaults in QueryClient setup
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute — queries fresh for 60s after fetch
      gcTime: 5 * 60 * 1000, // 5 minutes — inactive data stays in memory for 5min
      retry: 2, // retry failed requests twice
    },
  },
});

// Post-mutation invalidation patterns
function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      // Invalidate all post lists — refetches active ones immediately
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
    },
  });
}

// Selective invalidation by refetchType
queryClient.invalidateQueries({
  queryKey: postKeys.lists(),
  refetchType: 'active', // only refetch if component is currently mounted
});

// Targeted invalidation — only invalidate a specific detail
queryClient.invalidateQueries({
  queryKey: postKeys.detail('abc-123'),
  exact: true, // match exact key, not prefix
});
```

## Details

TanStack Query maintains a lifecycle for each cached query: `fresh` → `stale` → `inactive` → `garbage collected`.

**`staleTime`:** While data is `fresh`, queries do not refetch on component mount or window focus. Once data becomes `stale` (after `staleTime` ms), TanStack Query triggers a background refetch on the next mount or focus event. Default is `0` — data is always stale immediately after fetching.

**`gcTime`:** When a query has no active subscribers (no component mounted that uses it), TanStack Query starts a garbage collection timer. After `gcTime` ms, the cached data is removed. If the query mounts again before GC, it still returns the stale cached data immediately while refetching in the background.

**Invalidation vs refetch timing:**

- `invalidateQueries` with `refetchType: 'active'`: marks stale + immediately refetches mounted queries. Non-mounted queries refetch next time they mount.
- `invalidateQueries` with `refetchType: 'none'`: marks stale only. Next mount or focus triggers refetch.
- `refetchQueries`: forces immediate refetch regardless of staleTime.

**`exact: true` vs prefix matching:** Without `exact`, `queryKey: ['posts']` matches `['posts', 'list', {}]`, `['posts', 'detail', '1']`, etc. With `exact: true`, it only matches the exact key `['posts']`. Use prefix matching for broad post-mutation invalidation; use `exact` when only a specific entry should be invalidated.

**Combining staleTime with invalidation:** Setting `staleTime: Infinity` is common for reference data that never changes at runtime (static lists, config). Explicitly invalidate these on admin mutations rather than relying on time-based staleness.

## Source

https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation
