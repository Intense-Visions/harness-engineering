# TanStack Query: Infinite Queries

> Implement cursor-based pagination and "load more" UX with useInfiniteQuery

## When to Use

- Building infinite scroll feeds (social media, activity logs, search results)
- Implementing "Load More" button pagination without traditional page numbers
- Fetching cursor-based APIs that return a `nextCursor` or `nextPageToken`
- Building virtualized lists that load additional data as the user scrolls

## Instructions

1. Use `useInfiniteQuery` instead of `useQuery` for paginated data that loads incrementally.
2. Provide `initialPageParam` (the starting cursor or page number) and `getNextPageParam` (extracts the next cursor from the last page's response).
3. Access all loaded pages via `data.pages` — an array of page responses. Flatten with `flatMap` to produce a single item list.
4. Access `data.pageParams` to get the list of params used for each loaded page.
5. Call `fetchNextPage()` to load the next page — trigger this on scroll, button click, or intersection observer.
6. Check `hasNextPage` before showing a "load more" button — it returns `false` when `getNextPageParam` returns `undefined`.
7. Use `isFetchingNextPage` to show a loading indicator during incremental loads without hiding existing data.
8. Pair with `IntersectionObserver` or `react-intersection-observer` for true infinite scroll.

```typescript
// queries/posts.ts — infinite query setup
import { useInfiniteQuery } from '@tanstack/react-query';

interface PostsPage {
  posts: Post[];
  nextCursor: string | null;
}

export function useInfinitePosts(filters: PostFilters) {
  return useInfiniteQuery({
    queryKey: ['posts', 'infinite', filters],
    queryFn: ({ pageParam }) =>
      fetch(`/api/posts?cursor=${pageParam}&limit=20&${new URLSearchParams(filters)}`)
        .then<PostsPage>(r => r.json()),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // undefined signals no more pages → hasNextPage = false
  });
}

// components/post-feed.tsx — infinite scroll with intersection observer
import { useRef, useEffect } from 'react';
import { useInfinitePosts } from '@/queries/posts';

export function PostFeed({ filters }: { filters: PostFilters }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfinitePosts(filters);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    });
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const posts = data?.pages.flatMap(page => page.posts) ?? [];

  return (
    <div>
      {posts.map(post => <PostCard key={post.id} post={post} />)}
      <div ref={sentinelRef} />
      {isFetchingNextPage && <LoadingSpinner />}
    </div>
  );
}
```

## Details

`useInfiniteQuery` stores each page response in `data.pages` as a separate array element. This structure allows TanStack Query to append new pages without mutating existing ones, enabling React to optimize re-renders — only the new page's components re-render when a page loads.

**`getNextPageParam` contract:** Return the next page's param value (cursor, page number, offset) to signal more pages exist. Return `undefined` (or `null`) to signal the end of data — TanStack Query sets `hasNextPage` to `false`.

**Cursor vs offset pagination:** Cursor-based pagination (returning an opaque `nextCursor`) is more reliable than offset (`page=2`) for feeds with real-time inserts. Offset pagination can miss items or show duplicates if new items are inserted at the top between page loads.

**Flattening pages:** `data.pages` is `PostsPage[][]` logically — an array of page objects each containing an `items` array. Use `data.pages.flatMap(page => page.posts)` to get a flat `Post[]` for rendering. Memoize this with `useMemo` if the list is large and re-renders are frequent.

**Prefetching the next page:** Call `queryClient.prefetchInfiniteQuery()` with `{ pages: 1 }` to warm the cache for the first page on hover. Prefetching subsequent pages is complex and usually not worth the complexity.

**Refetch behavior:** `refetchPage` controls which pages refetch on invalidation. By default, all pages refetch. Pass `refetchPage: (lastPage, index) => index === 0` to only refetch the first page — useful for feeds where older pages are effectively immutable.

## Source

https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
