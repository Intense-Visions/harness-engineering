# Harness Data Validation

> Meticulous verifier for schema validation, data contracts, and pipeline data quality. Detects validation libraries, audits trust boundaries for unvalidated inputs, enforces runtime validation schemas, and verifies type-runtime alignment.

## When to Use

- When adding runtime validation to API inputs, form data, or configuration
- When reviewing a PR that modifies data schemas or validation logic
- When establishing data contracts between services or between frontend and backend
- When auditing an existing codebase for unvalidated trust boundary crossings
- When migrating between validation libraries (e.g., Joi to Zod, Yup to Valibot)
- When ensuring TypeScript types match runtime validation schemas
- NOT for database schema validation (use harness-database for DDL constraints and migration checks)
- NOT for API schema design (use harness-api-design for OpenAPI/GraphQL schema authoring)
- NOT for security input sanitization (use harness-security-review for injection and XSS analysis)
- NOT for test data generation (use harness-test-data for fixtures and factories)

## Process

### Phase 1: DETECT -- Identify Validation Libraries and Trust Boundaries

1. **Detect validation libraries.** Scan for imports: `zod` for Zod, `yup` for Yup, `joi` for Joi, `@sinclair/typebox` for TypeBox, `valibot` for Valibot, `ajv` for JSON Schema validation, `class-validator` for TypeORM/NestJS decorators, `io-ts` for functional validation. Record the library, version, and usage count.

2. **Map trust boundaries.** Identify every point where external data enters the application:
   - **API inputs:** Request body, query parameters, path parameters, headers
   - **File uploads:** Uploaded file content, metadata, MIME type
   - **Environment variables:** Configuration loaded at startup
   - **External API responses:** Data received from third-party services
   - **Message queue payloads:** Events consumed from Kafka, RabbitMQ, SQS
   - **User-generated content:** Form inputs, comments, rich text

3. **Map existing validation.** For each trust boundary, check whether validation exists. Scan for validation middleware (Express: `celebrate`, `zod-express-middleware`; NestJS: `ValidationPipe`; Fastify: `ajv` schema). Record which boundaries are validated and which are not.

4. **Detect type-runtime alignment.** WHERE TypeScript types are defined alongside Zod schemas, THEN check that `z.infer<typeof schema>` is used to derive the type. WHERE types and schemas are defined separately, THEN flag the potential drift: a type change without a schema change (or vice versa) creates a silent contract violation.

5. **Identify validation gaps.** Produce a gap report: list every trust boundary with its validation status (validated, partially validated, unvalidated). Prioritize gaps by risk: API inputs and message payloads are high risk, environment variables are medium risk, internal function parameters are low risk.

### Phase 2: AUDIT -- Find Unvalidated Inputs and Schema Mismatches

1. **Trace unvalidated API inputs.** For each API route handler, trace the request data from the handler parameter to its first usage. WHERE `req.body`, `req.query`, or `req.params` is accessed without prior validation (no middleware, no `.parse()`, no `.validate()`), THEN flag it with the file, line, and the specific property accessed.

2. **Check for partial validation.** WHERE a validation schema exists but does not cover all fields used by the handler, THEN flag the gap. Example: schema validates `{ name: string }` but the handler also accesses `req.body.email` which is not in the schema. This is worse than no validation because it creates false confidence.

3. **Detect type assertion abuse.** Scan for `as` casts on external data: `req.body as CreateUserInput`, `response.data as Product[]`, `JSON.parse(raw) as Config`. Each type assertion is a trust boundary violation -- it tells TypeScript "trust me" without runtime verification. Flag every instance with file and line.

4. **Audit environment variable access.** Scan for `process.env.` usage. WHERE environment variables are accessed without validation (no Zod `.parse()`, no `envalid`, no custom validation), THEN flag it. Missing environment variables at runtime cause cryptic errors. Recommend a validated config module that fails fast at startup.

5. **Check error message quality.** For each validation schema, verify that validation errors include: which field failed, what the expected type or format was, and what the actual value was (without leaking sensitive data). WHERE validation errors return generic messages like "Invalid input," THEN flag the poor developer experience.

### Phase 3: ENFORCE -- Generate or Fix Validation Schemas

1. **Generate schemas for unvalidated boundaries.** For each high-risk unvalidated trust boundary identified in phase 2, generate a validation schema in the project's chosen library. WHERE the project uses Zod, THEN generate Zod schemas. WHERE no library is established, THEN recommend Zod for TypeScript projects (best type inference) or Joi for JavaScript projects (most mature).

