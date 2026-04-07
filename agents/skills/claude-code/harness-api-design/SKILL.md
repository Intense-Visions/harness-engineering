# Harness API Design

> Advisory guide for REST, GraphQL, and gRPC API design. Produces OpenAPI specs, GraphQL schemas, or proto definitions with versioning strategies and consistency validation.

## When to Use

- When designing new API endpoints for a feature or service
- When adding routes to an existing Express, Fastify, NestJS, or Hono application
- When defining a GraphQL schema or extending an existing one
- When creating gRPC service definitions with Protocol Buffers
- When establishing or updating an API versioning strategy
- When reviewing an API surface for consistency before release
- NOT for API security review (use harness-security-review for authentication, authorization, and injection analysis)
- NOT for API performance testing (use harness-perf or harness-load-testing for benchmarks and load simulation)
- NOT for database schema design that backs the API (use harness-database for schema and migration work)
- NOT for event-driven async APIs (use harness-event-driven for message queues, webhooks, and pub/sub)

## Process

### Phase 1: DISCOVER -- Detect API Style and Existing Surface

1. **Detect the API style.** Scan the project for stack signals. WHERE `openapi.*` or `swagger.*` files exist, THEN classify as REST. WHERE `*.graphql` or `schema.graphql` exists, THEN classify as GraphQL. WHERE `*.proto` files exist, THEN classify as gRPC. If the `--style` argument is provided, use that instead of auto-detection.

2. **Map existing endpoints.** For REST projects, scan route files (`src/**/routes/**`, `src/**/controllers/**`) and extract HTTP method, path, request body, and response shape. For GraphQL, parse `schema.graphql` or code-first schema definitions. For gRPC, parse `.proto` files for service and rpc definitions.

3. **Identify the framework.** Detect Express (`app.get`, `router.post`), Fastify (`fastify.route`), NestJS (`@Controller`, `@Get`), Hono (`app.get`), Apollo (`typeDefs`, `resolvers`), or gRPC libraries (`@grpc/grpc-js`, `grpc-node`). Framework detection drives phase 2 recommendations.

4. **Catalog existing conventions.** Record naming patterns (camelCase vs kebab-case paths), response envelope structure (e.g., `{ data, error, meta }`), pagination style (cursor vs offset), and error format (RFC 7807, custom). These become the baseline that new endpoints must follow.

5. **Check for an existing OpenAPI spec.** If `openapi.yaml` or `openapi.json` exists, parse it and compare against the actual route definitions. Flag any drift where the spec does not match the implementation.

### Phase 2: DESIGN -- Produce Endpoint Definitions and Schemas

1. **Define resource models.** For each new resource, produce a schema with required fields, types, nullable markers, and validation constraints. Use JSON Schema for REST, GraphQL type definitions for GraphQL, or message definitions for gRPC.

2. **Design endpoint signatures.** For REST: define method, path, path parameters, query parameters, request body schema, and response schema. Follow the conventions cataloged in phase 1. For GraphQL: define queries, mutations, and input types. For gRPC: define service RPCs with request and response messages.

3. **Apply versioning strategy.** WHERE a versioning strategy is already in use, THEN follow it. WHERE no strategy exists, THEN recommend URL-path versioning (`/v1/resources`) for REST, schema evolution with `@deprecated` for GraphQL, or package versioning for gRPC. Document the strategy for future endpoints.

4. **Design error responses.** For REST: use RFC 7807 Problem Details unless the project already uses a different format. Include `type`, `title`, `status`, `detail`, and `instance`. For GraphQL: use the `errors` array with `extensions.code`. For gRPC: use standard status codes with detailed error metadata.

5. **Define pagination.** WHERE the endpoint returns a collection, THEN include pagination. Recommend cursor-based pagination for real-time data and offset-based for static datasets. Define the pagination envelope: `{ data: [], pagination: { cursor, hasMore } }` or equivalent.

6. **Specify rate limiting and caching headers.** For each endpoint, recommend `Cache-Control`, `ETag`, and `Vary` headers where applicable. Identify endpoints that should be rate-limited and suggest `X-RateLimit-*` headers.

