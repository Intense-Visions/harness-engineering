# TanStack Query: Suspense Mode

> Use useSuspenseQuery to integrate React's Suspense and error boundaries with TanStack Query

## When to Use

- Building components that should suspend while data loads rather than rendering a loading state inline
- Integrating TanStack Query with React 18 concurrent features and streaming SSR
- Eliminating loading state conditionals (`if (isLoading) return <Spinner />`) from components
- Coordinating multiple loading states with a single parent Suspense boundary
- Using TanStack Query with Next.js App Router streaming

## Instructions

1. Use `useSuspenseQuery` instead of `useQuery` to opt into suspense mode — the component suspends instead of returning `isLoading`.
2. Wrap components using `useSuspenseQuery` in a `<Suspense fallback={...}>` boundary — without it, React throws an error.
3. Use `useSuspenseQueries` (plural) to run multiple suspense queries in parallel — suspends until all resolve.
4. Pair each `<Suspense>` with an error boundary (`<ErrorBoundary>` from `react-error-boundary`) to handle query errors.
5. Prefer `useSuspenseQuery` for data that is always needed — use regular `useQuery` for optional or conditional data.
6. For Next.js, prefetch data in Server Components and hydrate via `<HydrationBoundary>` — the Client Component suspends only if the cache is empty.

```typescript
// With useSuspenseQuery — no loading conditional needed
'use client';
import { useSuspenseQuery } from '@tanstack/react-query';
import { postDetailOptions } from '@/queries/posts';

// This component either renders with data or suspends — never shows partial state
function PostContent({ id }: { id: string }) {
  const { data: post } = useSuspenseQuery(postDetailOptions(id));
  // data is guaranteed to be defined here — TypeScript knows this
  return <article>{post.content}</article>;
}

// Wrapping component manages the Suspense/Error boundaries
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

function PostPage({ id }: { id: string }) {
  return (
    <ErrorBoundary fallback={<PostError />}>
      <Suspense fallback={<PostSkeleton />}>
        <PostContent id={id} />
      </Suspense>
    </ErrorBoundary>
  );
}

// Multiple parallel suspense queries — waits for all
import { useSuspenseQueries } from '@tanstack/react-query';

function PostWithRelated({ id }: { id: string }) {
  const [{ data: post }, { data: related }] = useSuspenseQueries({
    queries: [
      postDetailOptions(id),
      relatedPostsOptions(id),
    ],
  });
  // Both are defined — component suspends until both resolve
  return <PostLayout post={post} related={related} />;
}
```

## Details

`useSuspenseQuery` changes TanStack Query's data contract: instead of returning `{ data: T | undefined, isLoading, isError }`, it returns `{ data: T }` — data is always defined when the component renders. The component suspends (pauses rendering) until the data is available, and throws errors to the nearest error boundary.

**Type safety improvement:** With regular `useQuery`, `data` is typed as `T | undefined` — requiring null checks everywhere. With `useSuspenseQuery`, `data` is typed as `T` — no null checks needed because the component cannot render without data.

**Suspense boundary placement:** Multiple `useSuspenseQuery` calls in the same component all contribute to the same Suspense boundary. They suspend sequentially (each waits for the previous before starting) unless you use `useSuspenseQueries` which starts all fetches in parallel.

**Sequential vs parallel suspension:** Two `useSuspenseQuery` calls in one component create a waterfall — the second query does not start until the first resolves (because the component re-renders after each suspension). Use `useSuspenseQueries` to start all in parallel.

**Error handling:** `useSuspenseQuery` throws errors to the nearest React error boundary — unlike regular `useQuery` which catches errors internally and returns them as `{ isError, error }`. Always pair `<Suspense>` with an `<ErrorBoundary>` when using suspense mode.

**Next.js App Router:** Suspense queries work naturally with Next.js streaming — the `<Suspense>` boundary streams its fallback first, then streams the resolved content. Combined with server-side prefetching via `<HydrationBoundary>`, the component only suspends on cold cache misses.

## Source

https://tanstack.com/query/latest/docs/framework/react/guides/suspense

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