2. **Wire validation into the request pipeline.** Generate middleware or decorators that validate before the handler executes:
   - **Express + Zod:** Create a `validate` middleware that calls `schema.parse(req.body)` and returns 400 with structured errors on failure.
   - **NestJS + class-validator:** Add `@IsString()`, `@IsEmail()`, `@IsNotEmpty()` decorators to DTO classes and enable `ValidationPipe`.
   - **Fastify + JSON Schema:** Add the schema to the route definition for automatic validation.

3. **Align types with schemas.** WHERE TypeScript types are defined separately from validation schemas, THEN refactor to derive types from schemas: `type CreateUserInput = z.infer<typeof createUserSchema>`. This guarantees types and runtime validation can never drift. Remove the standalone type definition.

4. **Add environment variable validation.** Generate a config validation module that runs at startup:

   ```typescript
   // src/config.ts
   import { z } from 'zod';

   const envSchema = z.object({
     DATABASE_URL: z.string().url(),
     REDIS_URL: z.string().url(),
     JWT_SECRET: z.string().min(32),
     NODE_ENV: z.enum(['development', 'test', 'production']),
     PORT: z.coerce.number().default(3000),
   });

   export const config = envSchema.parse(process.env);
   ```

5. **Add custom error formatting.** WHERE the project returns raw validation errors to clients, THEN wrap them in a structured error response that follows the project's error format (e.g., RFC 7807). Strip internal details (stack traces, internal field names) while preserving actionable information (which field, what constraint).

### Phase 4: VERIFY -- Confirm Boundary Coverage and Type Alignment

1. **Recount trust boundary coverage.** Re-run the gap analysis from phase 1. Confirm that every high-risk boundary now has validation. Produce a coverage summary: `N/M trust boundaries validated (X% coverage)`. The target is 100% for API inputs and message payloads, 90%+ for all boundaries.

2. **Verify type-runtime alignment.** For every validation schema, verify that the TypeScript type is derived from the schema (not defined separately). Run `tsc --noEmit` to confirm no type errors. WHERE a type is still defined independently of its schema, THEN flag it as a remaining drift risk.

3. **Test validation rejects bad input.** For each new schema, verify that it correctly rejects: missing required fields, wrong types (string where number expected), values outside constraints (negative numbers, empty strings, too-long strings), and unexpected extra fields (if strict mode is appropriate). This can be verified by reviewing test coverage or by running existing tests.

4. **Verify error responses.** Send a malformed request to each validated endpoint (or trace the code path). Verify: the response status is 400 (not 500), the error body identifies which field failed and why, no internal details are leaked (no stack trace, no database column names), and the error format matches the project's convention.

5. **Check for validation performance.** WHERE a schema validates large payloads (>100 fields or nested arrays), THEN check that validation does not become a bottleneck. Zod and Joi parse synchronously -- a complex schema on a large payload can block the event loop. WHERE performance is a concern, THEN recommend Valibot (smaller bundle) or precompiled AJV (fastest runtime).

## Harness Integration

- **`harness validate`** -- Run after adding validation schemas to confirm project health
- **`harness scan`** -- Refresh the knowledge graph after adding schema files
- **`query_graph`** -- Trace which routes use which validation schemas
- **`get_impact`** -- Understand blast radius when modifying a shared validation schema

## Success Criteria

- Validation library was correctly detected or recommended
- All trust boundaries were identified and classified by risk level
- Every high-risk boundary (API inputs, message payloads) has runtime validation
- TypeScript types are derived from validation schemas, not defined separately
- Environment variables are validated at startup with fail-fast behavior
- Type assertions (`as`) on external data are replaced with runtime validation
- Validation errors return structured 400 responses with field-level detail
- No sensitive data is leaked in validation error messages
- Coverage summary shows 100% for API inputs and 90%+ overall

## Examples

### Example: Zod Validation for Express API

**Input:** "Add request validation to our Express API routes."

**Phase 1 -- DETECT:**

```
Library: Zod 3.x (already in package.json, used in 2 of 14 routes)
Framework: Express 4.x with TypeScript
Trust boundaries:
  - API inputs: 14 routes, 2 validated (14% coverage)
  - External API: 3 calls to Stripe API, 0 validated
  - Environment: 8 env vars accessed, 0 validated
  - Message queue: N/A
```

**Phase 2 -- AUDIT:**

```
Unvalidated API inputs:
  HIGH  src/routes/users.ts:23 -- POST /users: req.body accessed without validation
  HIGH  src/routes/users.ts:45 -- PATCH /users/:id: req.body.email used without validation
  HIGH  src/routes/orders.ts:12 -- POST /orders: req.body.items array not validated
  HIGH  src/routes/orders.ts:56 -- POST /orders/:id/refund: req.body.amount not validated

Type assertions:
  WARN  src/services/stripe.ts:34 -- response.data as StripeCharge (no runtime check)
  WARN  src/routes/users.ts:24 -- req.body as CreateUserDTO (trust boundary violation)

Environment variables:
  MEDIUM  src/db.ts:3 -- process.env.DATABASE_URL used without validation
  MEDIUM  src/auth.ts:7 -- process.env.JWT_SECRET used without validation (could be undefined)
```

