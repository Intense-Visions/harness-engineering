# GraphQL Schema Design

> Design expressive, evolvable GraphQL schemas with clear type hierarchies and strong nullability contracts

## When to Use

- Designing a new GraphQL API from scratch
- Adding types, queries, or mutations to an existing schema
- Deciding between interfaces, unions, and concrete types
- Establishing nullability conventions for a team
- Planning schema evolution without breaking existing clients

## Instructions

1. **Start with the domain, not the UI.** Model your schema around business entities (Order, Product, User), not around specific screens or components. A well-modeled domain schema serves multiple clients without per-client hacks.

2. **Use non-null by default.** Mark fields as `String!` (non-null) unless the field genuinely can be absent. Non-null fields simplify client code by eliminating null checks. Reserve nullable fields for truly optional data (e.g., `middleName: String`).

3. **Prefer specific types over generic ones.** Use custom scalars (`DateTime`, `URL`, `EmailAddress`) instead of plain `String` for fields with validation semantics. Use enums for closed sets of values.

```graphql
scalar DateTime
scalar URL

enum OrderStatus {
  PENDING
  CONFIRMED
  SHIPPED
  DELIVERED
  CANCELLED
}

type Order {
  id: ID!
  status: OrderStatus!
  createdAt: DateTime!
  trackingUrl: URL
}
```

4. **Use interfaces for shared field contracts.** When multiple types share fields and clients query them polymorphically, define an interface. Use unions when types share no fields but appear in the same list.

```graphql
interface Node {
  id: ID!
}

interface Timestamped {
  createdAt: DateTime!
  updatedAt: DateTime!
}

type User implements Node & Timestamped {
  id: ID!
  createdAt: DateTime!
  updatedAt: DateTime!
  name: String!
}

union SearchResult = User | Product | Order
```

5. **Design mutations around actions, not CRUD.** Name mutations after the business action: `cancelOrder`, `approveRefund`, `inviteTeamMember` — not `updateOrder(status: CANCELLED)`. Each mutation should have a dedicated input type and a dedicated payload type.

```graphql
input CancelOrderInput {
  orderId: ID!
  reason: String!
}

type CancelOrderPayload {
  order: Order!
  refundAmount: Money
  errors: [UserError!]!
}

type Mutation {
  cancelOrder(input: CancelOrderInput!): CancelOrderPayload!
}
```

6. **Always include a `UserError` type in mutation payloads.** This separates expected domain errors (validation failures, business rule violations) from unexpected system errors (which use GraphQL's top-level `errors` array).

```graphql
type UserError {
  field: [String!]
  message: String!
  code: ErrorCode!
}
```

7. **Use the Relay connection spec for paginated lists.** Even if you do not use Relay on the client, the `Connection/Edge/PageInfo` pattern is well-understood, cursor-based, and forward-compatible.

8. **Version through evolution, not URL paths.** Add new fields freely. Deprecate old fields with `@deprecated(reason: "Use newField instead")`. Never remove fields without a deprecation period and client migration.

9. **Keep the schema file as the source of truth.** Whether you use schema-first or code-first, ensure there is one canonical `.graphql` file (or set of files) that documents every type. Generate code from the schema, not the other way around.

10. **Document with descriptions.** Add descriptions above types and fields — they appear in GraphiQL/Apollo Studio and serve as living API docs.

```graphql
"""
A customer order containing one or more line items.
"""
type Order {
  """
  Unique identifier for the order.
  """
  id: ID!
}
```

## Details

**Naming conventions:** Types are `PascalCase`, fields are `camelCase`, enums are `SCREAMING_SNAKE_CASE`. Input types end with `Input`, payload types end with `Payload`.

**Nullability trade-offs:** Non-null fields are safer for clients but less forgiving for servers — if a non-null resolver throws, the error bubbles up to the nearest nullable parent, potentially nullifying an entire object. Place nullable "firewalls" at strategic points (e.g., nullable list items) to limit blast radius.

**Schema stitching vs. federation:** For monolithic APIs, a single schema file works. For microservices, prefer Apollo Federation where each service owns its slice of the graph and extends shared types with `@key`.

**Anti-patterns to avoid:**

- Generic `update` mutations with a giant optional input type — they are unvalidatable and untraceable
- Deeply nested types without pagination — they cause unbounded query cost
- Using `JSON` scalar as a catch-all — it defeats the purpose of a typed schema
- Mixing authentication concerns into the schema (use directives or middleware instead)

## Source

https://graphql.org/learn/schema/

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** graphql-resolver-pattern, graphql-pagination-patterns, graphql-federation-pattern, api-resource-modeling, api-field-selection

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
