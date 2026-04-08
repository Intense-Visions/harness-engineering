# GraphQL DataLoader Pattern

> Batch and cache data fetches to eliminate N+1 queries in GraphQL resolvers

## When to Use

- Field resolvers execute per item in a list, causing N+1 database queries
- Multiple resolvers in the same request need the same record
- You need request-scoped caching without a shared application cache
- Optimizing GraphQL API response times without restructuring the schema

## Instructions

1. **Create one DataLoader instance per request, per resource type.** DataLoader batches all `.load(key)` calls within a single tick of the event loop into one batch function call. It must be request-scoped to avoid leaking cached data between users.

```typescript
import DataLoader from 'dataloader';

function createLoaders(db: Database) {
  return {
    userById: new DataLoader<string, User>(async (ids) => {
      const users = await db.users.findByIds([...ids]);
      const userMap = new Map(users.map((u) => [u.id, u]));
      return ids.map((id) => userMap.get(id) || new Error(`User ${id} not found`));
    }),
  };
}
```

2. **The batch function must return results in the same order as the input keys.** This is the critical contract. If key index 0 is `"abc"`, result index 0 must be the value for `"abc"` or an `Error`. Use a Map to reorder database results to match the input key order.

3. **Attach loaders to the GraphQL context.** Create fresh loaders for each request in your server's context factory.

```typescript
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => ({
    currentUser: authenticate(req),
    loaders: createLoaders(db),
  }),
});
```

4. **Use `.load()` in field resolvers instead of direct database calls.**

```typescript
const resolvers = {
  Order: {
    customer: (order, _args, { loaders }) => {
      return loaders.userById.load(order.customerId);
    },
  },
  Comment: {
    author: (comment, _args, { loaders }) => {
      return loaders.userById.load(comment.authorId);
    },
  },
};
```

When a query returns 50 orders, the `customer` field resolver calls `.load()` 50 times, but DataLoader batches them into a single `findByIds([...50 ids])` call.

5. **Use `.loadMany()` for one-to-many relationships** where you have an array of keys.

```typescript
const resolvers = {
  User: {
    favoriteProducts: (user, _args, { loaders }) => {
      return loaders.productById.loadMany(user.favoriteProductIds);
    },
  },
};
```

6. **Create loaders for different access patterns.** A `userById` loader and a `userByEmail` loader are separate DataLoader instances with separate batch functions and separate caches.

7. **Use `.prime()` to warm the cache** when you already have the data. After a mutation creates a user, prime the loader so subsequent reads in the same request hit the cache.

```typescript
const newUser = await db.users.create(input);
context.loaders.userById.prime(newUser.id, newUser);
```

8. **Disable caching for loaders where stale reads are dangerous.** Pass `{ cache: false }` to the DataLoader constructor if you need batching without memoization — rare, but useful for data that changes mid-request.

## Details

**How batching works:** DataLoader collects all `.load()` calls made synchronously (within the same microtask/tick). At the end of the tick, it calls the batch function once with all collected keys, then distributes results back to each caller. This turns N sequential queries into 1 batched query.

**Per-request scope is mandatory.** If you reuse a DataLoader across requests, User A's data will be served from cache to User B. Always create new DataLoader instances in the context factory.

**Batch function constraints:**

- Must accept an array of keys and return a Promise of an array of values
- Return array length must equal input keys length
- Return array order must match input keys order
- Individual errors are represented as `Error` instances at the corresponding index

**Nested batching:** DataLoader batches within a single tick, but GraphQL resolves level by level. This means field resolvers at depth 2 are batched separately from depth 3. This is usually fine — each level gets one batch call per loader.

**Composite keys:** When the lookup requires multiple values (e.g., `orgId` + `userId`), serialize the key to a string and provide a `cacheKeyFn`:

```typescript
new DataLoader<{ orgId: string; userId: string }, Membership>(
  async (keys) => {
    /* batch by org+user */
  },
  { cacheKeyFn: (key) => `${key.orgId}:${key.userId}` }
);
```

**Common mistakes:**

- Creating DataLoader outside request scope (data leaks between users)
- Returning results in database order instead of input key order (mismatched results)
- Using DataLoader for write operations (it is a read optimization)
- Not handling missing records (returning `undefined` instead of `Error` breaks the contract)

## Source

https://github.com/graphql/dataloader