**Phase 3 -- ENFORCE:**

```typescript
// src/schemas/user.schema.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.partial();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// src/middleware/validate.ts
import { z, ZodSchema } from 'zod';
import { Request, Response, NextFunction } from 'express';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        type: 'https://api.example.com/errors/validation',
        title: 'Validation Error',
        status: 400,
        detail: 'Request body failed validation',
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      });
    }
    req.body = result.data; // replace with parsed (coerced, defaulted) data
    next();
  };
}

// src/routes/users.ts -- wired
app.post('/users', validate(createUserSchema), async (req, res) => {
  const input: CreateUserInput = req.body; // type-safe, validated
  // ...
});
```

**Phase 4 -- VERIFY:**

```
Trust boundary coverage: 14/14 API routes validated (100%)
Type alignment: PASS -- all types derived from schemas via z.infer
Error responses: PASS -- structured 400 with field-level errors
Environment: PASS -- config.ts validates all 8 env vars at startup
Remaining type assertions: 1 (Stripe response -- mitigated with response schema)
```

### Example: NestJS DTO Validation with class-validator

**Input:** "Audit our NestJS app for validation gaps."

**Phase 1 -- DETECT:**

```
Library: class-validator 0.14.x, class-transformer 0.5.x
Framework: NestJS 10.x with ValidationPipe (global)
Trust boundaries:
  - API inputs: 22 routes, 18 validated via DTOs (82% coverage)
  - WebSocket messages: 4 handlers, 0 validated
  - External API: 2 calls to payment gateway, 0 validated
```

**Phase 2 -- AUDIT:**

```
Missing DTO validation:
  HIGH  src/modules/admin/admin.controller.ts:34 -- POST /admin/config: uses raw @Body()
  HIGH  src/modules/admin/admin.controller.ts:67 -- PUT /admin/users/:id/role: no DTO
  HIGH  src/modules/chat/chat.gateway.ts:23 -- @SubscribeMessage('sendMessage'): no validation
  HIGH  src/modules/chat/chat.gateway.ts:45 -- @SubscribeMessage('joinRoom'): no validation

Partial DTOs:
  WARN  src/modules/orders/dto/create-order.dto.ts -- items field is typed OrderItem[]
        but OrderItem has no class-validator decorators. Nested validation missing.
        Add @ValidateNested({ each: true }) and @Type(() => OrderItem)
```

**Phase 3 -- ENFORCE:**

```typescript
// src/modules/orders/dto/order-item.dto.ts
import { IsString, IsNumber, IsPositive, Min } from 'class-validator';

export class OrderItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  @IsPositive()
  @Min(1)
  quantity: number;
}

// src/modules/orders/dto/create-order.dto.ts (fixed)
import { ValidateNested, IsArray, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderItemDto } from './order-item.dto';

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
```

### Example: Data Contract Between Microservices

**Input:** "Establish data contracts between our order service and notification service."

**Phase 1 -- DETECT:**

```
Order service: TypeScript, Zod, publishes to Kafka
Notification service: TypeScript, Joi, consumes from Kafka
Shared schema: none (each service defines its own types independently)
```

**Phase 2 -- AUDIT:**

```
CRITICAL: No shared contract between services.

Order service publishes OrderPlaced with shape:
  { orderId: string, userId: string, items: Array<{ id: string, qty: number }>, total: number }

Notification service expects:
  { orderId: string, customerId: string, lineItems: Array<{ productId: string, quantity: number }>, totalAmount: number }

Field mismatches:
  - userId (producer) vs customerId (consumer) -- different name, same data
  - items.id (producer) vs lineItems.productId (consumer) -- different name
  - items.qty (producer) vs lineItems.quantity (consumer) -- different name
  - total (producer) vs totalAmount (consumer) -- different name

These mismatches will cause runtime failures or silent data loss.
```

**Phase 3 -- ENFORCE:**

```typescript
// packages/contracts/src/events/order-placed.ts (shared package)
import { z } from 'zod';

export const orderPlacedSchema = z.object({
  orderId: z.string().uuid(),
  userId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
  totalAmount: z.number().positive(),
  currency: z.string().length(3),
  placedAt: z.string().datetime(),
});

export type OrderPlacedEvent = z.infer<typeof orderPlacedSchema>;
export const ORDER_PLACED_VERSION = 1;

// Order service (producer): validate before publishing
const event = orderPlacedSchema.parse(payload);
await producer.send({ topic: 'order-events', messages: [{ value: JSON.stringify(event) }] });

// Notification service (consumer): validate after consuming
const event = orderPlacedSchema.parse(JSON.parse(message.value));
```

