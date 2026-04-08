# TanStack Query: Prefetching and SSR

> Hydrate the client cache from server-fetched data using dehydrate/hydrate and HydrationBoundary

## When to Use

- Eliminating loading spinners by pre-populating the cache with server-fetched data
- Integrating TanStack Query with Next.js App Router Server Components
- Prefetching data on hover before a user navigates to a page
- Passing server-rendered data to client-side queries without a separate API round-trip

## Instructions

1. In Next.js App Router, create a `QueryClient` in the Server Component and prefetch data with `queryClient.prefetchQuery()`.
2. Pass the dehydrated state to a `<HydrationBoundary>` component — it hydrates the client-side `QueryClient` automatically.
3. Use `dehydrate(queryClient)` from `@tanstack/react-query` to serialize the cache for transport to the client.
4. In Client Components, call `useQuery()` with the same key used during prefetch — the data is available immediately with no loading state.
5. Use `queryClient.prefetchQuery()` (not `ensureQueryData`) when you do not need the return value — it avoids an extra await.
6. Prefetch on hover using `queryClient.prefetchQuery()` in a `onMouseEnter` handler to warm the cache before navigation.
7. Set `staleTime` to match your revalidation window — data prefetched at render time should not immediately re-fetch on mount.

```typescript
// app/posts/page.tsx — Server Component with prefetch
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { postListOptions } from '@/queries/posts';
import { PostList } from './post-list';

export default async function PostsPage() {
  const queryClient = new QueryClient();

  // Prefetch on the server — data is fetched once, not per-component
  await queryClient.prefetchQuery(postListOptions({}));

  return (
    // Injects dehydrated cache into the page
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PostList />
    </HydrationBoundary>
  );
}

// app/posts/post-list.tsx — Client Component, no loading state
'use client';
import { useQuery } from '@tanstack/react-query';
import { postListOptions } from '@/queries/posts';

export function PostList() {
  // Data is immediately available — cache was hydrated from server
  const { data: posts } = useQuery(postListOptions({}));
  return <ul>{posts?.map(p => <li key={p.id}>{p.title}</li>)}</ul>;
}

// Prefetch on hover — warm cache before navigation
function PostLink({ id }: { id: string }) {
  const queryClient = useQueryClient();
  return (
    <Link
      href={`/posts/${id}`}
      onMouseEnter={() => queryClient.prefetchQuery(postDetailOptions(id))}
    >
      View Post
    </Link>
  );
}
```

## Details

TanStack Query's SSR pattern solves the classic problem: server-rendered HTML contains data, but the client-side React Query cache is empty on mount, causing a flash of loading state as queries re-execute.

**Dehydration/hydration mechanism:** `dehydrate(queryClient)` serializes successful query results into a plain JSON-serializable object. `<HydrationBoundary state={dehydratedState}>` deserializes it into the client's `QueryClient` on mount. The client queries then find their data already in cache and skip the initial fetch.

**`staleTime` is critical for SSR:** Without `staleTime`, TanStack Query considers all queries stale immediately on mount and triggers background refetches — wasting the server prefetch. Set `staleTime` to at least as long as the server render takes (e.g., `Infinity` for fully static data, or a few minutes for semi-fresh data).

**New QueryClient per request:** In Server Components, create a `new QueryClient()` per page render, not a shared singleton. A singleton would leak data between user requests in a server-side Node.js process.

**Multiple prefetches:** Prefetch all queries needed by a page segment at once using `Promise.all`:

```typescript
await Promise.all([
  queryClient.prefetchQuery(postListOptions({})),
  queryClient.prefetchQuery(categoriesOptions()),
]);
```

**Router-level prefetch:** For non-Next.js apps, TanStack Router has built-in prefetch integration via `loader` functions that call `ensureQueryData`. This achieves the same effect without manual `dehydrate/hydrate` wiring.

## Source

https://tanstack.com/query/latest/docs/framework/react/guides/prefetching
