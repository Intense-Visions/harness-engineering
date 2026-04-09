# tRPC React Query Integration

> End-to-end type-safe data fetching with `api.xxx.useQuery`, `useMutation`, and cache invalidation via TanStack Query

## When to Use

- Fetching data from tRPC procedures in React client components
- Running mutations and automatically invalidating related queries on success
- Optimistically updating the UI before a mutation completes
- Accessing the TanStack Query cache imperatively (prefetch, set data, invalidate)

## Instructions

### 1. Create the typed React hooks

```typescript
// lib/api.ts (or lib/trpc/client.tsx)
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/root';

export const api = createTRPCReact<AppRouter>();
```

All hooks (`useQuery`, `useMutation`, `useSubscription`) are available on `api.<router>.<procedure>`.

### 2. Use useQuery for data fetching

```typescript
'use client';
import { api } from '@/lib/api';

function PostList() {
  const { data, isLoading, error } = api.post.list.useQuery(
    { limit: 20 },
    {
      staleTime: 60_000,           // Fresh for 60s — won't refetch on mount
      refetchOnWindowFocus: false, // Disable auto-refetch on tab focus
    }
  );

  if (isLoading) return <Skeleton />;
  if (error) return <Error message={error.message} />;

  return <ul>{data.map(post => <li key={post.id}>{post.title}</li>)}</ul>;
}
```

### 3. Use useMutation for writes

```typescript
function CreatePostForm() {
  const utils = api.useUtils();

  const createPost = api.post.create.useMutation({
    onSuccess: (newPost) => {
      // Invalidate and refetch the post list
      void utils.post.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      createPost.mutate({
        title: data.get('title') as string,
        content: data.get('content') as string,
      });
    }}>
      <input name="title" />
      <button type="submit" disabled={createPost.isPending}>
        {createPost.isPending ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  );
}
```

### 4. Optimistic updates

```typescript
const utils = api.useUtils();

const likePost = api.post.like.useMutation({
  onMutate: async ({ postId }) => {
    // Cancel outgoing queries for this data
    await utils.post.getById.cancel({ id: postId });

    // Snapshot the current value
    const previous = utils.post.getById.getData({ id: postId });

    // Optimistically update the cache
    utils.post.getById.setData({ id: postId }, (old) =>
      old ? { ...old, likeCount: old.likeCount + 1 } : old
    );

    return { previous };
  },
  onError: (err, { postId }, context) => {
    // Roll back on failure
    if (context?.previous) {
      utils.post.getById.setData({ id: postId }, context.previous);
    }
  },
  onSettled: ({ postId }) => {
    // Always refetch to sync server truth
    void utils.post.getById.invalidate({ id: postId });
  },
});
```

### 5. Prefetch data for navigation

```typescript
// Prefetch on hover for instant page transitions
function PostLink({ postId }: { postId: string }) {
  const utils = api.useUtils();

  return (
    <a
      href={`/posts/${postId}`}
      onMouseEnter={() => {
        void utils.post.getById.prefetch({ id: postId });
      }}
    >
      View Post
    </a>
  );
}
```

### 6. Infinite queries for pagination

```typescript
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
  api.post.listInfinite.useInfiniteQuery(
    { limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialCursor: undefined,
    }
  );

const allPosts = data?.pages.flatMap((page) => page.items) ?? [];
```

## Details

**End-to-end type inference.** The `AppRouter` type propagates through `createTRPCReact<AppRouter>()` to every hook. `useQuery`'s `data` type is inferred from the procedure's return type. `useMutation`'s `variables` type is inferred from `.input()`. No manual type annotations required anywhere on the client.

**`api.useUtils()` is the query client proxy.** It provides typed access to TanStack Query cache operations scoped to tRPC procedures: `utils.post.list.invalidate()`, `utils.post.list.setData()`, `utils.post.list.prefetch()`. These are type-safe wrappers over `queryClient.invalidateQueries`, `setQueryData`, etc.

**Query key structure.** tRPC generates stable query keys from the procedure path and input. `api.post.getById.useQuery({ id: '1' })` and `api.post.getById.useQuery({ id: '2' })` have distinct cache entries. `utils.post.getById.invalidate()` (no argument) invalidates all entries for `getById`. `utils.post.getById.invalidate({ id: '1' })` invalidates only the specific entry.

**`useMutation` vs `mutate` vs `mutateAsync`.** `mutate()` is fire-and-forget — errors are handled via `onError`. `mutateAsync()` returns a Promise — you can `await` it and handle errors with try/catch. Use `mutateAsync` in form submit handlers where you need to control flow after the mutation.

**Error types.** `error` from `useQuery`/`useMutation` is a `TRPCClientError<AppRouter>`. Access `error.data?.code` for the tRPC error code, `error.data?.zodError` for field-level validation errors (if your server formats them), and `error.message` for the human-readable message.

**Suspense mode.** Replace `useQuery` with `useSuspenseQuery` to use React Suspense for loading states. The component suspends while loading and renders only when data is available — `data` is always defined (never `undefined`).

## Source

https://trpc.io/docs/client/react

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
