# GraphQL Resolver Pattern

> Implement resolvers with clean separation between data fetching, business logic, and response shaping

## When to Use

- Writing resolvers for queries, mutations, or subscriptions
- Structuring resolver files across a growing schema
- Deciding where to place business logic vs. data access
- Debugging N+1 queries or resolver chain issues
- Setting up the resolver context object

## Instructions

1. **Understand the resolver signature.** Every resolver receives four arguments: `(parent, args, context, info)`. Use them intentionally — `parent` carries the result from the parent resolver, `args` contains the field arguments, `context` is the per-request shared state, `info` holds the AST and field metadata.

```typescript
const resolvers = {
  Query: {
    user: (_parent: unknown, args: { id: string }, context: Context) => {
      return context.dataSources.users.findById(args.id);
    },
  },
};
```

2. **Keep resolvers thin.** A resolver should validate input, delegate to a service or data source, and return the result. It should not contain business logic, raw SQL, or HTTP calls directly.

```typescript
// Good — resolver delegates to service
const resolvers = {
  Mutation: {
    cancelOrder: async (_parent, { input }, { dataSources, currentUser }) => {
      const result = await dataSources.orders.cancel(input.orderId, input.reason, currentUser);
      return {
        order: result.order,
        refundAmount: result.refund,
        errors: result.errors,
      };
    },
  },
};

// Bad — business logic in resolver
const resolvers = {
  Mutation: {
    cancelOrder: async (_parent, { input }, { db }) => {
      const order = await db.query('SELECT * FROM orders WHERE id = $1', [input.orderId]);
      if (order.status === 'SHIPPED') throw new Error('Cannot cancel shipped order');
      // ... 50 lines of business logic
    },
  },
};
```

3. **Use field resolvers for derived data.** When a field on a type needs computation or a separate data fetch, write a field resolver on the type instead of pre-loading everything in the parent query resolver.

```typescript
const resolvers = {
  User: {
    fullName: (user) => `${user.firstName} ${user.lastName}`,
    orders: (user, _args, { dataSources }) => {
      return dataSources.orders.findByUserId(user.id);
    },
  },
};
```

4. **Build a rich context object.** Initialize `context` in your server setup with authenticated user, data sources, and request-scoped services. Avoid putting the raw `req`/`res` objects in context — wrap what you need.

```typescript
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req }) => ({
    currentUser: await authenticateToken(req.headers.authorization),
    dataSources: {
      users: new UserDataSource(db),
      orders: new OrderDataSource(db),
    },
    logger: createRequestLogger(req),
  }),
});
```

5. **Organize resolvers by domain.** Split resolvers into files matching your domain areas — `user.resolvers.ts`, `order.resolvers.ts` — then merge them using `lodash.merge` or a resolver merging utility.

6. **Return promises, not awaited values, when possible.** GraphQL execution handles promises natively. Returning the promise directly (without `await`) allows the executor to parallelize sibling field resolution.

7. **Use the `info` argument sparingly.** It provides the full query AST, useful for advanced optimizations (look-ahead to avoid over-fetching), but parsing it adds complexity. Prefer DataLoader for batching over manual `info` inspection.

8. **Handle null propagation deliberately.** If a field resolver throws or returns `null` for a non-null field, the error bubbles up. Consider wrapping risky resolvers in try-catch and returning `null` (for nullable fields) or structured errors (for mutation payloads).

## Details

**Resolver chain execution:** GraphQL resolves fields top-down, breadth-first within each level. The return value of a parent resolver becomes the `parent` argument of its child field resolvers. If a Query resolver returns `{ id: '1', name: 'Alice' }`, the `User.name` field resolver receives that object as `parent`.

**Default resolver:** If no resolver is defined for a field, GraphQL uses the default resolver: `parent[fieldName]`. This means you only need explicit resolvers for fields that require computation, transformation, or separate data fetching.

**Data source pattern (Apollo):** Encapsulate data access in classes that extend `DataSource`. Each data source gets access to the request context and can implement caching, batching, and error handling independently.

**Testing resolvers:** Test resolvers by calling them directly with mocked `context` and `args`. Test the full GraphQL execution path separately with integration tests using `executeOperation` or `server.executeOperation`.

**Common pitfalls:**

- Forgetting that field resolvers run per-item in a list (causes N+1 without DataLoader)
- Mutating the `parent` object in a field resolver (shared reference across sibling fields)
- Throwing raw errors instead of returning structured `UserError` types in mutations
- Over-fetching in parent resolvers to avoid field resolvers (defeats lazy resolution)

## Source

https://graphql.org/learn/execution/

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
