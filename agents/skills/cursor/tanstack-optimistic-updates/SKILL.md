# TanStack Query: Optimistic Updates

> Update the UI immediately on mutation and roll back automatically if the server request fails

## When to Use

- Building UIs where server latency would make interactions feel sluggish (toggle, like, reorder)
- Implementing instant feedback for mutations like checkbox toggles, list reordering, or quantity adjustments
- Ensuring UI consistency when a mutation must succeed (e.g., adding to a local-only list)
- Rolling back UI changes when a network request fails rather than leaving the UI in an inconsistent state

## Instructions

1. Use the `onMutate` callback to snapshot the current cache value and apply the optimistic update before the request fires.
2. Cancel any in-flight queries for the affected key in `onMutate` with `queryClient.cancelQueries()` to prevent race conditions.
3. Return the snapshot from `onMutate` — TanStack Query passes it to `onError` as `context`.
4. In `onError`, use the `context` (the snapshot) to restore the cache to its pre-mutation state with `queryClient.setQueryData()`.
5. In `onSettled`, call `queryClient.invalidateQueries()` to sync the cache with the actual server state regardless of success or failure.
6. Use `queryClient.setQueryData()` with an updater function (not a value) to apply the optimistic change atomically.

```typescript
// mutations/toggle-todo.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { todoKeys } from '@/queries/todos';

interface Todo {
  id: string;
  completed: boolean;
  title: string;
}

export function useToggleTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      }).then((r) => r.json()),

    onMutate: async ({ id, completed }) => {
      // 1. Cancel in-flight refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: todoKeys.lists() });

      // 2. Snapshot the current value
      const previousTodos = queryClient.getQueryData<Todo[]>(todoKeys.list({}));

      // 3. Apply optimistic update
      queryClient.setQueryData<Todo[]>(
        todoKeys.list({}),
        (old) => old?.map((todo) => (todo.id === id ? { ...todo, completed } : todo)) ?? []
      );

      // 4. Return snapshot as context for rollback
      return { previousTodos };
    },

    onError: (_error, _variables, context) => {
      // Roll back to snapshot
      if (context?.previousTodos) {
        queryClient.setQueryData(todoKeys.list({}), context.previousTodos);
      }
    },

    onSettled: () => {
      // Sync with server regardless of success/failure
      queryClient.invalidateQueries({ queryKey: todoKeys.lists() });
    },
  });
}
```

## Details

Optimistic updates are a UX pattern where the UI assumes a mutation will succeed and updates immediately, then corrects itself if the server disagrees. The key implementation detail is maintaining the ability to roll back.

**Race condition prevention:** Without `cancelQueries`, an in-flight background refetch could overwrite your optimistic update with stale server data while the mutation is in-flight. Cancelling in-flight queries for the affected key prevents this.

**`onMutate` return value:** Whatever `onMutate` returns becomes the `context` parameter in `onError` and `onSettled`. This is the standard channel for passing the snapshot to the rollback handler.

**`onSettled` for final sync:** Always call `invalidateQueries` in `onSettled` (not just `onSuccess`). Even on success, the server may have applied additional business logic that the optimistic update did not account for. `onSettled` fires on both success and error, ensuring the cache always reflects reality after the operation completes.

**Updater functions:** `queryClient.setQueryData(key, updater)` where `updater` is a function receives the current cached value and returns the new value. This is atomic — use it instead of reading and writing separately to avoid stale closure issues.

**When NOT to use:** For mutations where the user should wait for server confirmation before seeing UI changes (payments, irreversible actions), use pessimistic updates instead — update the cache only in `onSuccess` after the server confirms.

## Source

https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates

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
