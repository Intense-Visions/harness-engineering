# TanStack Query: Cache Management

> Directly read, write, and remove cache entries with QueryClient methods

## When to Use

- Updating related cache entries after a mutation without an extra network request
- Pre-populating the cache with data received from a WebSocket or server-sent event
- Removing cached data when it is known to be invalid (e.g., after logout)
- Inspecting cached values in tests to assert cache state after operations
- Implementing advanced patterns like cache federation or cross-query updates

## Instructions

1. Use `queryClient.setQueryData(key, updaterOrValue)` to write a value directly to the cache — the query does not refetch.
2. Use `queryClient.getQueryData(key)` to read a cached value synchronously — returns `undefined` if not cached.
3. Use `queryClient.cancelQueries({ queryKey })` before manual cache writes to prevent in-flight fetches from overwriting your change.
4. Use `queryClient.removeQueries({ queryKey })` to evict cache entries entirely — they refetch fresh on next mount.
5. Use `queryClient.clear()` to clear the entire cache — call this on logout to remove all user data.
6. Use `queryClient.getQueriesData(filter)` to bulk-read multiple cache entries matching a filter.
7. Use updater functions in `setQueryData` for immutable updates — receive current value, return new value.

```typescript
// Real-time cache update from WebSocket
function useLivePostUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const ws = new WebSocket('/ws/posts');

    ws.onmessage = (event) => {
      const updatedPost: Post = JSON.parse(event.data);

      // Update the specific post detail
      queryClient.setQueryData(postKeys.detail(updatedPost.id), updatedPost);

      // Update the post in all list caches
      queryClient.setQueriesData<PostsPage>({ queryKey: postKeys.lists() }, (old) => {
        if (!old) return old;
        return {
          ...old,
          posts: old.posts.map((p) => (p.id === updatedPost.id ? updatedPost : p)),
        };
      });
    };

    return () => ws.close();
  }, [queryClient]);
}

// Logout — clear all user data from cache
function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    queryClient.clear(); // remove all cached data
    router.push('/login');
  };
}

// Seeding cache after create mutation — avoid refetch
const { mutate: createPost } = useMutation({
  mutationFn: (data: CreatePostInput) =>
    fetch('/api/posts', { method: 'POST', body: JSON.stringify(data) }).then((r) => r.json()),
  onSuccess: (newPost: Post) => {
    // Add to detail cache directly
    queryClient.setQueryData(postKeys.detail(newPost.id), newPost);
    // Invalidate lists — server determines list membership
    queryClient.invalidateQueries({ queryKey: postKeys.lists() });
  },
});
```

## Details

TanStack Query's cache is a `Map`-like structure keyed by serialized query keys. `setQueryData`, `getQueryData`, and `removeQueries` give direct programmatic access to this cache outside the normal fetch lifecycle.

**`setQueryData` vs `invalidateQueries`:** `setQueryData` writes a value and marks the query as `fresh` (it will not refetch until `staleTime` expires). `invalidateQueries` marks the query as `stale` and triggers a background refetch. Use `setQueryData` when you have the correct server response in hand (e.g., from a create mutation); use `invalidateQueries` when you know data has changed but do not have the new value.

**`setQueriesData` for list updates:** When a single entity update needs to reflect in multiple list queries (e.g., filtered views), use `setQueriesData(filter, updater)` to update all matching caches in one call. The filter uses the same matching logic as `invalidateQueries`.

**Observer pattern:** Use `queryClient.getQueryCache().subscribe(callback)` to observe all cache changes. This is useful for syncing query state to external systems (analytics, debug logging). Unsubscribe on cleanup.

**Type safety:** `getQueryData<T>(key)` returns `T | undefined`. Always handle the `undefined` case — the cache may not have the value if it was never fetched or was garbage collected.

**Testing assertions:** In tests, call `queryClient.getQueryData(key)` after mutations to assert that the cache was updated correctly — without needing to render a component and inspect the DOM.

## Source

https://tanstack.com/query/latest/docs/reference/QueryClient
