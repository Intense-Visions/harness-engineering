# TypeScript Zod Integration

> Use Zod schemas as the single source of truth for runtime validation and TypeScript types

## When to Use

- Validating API request bodies, query parameters, or form data
- Deriving TypeScript types from validation schemas (single source of truth)
- Parsing and transforming unknown data from external sources
- Building type-safe environment variable configuration

## Instructions

1. **Define a schema and infer the type:**

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().cuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(['user', 'admin']),
  createdAt: z.coerce.date(),
});

type User = z.infer<typeof UserSchema>;
// { id: string; email: string; name: string; role: 'user' | 'admin'; createdAt: Date }
```

2. **Parse unknown data** — validates and returns typed result:

```typescript
const user = UserSchema.parse(untrustedData);
// Throws ZodError if validation fails

const result = UserSchema.safeParse(untrustedData);
if (result.success) {
  console.log(result.data); // Type: User
} else {
  console.log(result.error.issues); // Validation errors
}
```

3. **Compose schemas** with pick, omit, extend, and merge:

```typescript
const CreateUserSchema = UserSchema.omit({ id: true, createdAt: true });
const UpdateUserSchema = UserSchema.partial().required({ id: true });
const UserWithPostsSchema = UserSchema.extend({
  posts: z.array(PostSchema),
});
```

4. **Transform data** during parsing:

```typescript
const InputSchema = z.object({
  email: z
    .string()
    .email()
    .transform((e) => e.toLowerCase().trim()),
  tags: z.string().transform((s) => s.split(',').map((t) => t.trim())),
  age: z.coerce.number().int().positive(),
});
```

5. **Validate environment variables:**

```typescript
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_KEY: z.string().min(1),
});

export const env = EnvSchema.parse(process.env);
// Fails at startup if any required env var is missing or invalid
```

6. **Use with API route handlers:**

```typescript
// Next.js Route Handler
const QuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = QuerySchema.parse(Object.fromEntries(url.searchParams));
  // query is fully typed: { page: number; limit: number; search?: string }
}
```

7. **Discriminated union schemas:**

```typescript
const EventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), x: z.number(), y: z.number() }),
  z.object({ type: z.literal('keypress'), key: z.string() }),
  z.object({ type: z.literal('scroll'), offset: z.number() }),
]);

type Event = z.infer<typeof EventSchema>;
```

8. **Custom validation with `refine` and `superRefine`:**

```typescript
const PasswordSchema = z
  .object({
    password: z.string().min(8),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
```

9. **Error formatting:**

```typescript
const result = UserSchema.safeParse(data);
if (!result.success) {
  const formatted = result.error.flatten();
  // { formErrors: string[], fieldErrors: { email?: string[], name?: string[] } }
}
```

## Details

Zod provides runtime validation that TypeScript's type system cannot. TypeScript types are erased at runtime — they cannot validate data from APIs, databases, or user input. Zod bridges this gap by generating both validation logic and TypeScript types from a single schema definition.

**Schema-first approach:** Define the Zod schema first, then derive the TypeScript type with `z.infer`. This eliminates the common problem of types and validation drifting apart.

**`parse` vs `safeParse`:**

- `parse` throws `ZodError` on failure — use in contexts where invalid data is an error (middleware, startup validation)
- `safeParse` returns a discriminated union `{ success: true, data: T } | { success: false, error: ZodError }` — use when you need to handle validation failure gracefully

**Performance:** Zod validation is faster than JSON Schema for most schemas. For very high-throughput paths (>10K validations/second), consider `valibot` or compile schemas with `@anatine/zod-openapi`.

**Zod with Prisma:** Libraries like `zod-prisma-types` auto-generate Zod schemas from Prisma models:

```prisma
generator zod {
  provider = "zod-prisma-types"
}
```

**Trade-offs:**

- Zod schemas add runtime overhead — validate at system boundaries, not inside tight loops
- `z.infer` types can be complex in IDE tooltips — use type aliases for readability
- `transform` changes the output type — `z.infer` reflects the OUTPUT type, not the input
- Zod is synchronous by default — use `parseAsync` for schemas with async refinements

## Source

https://typescriptlang.org/docs/handbook/2/types-from-types.html
