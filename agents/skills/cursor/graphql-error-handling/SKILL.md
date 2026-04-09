# GraphQL Error Handling

> Handle errors in GraphQL APIs with structured error types, result unions, and server-side error formatting

## When to Use

- Designing error responses for a GraphQL API
- Choosing between top-level errors and typed error payloads
- Implementing validation errors for mutations
- Sanitizing error details before sending to clients
- Building error handling patterns that work across client and server

## Instructions

1. **Distinguish between two error categories.** GraphQL has two channels for errors — treat them differently:
   - **Top-level `errors` array:** For unexpected system errors (database down, null in non-null field, resolver throws). These are infrastructure problems the client cannot fix.
   - **Typed error fields in payloads:** For expected domain errors (validation failures, business rule violations, not found). These are user-actionable.

2. **Use a `UserError` type in mutation payloads.** This is the standard pattern for returning actionable errors alongside successful results.

```graphql
type UserError {
  field: [String!]
  message: String!
  code: ErrorCode!
}

enum ErrorCode {
  VALIDATION_FAILED
  NOT_FOUND
  FORBIDDEN
  CONFLICT
  RATE_LIMITED
}

type CreateOrderPayload {
  order: Order
  errors: [UserError!]!
}
```

3. **Use union result types for operations with distinct error states.** When different error types carry different data, model them as a union.

```graphql
union CreateOrderResult = CreateOrderSuccess | ValidationError | InsufficientStockError

type CreateOrderSuccess {
  order: Order!
}

type ValidationError {
  field: String!
  message: String!
}

type InsufficientStockError {
  productId: ID!
  available: Int!
  requested: Int!
}
```

Clients use `__typename` to discriminate:

```typescript
const { data } = useMutation(CREATE_ORDER);
if (data.createOrder.__typename === 'CreateOrderSuccess') {
  // handle success
} else if (data.createOrder.__typename === 'InsufficientStockError') {
  // show "Only X available"
}
```

4. **Throw `GraphQLError` with extensions for system errors.** When something genuinely fails, throw a `GraphQLError` with a code in `extensions` to help clients categorize the error.

```typescript
import { GraphQLError } from 'graphql';

throw new GraphQLError('Not authorized to view this resource', {
  extensions: {
    code: 'FORBIDDEN',
    http: { status: 403 },
  },
});
```

5. **Use `formatError` on the server to sanitize outgoing errors.** Strip stack traces, internal messages, and sensitive details in production. Log the full error server-side.

```typescript
const server = new ApolloServer({
  typeDefs,
  resolvers,
  formatError: (formattedError, error) => {
    // Log the raw error for debugging
    logger.error(error);

    // Strip internal details in production
    if (process.env.NODE_ENV === 'production') {
      if (formattedError.extensions?.code === 'INTERNAL_SERVER_ERROR') {
        return {
          message: 'An unexpected error occurred',
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        };
      }
      delete formattedError.extensions?.stacktrace;
    }
    return formattedError;
  },
});
```

6. **Never expose database errors, stack traces, or file paths to clients.** These leak implementation details and aid attackers. Always map internal errors to generic messages.

7. **Implement error boundary resolvers for non-null fields.** If a non-null field resolver fails, the error propagates up to the nearest nullable parent, potentially nullifying large portions of the response. Place nullable "firewalls" at strategic points.

```graphql
type Query {
  # If user resolver fails, only this field is null — not the entire response
  user(id: ID!): User
  # If feed fails, the entire Query becomes an error (bad)
  feed: [Post!]!
}
```

8. **On the client, handle both error channels.** Check `error` from the hook for network/system errors, and check the response payload for domain errors.

```typescript
const [createOrder, { error: networkError }] = useMutation(CREATE_ORDER);

const result = await createOrder({ variables: { input } });
if (networkError) {
  // System error — show generic message
}
if (result.data?.createOrder.errors.length) {
  // Domain error — show field-specific validation messages
}
```

## Details

**Partial data with errors:** GraphQL can return both `data` and `errors` in the same response. A query requesting three fields may return data for two and an error for one. Clients must handle this — do not treat any error as a total failure.

**Error codes convention:** Apollo defines standard codes: `GRAPHQL_PARSE_FAILED`, `GRAPHQL_VALIDATION_FAILED`, `BAD_USER_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `INTERNAL_SERVER_ERROR`. Use these for consistency, and add custom codes for domain-specific errors.

**Errors in lists:** If a list field is `[User!]!` and one user resolver fails, the entire list becomes null (bubbling up from the non-null item). Use `[User]!` if individual items can fail without destroying the whole list.

**Testing error paths:** Write tests that specifically verify error responses — both the structure (correct code, field paths) and the absence of sensitive data (no stack traces in production mode).

## Source

https://www.apollographql.com/docs/apollo-server/data/errors/

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