### Phase 3: VALIDATE -- Check Against Best Practices

1. **Verify naming consistency.** All resource names must follow the same convention (plural nouns for REST collections, singular for GraphQL types). Path segments must use the same casing throughout. Flag any deviation from the conventions cataloged in phase 1.

2. **Check HTTP method correctness.** WHERE a REST endpoint modifies state, THEN it must not use GET. WHERE an endpoint is idempotent, THEN it should use PUT over POST. WHERE an endpoint creates a resource, THEN it must return 201 with a Location header.

3. **Validate schema completeness.** Every endpoint must have a defined request schema (if it accepts input) and response schema. No `any` types. No untyped response bodies. For GraphQL, every field must have an explicit type. For gRPC, no `google.protobuf.Any` unless justified.

4. **Check backward compatibility.** WHERE this is an update to an existing API, THEN verify that no required fields were added to request schemas, no fields were removed from response schemas, no endpoint paths changed, and no response status codes changed. Flag breaking changes explicitly.

5. **Verify OpenAPI spec validity.** Run the OpenAPI spec through structural validation. Check for missing descriptions, missing examples, and undefined `$ref` targets. For GraphQL, validate the schema parses without errors. For gRPC, verify proto files compile with `protoc`.

### Phase 4: DOCUMENT -- Generate or Update Specifications

1. **Generate the OpenAPI spec.** For REST APIs, produce or update an `openapi.yaml` file with all endpoints, schemas, examples, and security definitions. Use OpenAPI 3.1 unless the project already uses 3.0. Include `operationId` for every endpoint.

2. **Generate GraphQL schema documentation.** For GraphQL APIs, ensure every type, field, query, and mutation has a description. Produce a schema file that can be used for introspection. Add deprecation notices to fields being phased out.

3. **Generate proto documentation.** For gRPC APIs, ensure every service, rpc, message, and field has a comment. Verify the proto file includes package name, syntax version, and appropriate options.

4. **Produce a changelog entry.** For updates to existing APIs, write a changelog entry listing new endpoints, modified endpoints, deprecated endpoints, and breaking changes (if any). Follow the project's changelog format.

5. **Create request/response examples.** For every new endpoint, include at least one success example and one error example in the spec. Examples must use realistic data, not placeholders like `"string"` or `0`.

## Harness Integration

- **`harness validate`** -- Run after generating specs to confirm project health
- **`harness scan`** -- Refresh the knowledge graph after adding new route files
- **`query_graph`** -- Trace dependencies between routes, controllers, and services
- **`get_impact`** -- Understand blast radius when modifying shared API schemas

## Success Criteria

- API style was correctly detected or explicitly specified
- Existing conventions were cataloged and followed in new designs
- Every new endpoint has a complete schema (request and response)
- Versioning strategy is documented and applied
- Error responses follow a consistent format with machine-readable codes
- OpenAPI/GraphQL/proto spec is valid and matches the implementation
- No backward-incompatible changes were introduced without explicit flagging
- Pagination, caching, and rate limiting were addressed for applicable endpoints

## Examples

### Example: REST API Design with Express

**Input:** "Design CRUD endpoints for a blog posts resource in our Express app."

**Phase 1 -- DISCOVER:**

```
Detected: REST API (Express 4.x)
Routes directory: src/routes/
Existing endpoints: GET /v1/users, POST /v1/users, GET /v1/users/:id
Conventions: kebab-case paths, plural nouns, /v1/ prefix
Response envelope: { data, meta, error }
Pagination: cursor-based ({ cursor, limit })
Error format: RFC 7807 Problem Details
OpenAPI spec: openapi.yaml (last updated 2 weeks ago, 1 drift: missing GET /v1/users/:id/settings)
```

**Phase 2 -- DESIGN:**

