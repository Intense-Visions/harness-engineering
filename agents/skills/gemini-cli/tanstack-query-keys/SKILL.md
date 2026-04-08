# TanStack Query: Query Keys

> Structure query keys as type-safe factories to enable precise cache invalidation and scoped refetching

## When to Use

- Designing the query key structure for a new feature or data domain
- Implementing cache invalidation after mutations that affects a subset of cached queries
- Standardizing key shape across a team to avoid cache collisions
- Co-locating query functions with their keys to prevent drift between key shape and fetcher arguments
- Debugging cache misses caused by key shape mismatches

## Instructions

1. Define query keys as arrays, never as strings — arrays allow hierarchical matching during invalidation.
2. Create a query key factory object per domain (entity type) that returns typed arrays.
3. Co-locate the key factory with the query function in a `queries/posts.ts` file — keys and fetchers evolve together.
4. Use hierarchical keys: `['posts']` → `['posts', 'list']` → `['posts', 'list', { status: 'published' }]` — invalidating `['posts']` invalidates all descendants.
5. Include all variables that affect the fetched data in the key — different arguments must produce different keys.
6. Avoid putting unstable references (functions, class instances) in keys — keys are serialized for comparison.
7. Use the `queryOptions()` helper from TanStack Query v5 to bundle key and fetcher into one object.

```typescript
// queries/posts.ts — query key factory pattern
import { queryOptions } from '@tanstack/react-query';

export const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (filters: PostFilters) => [...postKeys.lists(), filters] as const,
  details: () => [...postKeys.all, 'detail'] as const,
  detail: (id: string) => [...postKeys.details(), id] as const,
};

// Bundled options using queryOptions() helper (TanStack Query v5)
export const postListOptions = (filters: PostFilters) =>
  queryOptions({
    queryKey: postKeys.list(filters),
    queryFn: () => fetchPosts(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

export const postDetailOptions = (id: string) =>
  queryOptions({
    queryKey: postKeys.detail(id),
    queryFn: () => fetchPost(id),
  });

// components/post-list.tsx — consuming the options
import { useQuery } from '@tanstack/react-query';
import { postListOptions } from '@/queries/posts';

function PostList({ filters }: { filters: PostFilters }) {
  const { data } = useQuery(postListOptions(filters));
  return <ul>{data?.map(p => <li key={p.id}>{p.title}</li>)}</ul>;
}

// After creating a post — invalidate only the list scope
queryClient.invalidateQueries({ queryKey: postKeys.lists() });
```

## Details

Query keys are the foundation of TanStack Query's cache — every cached value is keyed by its query key. Getting the key structure right from the start prevents a class of bugs where mutations do not properly invalidate related queries.

**Hierarchical invalidation:** `invalidateQueries({ queryKey: ['posts'] })` invalidates every query whose key starts with `['posts']` — lists, details, filtered views. This is the primary mechanism for "refresh everything related to posts after a mutation."

**Key serialization:** TanStack Query serializes keys for comparison using a deep-equality algorithm. Object keys are compared by value, not reference. `{ status: 'published' }` and `{ status: 'published' }` (different object references) produce the same cache entry.

**`queryOptions()` in v5:** The `queryOptions()` helper was introduced in TanStack Query v5 to improve TypeScript type inference and co-location. Pass the result directly to `useQuery`, `prefetchQuery`, `ensureQueryData`, and `queryClient.fetchQuery` — all accept the same shape. This eliminates key drift between components and cache management code.

**Co-location principle:** When a fetcher function's arguments change, the key must change too — or the cache returns stale data with wrong parameters. Co-locating them in the same file (and ideally the same `queryOptions` call) makes this relationship impossible to miss.

**Stale vs invalid:** A query becomes `stale` after `staleTime` — it will refetch on next mount or focus. An `invalid` query refetches immediately (in the background) regardless of staleTime. `invalidateQueries` marks queries invalid; `staleTime` controls the automatic staleness lifecycle.

## Source

https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
