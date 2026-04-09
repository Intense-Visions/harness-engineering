# GraphQL Performance Patterns

> Optimize GraphQL API performance with query complexity analysis, caching, persisted queries, and DataLoader

## When to Use

- GraphQL API response times are degrading under load
- Protecting the API from expensive or abusive queries
- Implementing server-side or CDN-level caching for GraphQL
- Reducing payload sizes and network round-trips
- Diagnosing and fixing N+1 query problems

## Instructions

1. **Use DataLoader to batch and deduplicate database queries.** This is the single most impactful optimization for most GraphQL APIs. See the `graphql-dataloader-pattern` skill for detailed implementation.

2. **Limit query depth to prevent deeply nested abuse.** Use `graphql-depth-limit` to reject queries that exceed a reasonable nesting level.

```typescript
import depthLimit from 'graphql-depth-limit';

const server = new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [depthLimit(10)],
});
```

3. **Implement query complexity analysis.** Assign costs to fields and reject queries that exceed a budget. List fields should cost more because they multiply nested resolver costs.

```graphql
type Query {
  users(first: Int): UserConnection @complexity(value: 1, multipliers: ["first"])
}

type User {
  posts: [Post!]! @complexity(value: 2)
}
```

```typescript
import { createComplexityLimitRule } from 'graphql-validation-complexity';

const server = new ApolloServer({
  validationRules: [
    createComplexityLimitRule(1000, {
      scalarCost: 1,
      objectCost: 2,
      listFactor: 10,
    }),
  ],
});
```

4. **Use `@cacheControl` directives for response caching.** Mark types and fields with their cache-ability and max age. The Apollo cache control plugin aggregates these into HTTP cache headers.

```graphql
type Product @cacheControl(maxAge: 3600) {
  id: ID!
  name: String!
  price: Money! @cacheControl(maxAge: 60)
  reviews: [Review!]! @cacheControl(maxAge: 0)
}
```

5. **Enable Automatic Persisted Queries (APQ)** to reduce request payload sizes. Instead of sending the full query string, clients send a hash. The server looks up the query by hash; on a miss, the client resends the full query and the server caches it.

```typescript
import { ApolloServerPluginCacheControl } from '@apollo/server/plugin/cacheControl';
import { KeyValueCache } from '@apollo/utils.keyvaluecache';

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [ApolloServerPluginCacheControl({ defaultMaxAge: 5 })],
  cache: new KeyvAdapter(new Keyv('redis://localhost:6379')),
});
```

6. **Implement response caching at the CDN or reverse proxy level.** When queries have `@cacheControl` hints, set `Cache-Control` headers so Cloudflare, Fastly, or Varnish can cache responses without hitting your server.

7. **Use `@defer` for progressive loading (if supported).** `@defer` allows the server to return parts of the response incrementally, sending critical data first and deferring expensive fields.

```graphql
query ProductPage($id: ID!) {
  product(id: $id) {
    name
    price
    ... @defer {
      reviews {
        content
        rating
      }
      recommendations {
        name
      }
    }
  }
}
```

8. **Avoid over-fetching at the resolver level.** Use the `info` argument or look-ahead libraries to fetch only the fields the client requested from the database.

```typescript
import { parseResolveInfo } from 'graphql-parse-resolve-info';

const resolvers = {
  Query: {
    user: (_parent, { id }, _context, info) => {
      const fields = parseResolveInfo(info);
      const select = Object.keys(fields.fieldsByTypeName.User);
      return db.users.findById(id, { select });
    },
  },
};
```

9. **Monitor query performance in production.** Use Apollo Studio, Grafana, or custom logging to track per-operation latency, error rates, and cache hit ratios. Identify the slowest operations and optimize them specifically.

10. **Set a timeout on resolver execution.** Prevent runaway resolvers from holding connections open indefinitely.

```typescript
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Resolver timeout')), ms)
  );
  return Promise.race([promise, timeout]);
};
```

## Details

**N+1 problem explained:** A query for 50 users, each with `posts`, executes 1 query for users + 50 queries for posts = 51 queries. DataLoader reduces this to 2 queries (1 for users, 1 batched for all posts).

**Caching layers (from hot to cold):**

1. **DataLoader** — per-request memoization (eliminates duplicate fetches within a single query)
2. **Application cache** — Redis/Memcached (shared across requests, minutes-to-hours TTL)
3. **HTTP cache** — CDN/reverse proxy (shared across users for public data, seconds-to-hours TTL)
4. **Client cache** — Apollo Client InMemoryCache (per-user, session-duration)

**Query allowlisting (persisted queries):** In high-security environments, only allow pre-registered queries. Reject any query not in the allowlist. This prevents attackers from crafting expensive or introspection queries.

**Pagination impact:** Always paginate list fields. An unpaginated `users: [User!]!` that returns 100K records will crush your server regardless of other optimizations.

**Tracing:** Enable Apollo Tracing or OpenTelemetry to see per-resolver execution times. The slowest resolver in a query determines the response time (for sequential resolution) or indicates the bottleneck (for parallel resolution).

## Source

https://www.apollographql.com/docs/apollo-server/performance/caching/

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