```yaml
paths:
  /v1/posts:
    get:
      operationId: listPosts
      parameters:
        - name: cursor
          in: query
          schema: { type: string }
        - name: limit
          in: query
          schema: { type: integer, default: 20, maximum: 100 }
        - name: status
          in: query
          schema: { type: string, enum: [draft, published, archived] }
      responses:
        200:
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { type: array, items: { $ref: '#/components/schemas/Post' } }
                  meta:
                    type: object
                    properties:
                      cursor: { type: string, nullable: true }
                      hasMore: { type: boolean }
    post:
      operationId: createPost
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreatePostInput' }
      responses:
        201:
          headers:
            Location: { schema: { type: string } }
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { $ref: '#/components/schemas/Post' }
```

**Phase 3 -- VALIDATE:**

```
Naming: PASS -- /v1/posts follows plural noun convention
Methods: PASS -- GET for reads, POST for creation
Schemas: PASS -- all endpoints have request/response schemas
Compatibility: N/A -- new resource, no existing contract
OpenAPI: WARN -- existing spec drift detected (1 endpoint missing)
```

**Phase 4 -- DOCUMENT:**
Updated `openapi.yaml` with 5 new endpoints, 3 new schemas, and examples. Fixed existing drift for `GET /v1/users/:id/settings`.

### Example: GraphQL Schema Extension with Apollo

**Input:** "Add a comments system to our GraphQL API."

**Phase 1 -- DISCOVER:**

```
Detected: GraphQL (Apollo Server 4, code-first with typeDefs)
Schema: src/schema/typeDefs.ts
Existing types: User, Post, Category
Resolvers: src/resolvers/
Conventions: PascalCase types, camelCase fields, relay-style connections for pagination
```

**Phase 2 -- DESIGN:**

```graphql
type Comment {
  id: ID!
  body: String!
  author: User!
  post: Post!
  createdAt: DateTime!
  updatedAt: DateTime!
  parentComment: Comment
  replies(first: Int, after: String): CommentConnection!
}

type CommentConnection {
  edges: [CommentEdge!]!
  pageInfo: PageInfo!
}

type CommentEdge {
  node: Comment!
  cursor: String!
}

input CreateCommentInput {
  postId: ID!
  body: String!
  parentCommentId: ID
}

extend type Query {
  comments(postId: ID!, first: Int, after: String): CommentConnection!
}

extend type Mutation {
  createComment(input: CreateCommentInput!): Comment!
  updateComment(id: ID!, body: String!): Comment!
  deleteComment(id: ID!): Boolean!
}

extend type Post {
  comments(first: Int, after: String): CommentConnection!
  commentCount: Int!
}
```

**Phase 3 -- VALIDATE:**

```
Naming: PASS -- PascalCase types, camelCase fields
Pagination: PASS -- relay-style connections with PageInfo
Types: PASS -- all fields explicitly typed, no Any
Compatibility: PASS -- uses extend, no modifications to existing types
```

### Example: gRPC Service Definition

**Input:** "Define a notification service for our microservices platform."

**Phase 1 -- DISCOVER:**

```
Detected: gRPC (proto3, @grpc/grpc-js)
Proto directory: proto/
Existing services: UserService, OrderService
Package: platform.v1
Conventions: PascalCase services and messages, snake_case fields
```

**Phase 2 -- DESIGN:**

```protobuf
syntax = "proto3";

package platform.v1;

import "google/protobuf/timestamp.proto";

service NotificationService {
  // Send a notification to a specific user.
  rpc SendNotification(SendNotificationRequest) returns (SendNotificationResponse);

  // List notifications for a user with cursor pagination.
  rpc ListNotifications(ListNotificationsRequest) returns (ListNotificationsResponse);

  // Mark a notification as read.
  rpc MarkAsRead(MarkAsReadRequest) returns (MarkAsReadResponse);

  // Stream real-time notifications for a user.
  rpc StreamNotifications(StreamNotificationsRequest) returns (stream Notification);
}

message Notification {
  string id = 1;
  string user_id = 2;
  string title = 3;
  string body = 4;
  NotificationType type = 5;
  bool is_read = 6;
  google.protobuf.Timestamp created_at = 7;
}

enum NotificationType {
  NOTIFICATION_TYPE_UNSPECIFIED = 0;
  NOTIFICATION_TYPE_ORDER_UPDATE = 1;
  NOTIFICATION_TYPE_SYSTEM_ALERT = 2;
  NOTIFICATION_TYPE_PROMOTION = 3;
}
```

