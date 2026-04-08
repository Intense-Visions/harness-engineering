# GraphQL Pagination Patterns

> Implement cursor-based and offset pagination in GraphQL using the Relay connection specification

## When to Use

- Returning lists of items that may grow unboundedly
- Building paginated feeds, search results, or admin tables
- Choosing between cursor-based and offset-based pagination
- Implementing infinite scroll or "load more" UI patterns
- Ensuring consistent pagination when items are added or removed

## Instructions

1. **Use the Relay connection spec for cursor-based pagination.** Even if you do not use Relay on the client, the `Connection/Edge/PageInfo` pattern is the industry standard for GraphQL pagination.

```graphql
type Query {
  users(first: Int, after: String, last: Int, before: String): UserConnection!
}

type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int
}

type UserEdge {
  node: User!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

2. **Implement cursor encoding with opaque strings.** Cursors should be opaque to clients — base64-encode the underlying value. Never expose raw database IDs or offsets as cursors.

```typescript
function encodeCursor(id: string): string {
  return Buffer.from(`cursor:${id}`).toString('base64');
}

function decodeCursor(cursor: string): string {
  const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
  return decoded.replace('cursor:', '');
}
```

3. **Build the resolver to handle `first/after` (forward) and `last/before` (backward) pagination.**

```typescript
const resolvers = {
  Query: {
    users: async (_parent, { first, after, last, before }, { db }) => {
      const limit = first ?? last ?? 20;
      const afterId = after ? decodeCursor(after) : null;
      const beforeId = before ? decodeCursor(before) : null;

      const users = await db.users.findPaginated({
        limit: limit + 1, // fetch one extra to determine hasNextPage
        afterId,
        beforeId,
        direction: last ? 'backward' : 'forward',
      });

      const hasMore = users.length > limit;
      const nodes = hasMore ? users.slice(0, limit) : users;

      if (last) nodes.reverse();

      return {
        edges: nodes.map((user) => ({
          node: user,
          cursor: encodeCursor(user.id),
        })),
        pageInfo: {
          hasNextPage: first ? hasMore : false,
          hasPreviousPage: last ? hasMore : false,
          startCursor: nodes[0] ? encodeCursor(nodes[0].id) : null,
          endCursor: nodes[nodes.length - 1] ? encodeCursor(nodes[nodes.length - 1].id) : null,
        },
      };
    },
  },
};
```

4. **Include `totalCount` when clients need it** (e.g., for "showing 1-20 of 342"). Be aware this requires a separate `COUNT(*)` query, which can be expensive on large tables.

5. **For simple use cases, offset pagination is acceptable.** Use it for admin dashboards, data tables, or any context where "jump to page N" is needed and data does not change frequently.

```graphql
type Query {
  users(offset: Int, limit: Int): UserList!
}

type UserList {
  items: [User!]!
  totalCount: Int!
  hasMore: Boolean!
}
```

6. **On the client, use `fetchMore` to load additional pages.**

```typescript
const { data, fetchMore } = useQuery(GET_USERS, { variables: { first: 20 } });

const loadMore = () => {
  fetchMore({
    variables: { after: data.users.pageInfo.endCursor },
    updateQuery: (prev, { fetchMoreResult }) => ({
      users: {
        ...fetchMoreResult.users,
        edges: [...prev.users.edges, ...fetchMoreResult.users.edges],
      },
    }),
  });
};
```

7. **Set sensible defaults and maximums for `first`/`limit`.** Default to 20, cap at 100. This prevents clients from requesting unbounded result sets.

```typescript
const limit = Math.min(first ?? 20, 100);
```

8. **Use `@connection` directive (Apollo Client) to give paginated fields a stable cache key** when the same field is queried with different pagination arguments.

## Details

**Cursor vs. offset trade-offs:**

- **Cursor-based:** Stable under concurrent inserts/deletes, efficient with indexed columns (e.g., `WHERE id > cursor`), no "page drift." Cannot jump to arbitrary pages.
- **Offset-based:** Simple to implement, supports "jump to page N." Degrades with large offsets (`OFFSET 10000` scans and discards rows), unstable when items are inserted/deleted between pages.

**Cursor implementation strategies:**

- **ID-based:** `WHERE id > :cursor ORDER BY id` — simple, efficient, works when ordering by primary key
- **Timestamp-based:** `WHERE created_at > :cursor ORDER BY created_at` — use a composite cursor (timestamp + id) for ties
- **Composite:** Encode multiple sort values into the cursor for multi-column sorting

**Performance considerations:**

- Fetch `limit + 1` to determine `hasNextPage` without a separate count query
- Use indexed columns for cursor comparison (`WHERE` clause must hit an index)
- Cache `totalCount` separately if it is expensive and does not need to be real-time
- For keyset pagination on composite sorts, build the `WHERE` clause dynamically

**Apollo Client cache integration:** Apollo's `offsetLimitPagination()` and `relayStylePagination()` type policies handle merging paginated results in the cache automatically.

## Source

https://relay.dev/graphql/connections.htm