## Rationalizations to Reject

| Rationalization                                                                                                                 | Reality                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "TypeScript already types the request body — we don't need runtime Zod validation on top of that."                              | TypeScript types are erased at runtime. `req.body as CreateUserInput` compiles fine and accepts any payload at runtime. A missing required field, a string where a number is expected, or an injected extra field bypasses TypeScript entirely. Runtime validation is not redundant with types — it is the only enforcement that exists when the application is actually running. |
| "We trust this internal service — we don't need to validate its message payloads."                                              | Trust boundaries are not about intent; they are about reliability. Internal services change their schemas, deploy independently, and have bugs. A consumer that accepts payloads without validation silently processes malformed data and produces corrupted downstream records. Validate every message that crosses a process boundary, regardless of who sent it.               |
| "The validation error message just says 'invalid input' — the developer can look at the schema to understand what failed."      | Developers are not the only consumers of validation errors. Frontend applications display them, monitoring systems alert on them, and support teams diagnose them. A message that says `{"field":"email","expected":"string email","received":"null"}` is resolved in seconds. "Invalid input" creates a support ticket.                                                          |
| "The two services define their own schemas independently but they've been in sync so far — shared contracts are overkill."      | "In sync so far" describes luck, not process. Independent schema definitions diverge at the next feature sprint when one team changes a field name. Shared contracts in a common package make schema drift a compile-time error instead of a runtime mystery. The divergence between `userId` and `customerId` in the same event is exactly what independent definitions produce. |
| "Environment variable validation at startup is unnecessary — if a variable is missing, the app will fail when it's first used." | Failing at the first usage of a missing variable produces a cryptic error deep in the call stack, often after the app has been running for minutes and has processed real requests. Failing at startup produces a clear error with the variable name, before any requests are served. Fast failure is always better than deferred failure.                                        |

## Gates

- **No type assertions on external data.** WHERE `as` is used to cast data from an API response, message payload, request body, or `JSON.parse` result, THEN the skill must flag it as a trust boundary violation. Type assertions bypass runtime validation entirely. The only acceptable pattern is runtime validation followed by type inference.
- **Validation errors must not leak internal details.** WHERE a validation error response includes stack traces, database column names, internal field names, or ORM error messages, THEN the skill must halt and require error sanitization. Validation errors are returned to untrusted clients.
- **Shared data contracts must use a single source of truth.** WHERE two services exchange data (via API or message queue) and define the schema independently, THEN the skill must flag the drift risk. Shared contracts must be defined once in a shared package and imported by both producer and consumer.
- **Environment variables must be validated at startup.** WHERE `process.env.*` is accessed directly in application code (outside a validated config module), THEN the skill must flag it. An undefined environment variable discovered at request time causes a runtime crash. Validation at startup fails fast with a clear error.

## Escalation

- **Multiple validation libraries in the same project:** When the project uses both Zod and Joi (or other combinations), report: "Two validation libraries detected: Zod (12 schemas) and Joi (5 schemas). Maintaining two libraries increases bundle size and cognitive load. Recommend migrating all Joi schemas to Zod for consistency. Migration can be incremental -- start with new schemas in Zod, migrate existing Joi schemas during related feature work."
- **Validation causes performance regression:** When adding validation to a high-throughput endpoint causes measurable latency increase, report: "Zod schema validation on POST /events adds 8ms per request (payload: 500 fields). For this endpoint's volume (10K req/s), consider: (1) precompiled AJV for 10x faster validation, (2) validate only unknown clients and skip for trusted internal callers, or (3) validate asynchronously after accepting the request."
- **Breaking schema change required:** When a shared data contract must change in a backward-incompatible way, report: "Removing the `legacyField` from the `OrderPlaced` schema will break notification-service consumers running the old version. Recommend: (1) add the new field alongside the old one, (2) deploy consumers that read from the new field, (3) stop populating the old field, (4) remove the old field in a subsequent release."
- **Validation coverage too low for safe remediation:** When less than 20% of trust boundaries have validation and the codebase has no validation middleware pattern, report: "Validation coverage is 12%. Adding schemas to individual routes is high effort. Recommend: (1) add global validation middleware, (2) start with the highest-risk routes (auth, payments, user creation), (3) add a lint rule that requires a schema for every new route, (4) backfill remaining routes over 2-3 sprints."
