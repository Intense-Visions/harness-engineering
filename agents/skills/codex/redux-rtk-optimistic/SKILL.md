# RTK Query Optimistic Updates

> Apply optimistic and pessimistic cache updates with onQueryStarted for instant UI feedback with automatic rollback

## When to Use

- Toggling a like/favorite and wanting instant UI response
- Reordering items in a list via drag-and-drop
- Editing inline fields where waiting for the server feels sluggish
- Any mutation where the expected server response is predictable

## Instructions

1. Use `onQueryStarted` in the mutation endpoint to perform cache updates before or after the server responds.
2. For **optimistic updates**: call `dispatch(api.util.updateQueryData(...))` immediately inside `onQueryStarted`, before awaiting the result. Save the return value — it contains an `undo` function.
3. Wrap the `await queryFulfilled` in try/catch. On failure, call `patchResult.undo()` to revert the optimistic change.
4. For **pessimistic updates**: `await queryFulfilled` first, then update the cache with the server's response.
5. Always match the exact cache key arguments when calling `updateQueryData` — a mismatch silently does nothing.
6. Prefer optimistic updates for idempotent operations (toggles, edits). Prefer pessimistic updates when the server assigns critical data (IDs, computed fields).

```typescript
// Optimistic update — toggle a todo's completed status
toggleTodo: builder.mutation<Todo, { id: string; completed: boolean }>({
  query: ({ id, completed }) => ({
    url: `/todos/${id}`,
    method: 'PATCH',
    body: { completed },
  }),
  async onQueryStarted({ id, completed }, { dispatch, queryFulfilled }) {
    // Optimistically update the cache immediately
    const patchResult = dispatch(
      api.util.updateQueryData('getTodos', undefined, (draft) => {
        const todo = draft.find((t) => t.id === id);
        if (todo) todo.completed = completed;
      })
    );
    try {
      await queryFulfilled;
    } catch {
      // Revert on failure
      patchResult.undo();
    }
  },
}),
```

```typescript
// Pessimistic update — server assigns the ID
createTodo: builder.mutation<Todo, { title: string }>({
  query: (body) => ({ url: '/todos', method: 'POST', body }),
  async onQueryStarted(_, { dispatch, queryFulfilled }) {
    try {
      const { data: newTodo } = await queryFulfilled;
      // Update cache with server response
      dispatch(
        api.util.updateQueryData('getTodos', undefined, (draft) => {
          draft.push(newTodo);
        })
      );
    } catch {
      // No cache to revert — the mutation failed before we touched it
    }
  },
}),
```

## Details

**updateQueryData arguments:** `updateQueryData(endpointName, queryArg, updateFn)`. The `queryArg` must exactly match what was passed to the query hook. If the query was called with `useGetTodosQuery(undefined)`, pass `undefined`. If called with `useGetTodosQuery({ filter: 'active' })`, pass `{ filter: 'active' }`.

**Combining with invalidation:** You can use optimistic updates AND `invalidatesTags` together. The optimistic update gives instant feedback, and the invalidation ensures the cache is eventually consistent with the server.

**Multiple cache entries:** If the same data appears in multiple queries (a list query and a detail query), update both:

```typescript
async onQueryStarted({ id, title }, { dispatch, queryFulfilled }) {
  const patchList = dispatch(api.util.updateQueryData('getPosts', undefined, (draft) => {
    const post = draft.find((p) => p.id === id);
    if (post) post.title = title;
  }));
  const patchDetail = dispatch(api.util.updateQueryData('getPost', id, (draft) => {
    draft.title = title;
  }));
  try {
    await queryFulfilled;
  } catch {
    patchList.undo();
    patchDetail.undo();
  }
},
```

**Anti-patterns:**

- Forgetting to `undo()` on failure — leaves the UI in a stale state
- Mismatched query args — the update silently does nothing
- Optimistic updates for operations with unpredictable server behavior (payments, inventory)

## Source

https://redux-toolkit.js.org/rtk-query/usage/manual-cache-updates

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
