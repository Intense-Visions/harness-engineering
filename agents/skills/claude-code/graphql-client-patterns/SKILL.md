# GraphQL Client Patterns

> Structure GraphQL client code with fragments, cache normalization, and optimistic updates for responsive UIs

## When to Use

- Building a React/Vue/Svelte app that consumes a GraphQL API
- Choosing between Apollo Client, urql, or lightweight clients
- Managing client-side cache for GraphQL data
- Implementing optimistic UI updates for mutations
- Organizing queries, mutations, and fragments across a large frontend

## Instructions

1. **Co-locate queries with the components that use them.** Define the query in the same file (or adjacent `.graphql` file) as the component that renders the data. This makes data dependencies explicit.

```typescript
const GET_USER = gql`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
      ...UserAvatar
    }
  }
  ${USER_AVATAR_FRAGMENT}
`;

function UserProfile({ userId }: { userId: string }) {
  const { data, loading, error } = useQuery(GET_USER, { variables: { id: userId } });
  if (loading) return <Skeleton />;
  if (error) return <ErrorBanner error={error} />;
  return <div>{data.user.name}</div>;
}
```

2. **Use fragments to share field selections across queries.** Fragments prevent field duplication and ensure components always receive the fields they need, regardless of which query fetches the data.

```typescript
const USER_AVATAR_FRAGMENT = gql`
  fragment UserAvatar on User {
    id
    avatarUrl
    name
  }
`;

// Reuse in any query that needs avatar data
```

3. **Configure the normalized cache with `typePolicies`.** Apollo Client's `InMemoryCache` normalizes by `__typename:id`. Customize merge behavior, pagination, and key fields in `typePolicies`.

```typescript
const cache = new InMemoryCache({
  typePolicies: {
    User: {
      keyFields: ['id'],
    },
    Query: {
      fields: {
        feed: offsetLimitPagination(),
      },
    },
  },
});
```

4. **Use optimistic responses for instant UI feedback.** When the user performs a mutation, provide an `optimisticResponse` that mirrors the expected server response. The cache updates immediately; the real response replaces it when it arrives.

```typescript
const [toggleLike] = useMutation(TOGGLE_LIKE, {
  optimisticResponse: {
    toggleLike: {
      __typename: 'Post',
      id: postId,
      isLiked: !currentlyLiked,
      likeCount: currentlyLiked ? count - 1 : count + 1,
    },
  },
});
```

5. **Choose the right cache update strategy after mutations:**
   - **Automatic:** If the mutation returns the modified object with its `id` and `__typename`, the cache updates automatically.
   - **`refetchQueries`:** Re-execute specific queries after the mutation. Simple but costs a network round-trip.
   - **`update` function:** Manually read and write the cache for complex updates (e.g., adding an item to a list).

```typescript
const [addComment] = useMutation(ADD_COMMENT, {
  update(cache, { data: { addComment } }) {
    cache.modify({
      id: cache.identify({ __typename: 'Post', id: postId }),
      fields: {
        comments(existing = []) {
          const newRef = cache.writeFragment({
            data: addComment,
            fragment: COMMENT_FIELDS,
          });
          return [...existing, newRef];
        },
      },
    });
  },
});
```

6. **Handle loading and error states consistently.** Create reusable patterns — a `<QueryResult>` wrapper component or custom hooks that standardize loading/error/empty states across the app.

7. **Use `fetchPolicy` intentionally.**
   - `cache-first` (default): Read from cache, fetch only on miss. Best for stable data.
   - `network-only`: Always fetch, update cache. Best for frequently changing data.
   - `cache-and-network`: Return cached data immediately, then update from network. Best UX for lists.
   - `no-cache`: Skip the cache entirely. Use for one-off sensitive data.

8. **Avoid over-fetching with field-level selections.** Only request the fields the component needs. The normalized cache works best when queries request predictable field sets.

## Details

**Apollo Client vs. urql vs. lightweight clients:** Apollo Client offers the richest cache and ecosystem but is the largest bundle (~40KB). urql is smaller (~15KB) with a plugin-based architecture (exchanges). For simple use cases, `graphql-request` (~5KB) provides a fetch wrapper without caching.

**Cache normalization explained:** Apollo splits query results into individual objects keyed by `__typename:id`. When a mutation returns an updated `User`, every query that references that user sees the update. This works only if every queried type has a stable `id` field.

**Fragment colocation pattern (Relay-style):** Each component declares a fragment for the data it needs. Parent components spread those fragments into their queries. This creates a clear contract: the component works if and only if its fragment is included.

**Polling vs. subscriptions:** Use `pollInterval` for data that changes infrequently (dashboard stats). Use subscriptions for real-time data (chat messages, live scores). Polling is simpler to implement and does not require WebSocket infrastructure.

**Common mistakes:**

- Missing `__typename` in optimistic responses (cache cannot normalize without it)
- Using `refetchQueries` for every mutation instead of leveraging automatic cache updates
- Requesting entire objects when only a few fields are needed (over-fetching)
- Not handling the `error` state from `useQuery` (silent failures)

## Source

https://www.apollographql.com/docs/react/

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
