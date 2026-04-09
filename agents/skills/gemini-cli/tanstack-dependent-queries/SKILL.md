# TanStack Query: Dependent Queries

> Chain queries that depend on each other's results using the enabled flag and useQueries

## When to Use

- Fetching data that depends on the result of a previous query (e.g., user ID needed before fetching user's posts)
- Running a set of queries in parallel when all inputs are known upfront
- Conditionally fetching based on component state or user interaction
- Fetching a dynamic list of resources in parallel (N queries for N items)

## Instructions

1. Use the `enabled` option to block a query from running until its prerequisite data is available.
2. Pass the prerequisite value directly into `enabled` — falsy values (`undefined`, `null`, `false`, `0`) disable the query.
3. Include the prerequisite value in the query key so the query re-runs when it changes.
4. Use `useQueries()` to run a dynamic list of queries in parallel — pass an array of query option objects.
5. Do not chain more than two or three dependent queries — deep chains indicate a data model problem or an opportunity to join data server-side.
6. Use `select` to transform query data before it becomes the input for a dependent query — keeps transformation logic in the query, not in the component.

```typescript
// Single dependent query — user's posts depend on user ID
function useUserPosts(username: string) {
  // Step 1: fetch user by username
  const userQuery = useQuery({
    queryKey: ['user', username],
    queryFn: () => fetchUser(username),
  });

  // Step 2: fetch posts only after user is loaded
  const postsQuery = useQuery({
    queryKey: ['posts', 'by-user', userQuery.data?.id],
    queryFn: () => fetchPostsByUser(userQuery.data!.id),
    enabled: !!userQuery.data?.id, // blocks until user.id is available
  });

  return {
    user: userQuery.data,
    posts: postsQuery.data,
    isLoading: userQuery.isLoading || postsQuery.isLoading,
  };
}

// Parallel queries for a dynamic list — fetch N items simultaneously
function usePostDetails(postIds: string[]) {
  return useQueries({
    queries: postIds.map((id) => ({
      queryKey: ['posts', 'detail', id],
      queryFn: () => fetchPost(id),
      staleTime: 5 * 60 * 1000,
    })),
  });
  // Returns QueryResult[] — one per ID
}

// Conditional fetch — only when a filter is active
function useFilteredPosts(filter: string | null) {
  return useQuery({
    queryKey: ['posts', 'filtered', filter],
    queryFn: () => fetchFilteredPosts(filter!),
    enabled: filter !== null && filter.length > 0,
  });
}
```

## Details

TanStack Query executes all queries concurrently by default — each `useQuery` call starts a fetch immediately when the component mounts. Dependent queries introduce explicit sequencing.

**`enabled` flag behavior:** When `enabled` is `false`, the query is in `pending` status with `fetchStatus: 'idle'` — it has no data and is not fetching. As soon as `enabled` becomes `true` (e.g., after the prerequisite query resolves), TanStack Query fetches immediately.

**Loading state propagation:** A dependent query chain means loading states are sequential — the second query cannot start until the first resolves. The combined loading time is the sum of all fetches, not the max. Evaluate whether the dependency is real (data genuinely needed) or whether a backend endpoint could join the data.

**`useQueries` for dynamic lists:** `useQueries` is the correct API for `N` dynamic queries. Calling `useQuery` in a loop violates React's rules of hooks (cannot be inside a conditional or loop). `useQueries` handles variable-length arrays of query definitions.

**`select` for derived keys:** Use `select` to transform query data before passing it to a dependent query key:

```typescript
const userId = useQuery({
  queryKey: ['auth'],
  queryFn: fetchCurrentUser,
  select: (user) => user.id, // only re-triggers when ID changes, not whole user object
});
```

The `select` function memoizes — dependents only re-render when the selected value changes.

**Avoiding waterfalls:** On the server side (Next.js Server Components), fetch data in parallel with `Promise.all` instead of sequential awaits. Client-side dependency chains are sometimes unavoidable (auth token → user data), but server-side waterfalls are always avoidable.

## Source

https://tanstack.com/query/latest/docs/framework/react/guides/dependent-queries

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