## Gates

- **Every endpoint must have a complete schema.** No endpoint may be added without defined request parameters, request body (if applicable), response body, and error responses. An endpoint without a schema is not designed -- it is a stub.
- **Breaking changes must be explicitly flagged.** WHERE a change removes a field, renames an endpoint, or adds a required request parameter, THEN the skill must flag it as a breaking change and halt until the human acknowledges the break. Silent breaking changes are not permitted.
- **Generated specs must be valid.** The OpenAPI spec must pass structural validation. The GraphQL schema must parse without errors. Proto files must compile with `protoc`. An invalid spec is worse than no spec.
- **Naming conventions must be consistent.** WHERE the project uses a naming convention (detected in phase 1), THEN all new endpoints must follow it. A single inconsistent name pollutes the entire API surface.

## Evidence Requirements

When this skill makes claims about existing code, architecture, or behavior,
it MUST cite evidence using one of:

1. **File reference:** `file:line` format (e.g., `src/auth.ts:42`)
2. **Code pattern reference:** `file` with description (e.g., `src/utils/hash.ts` —
   "existing bcrypt wrapper")
3. **Test/command output:** Inline or referenced output from a test run or CLI command
4. **Session evidence:** Write to the `evidence` session section via `manage_state`

**Uncited claims:** Technical assertions without citations MUST be prefixed with
`[UNVERIFIED]`. Example: `[UNVERIFIED] The auth middleware supports refresh tokens`.

## Red Flags

### Universal

These apply to ALL skills. If you catch yourself doing any of these, STOP.

- **"I believe the codebase does X"** — Stop. Read the code and cite a file:line
  reference. Belief is not evidence.
- **"Let me recommend [pattern] for this"** without checking existing patterns — Stop.
  Search the codebase first. The project may already have a convention.
- **"While we're here, we should also [unrelated improvement]"** — Stop. Flag the idea
  but do not expand scope beyond the stated task.

### Domain-Specific

- **"Adding this required field to the existing endpoint"** — Stop. Adding required fields to existing endpoints breaks all current consumers. Make it optional or version the endpoint.
- **"Changing the response shape to be cleaner"** — Stop. Changing response shape without versioning is a breaking change. Existing consumers depend on the current structure.
- **"Returning the full object for convenience"** — Stop. Over-fetching exposes unnecessary data and increases payload size. Return only what the consumer needs.
- **"We don't need pagination for this endpoint"** — Stop. Lists without pagination become production incidents at scale. Add pagination from the start.

## Rationalizations to Reject

| Rationalization                                   | Reality                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| "It's an internal API, breaking changes are fine" | Internal consumers break too. Version the change or coordinate the migration explicitly.                  |
| "The field name is obvious enough"                | API field names are a public contract. Follow existing naming conventions and document the semantics.     |
| "Nobody uses that endpoint anyway"                | Verify with access logs or usage data. Assumptions about usage without evidence lead to silent breakages. |

## Escalation

- **No existing conventions detected:** When the project has no existing API endpoints and no spec file, the skill cannot infer conventions. Report: "No existing API conventions found. Provide a style guide or approve the defaults (plural nouns, kebab-case paths, RFC 7807 errors, cursor pagination) before proceeding."
- **Breaking change required by the feature:** When the requested feature inherently requires a breaking change (e.g., restructuring a response), present the break explicitly with migration guidance: "This feature requires removing the `legacyField` from the response. Recommend a deprecation period: add `newField` in v1, remove `legacyField` in v2."
- **Conflicting API styles in the same project:** When both REST routes and GraphQL resolvers exist, ask: "This project has both REST and GraphQL endpoints. Which style should the new feature use? Mixing styles for the same resource creates maintenance burden."
- **OpenAPI spec severely out of date:** When more than 30% of implemented endpoints are missing from the spec, flag: "The OpenAPI spec is significantly drifted from implementation (N endpoints missing). Recommend a full spec regeneration before adding new endpoints to avoid compounding the drift."
