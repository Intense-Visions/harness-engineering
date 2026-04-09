# GraphQL Federation Pattern

> Compose a unified GraphQL API from independently deployed subgraph services using Apollo Federation

## When to Use

- Multiple teams own different domains and need independent deployment
- A monolithic GraphQL schema has grown too large for one service
- You need to extend types across service boundaries (e.g., adding `orders` to `User` from the orders service)
- Migrating from schema stitching to a standards-based composition model

## Instructions

1. **Each subgraph owns its domain types.** The users service defines `User`, the orders service defines `Order`. No type is defined in two places — types are extended across boundaries.

```graphql
# users subgraph
type User @key(fields: "id") {
  id: ID!
  name: String!
  email: String!
}

type Query {
  user(id: ID!): User
}
```

2. **Use `@key` to mark entity types.** An entity is a type that can be referenced and extended by other subgraphs. The `@key` directive specifies which fields uniquely identify the entity.

3. **Extend entities in other subgraphs with stub types.** The orders service references `User` without redefining it — it provides only the key field and adds new fields.

```graphql
# orders subgraph
type User @key(fields: "id") {
  id: ID!
  orders: [Order!]!
}

type Order @key(fields: "id") {
  id: ID!
  total: Money!
  status: OrderStatus!
  customer: User!
}
```

4. **Implement `__resolveReference` for each entity.** This resolver is called by the gateway when it needs to hydrate a stub entity. It receives the key fields and returns the full object.

```typescript
const resolvers = {
  User: {
    __resolveReference: (ref: { id: string }, { dataSources }) => {
      return dataSources.users.findById(ref.id);
    },
  },
};
```

5. **Use the Apollo Router (or Gateway) to compose subgraphs.** The router fetches schemas from each subgraph, composes them into a supergraph, and routes incoming queries to the appropriate subgraphs.

```yaml
# supergraph-config.yaml
subgraphs:
  users:
    routing_url: http://users-service:4001/graphql
    schema:
      subgraph_url: http://users-service:4001/graphql
  orders:
    routing_url: http://orders-service:4002/graphql
    schema:
      subgraph_url: http://orders-service:4002/graphql
```

6. **Use `@shareable` for fields that multiple subgraphs can resolve.** In Federation v2, fields are exclusive by default. Mark fields `@shareable` when multiple subgraphs need to return the same field.

7. **Use `@override` to migrate fields between subgraphs.** When moving a field from one subgraph to another, the new owner uses `@override(from: "old-subgraph")` to claim resolution without a breaking change.

8. **Use `@external`, `@provides`, and `@requires` for computed fields.** `@requires` tells the gateway to fetch specified fields from the owning subgraph before calling the current resolver.

```graphql
# shipping subgraph
type Order @key(fields: "id") {
  id: ID!
  weight: Float @external
  shippingCost: Float @requires(fields: "weight")
}
```

9. **Run composition checks in CI.** Use `rover subgraph check` to validate that schema changes in one subgraph do not break the composed supergraph before deploying.

10. **Keep the gateway stateless.** The router/gateway should not contain business logic — it composes and routes. All business logic lives in subgraphs.

## Details

**Federation v1 vs. v2:** Federation v2 (current) uses `@link` to import federation directives, supports `@shareable`, `@override`, `@inaccessible`, and progressive `@override` for safe migrations. Prefer v2 for new projects.

**Query planning:** The gateway decomposes incoming queries into subgraph fetches. A query for `user { name orders { total } }` fetches `name` from the users subgraph, then fetches `orders` from the orders subgraph using the user's `id` as the reference key. This happens transparently.

**Performance considerations:**

- Entity references add network hops — the gateway calls `__resolveReference` on the owning subgraph
- Use `@provides` to return extra fields alongside entities to reduce follow-up fetches
- Batch entity lookups in `__resolveReference` using DataLoader

**Ownership rules:**

- A type's `@key` fields must be resolvable by the defining subgraph
- Only one subgraph should define a field (unless `@shareable`)
- Value types (types without `@key`) must be identical across subgraphs

**Common mistakes:**

- Circular entity references that cause infinite gateway loops
- Missing `__resolveReference` — the gateway cannot hydrate the entity
- Changing `@key` fields without updating all referencing subgraphs
- Putting too many types in one subgraph, recreating the monolith

## Source

https://www.apollographql.com/docs/federation/

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
