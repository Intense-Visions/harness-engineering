# TanStack Query: Mutation Patterns

> Execute server-side mutations with useMutation, lifecycle callbacks, and retry configuration

## When to Use

- Creating, updating, or deleting data on the server from a Client Component
- Coordinating side effects (cache updates, navigation, toasts) after a mutation succeeds or fails
- Implementing retry logic for transient network failures
- Sharing mutation logic across multiple components via custom hooks

## Instructions

1. Use `useMutation` for all data mutations — do not use `useQuery` for operations that modify server state.
2. Wrap `useMutation` in a custom hook per mutation type — expose `mutate` and `isPending` to consumers.
3. Use `onSuccess` to trigger side effects after a confirmed server success: cache invalidation, navigation, success toasts.
4. Use `onError` to handle failures: error toasts, logging, form error display. Do not roll back cache here unless you implemented optimistic updates.
5. Use `onSettled` for cleanup that must happen regardless of outcome (re-enabling buttons, hiding progress).
6. Pass `variables` as the argument to `mutate()` — they are typed by the `mutationFn`'s parameter type.
7. Use `mutateAsync` instead of `mutate` when you need to `await` the result and handle errors with try/catch.
8. Set `retry: false` on mutations that should not retry (form submissions, payments) — unlike queries, mutation retry is `0` by default.

```typescript
// hooks/use-create-post.ts — mutation custom hook
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { postKeys } from '@/queries/posts';

interface CreatePostInput {
  title: string;
  content: string;
  published: boolean;
}

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePostInput) =>
      fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then(async r => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<Post>;
      }),

    onSuccess: (newPost) => {
      // Seed the detail cache — no extra fetch needed
      queryClient.setQueryData(postKeys.detail(newPost.id), newPost);
      // Invalidate lists — server determines sort order and filtering
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
      toast.success('Post created');
    },

    onError: (error) => {
      toast.error(`Failed to create post: ${error.message}`);
    },
  });
}

// components/create-post-form.tsx — consuming the mutation
export function CreatePostForm() {
  const { mutate, isPending, isError, error } = useCreatePost();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    mutate({
      title: data.get('title') as string,
      content: data.get('content') as string,
      published: data.get('published') === 'on',
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" required />
      <textarea name="content" required />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Post'}
      </button>
      {isError && <p className="text-red-500">{error.message}</p>}
    </form>
  );
}
```

## Details

`useMutation` is TanStack Query's API for server-side mutations. Unlike `useQuery`, it does not run automatically on mount — it runs when `mutate()` or `mutateAsync()` is called.

**`mutate` vs `mutateAsync`:** `mutate` is fire-and-forget — errors are handled in `onError`, not thrown. `mutateAsync` returns a Promise that rejects on error, enabling `async/await` with try/catch. Use `mutateAsync` when you need sequential async operations after the mutation (e.g., navigate then show toast in a specific order).

**Lifecycle callback order:** For a successful mutation: `onMutate` → (request) → `onSuccess` → `onSettled`. For a failed mutation: `onMutate` → (request) → `onError` → `onSettled`. Callbacks at the `useMutation` definition level fire first; callbacks at the `mutate()` call site fire after.

**Variables type inference:** TypeScript infers the type of `variables` from the `mutationFn` parameter. The `variables` object is available in all lifecycle callbacks — use it to know which item was mutated in `onSuccess` when invalidating specific keys.

**Global mutation callbacks:** Register `onSuccess`, `onError`, and `onSettled` on the `MutationCache` in `QueryClient` options for cross-cutting concerns (global error logging, analytics).

**`isPending` vs `isLoading`:** In TanStack Query v5, `isLoading` was renamed to `isPending` for mutations (and means the mutation is currently executing). Use `isPending` to disable submit buttons.

## Source

https://tanstack.com/query/latest/docs/framework/react/guides/mutations
