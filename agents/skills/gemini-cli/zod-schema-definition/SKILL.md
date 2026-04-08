# Zod Schema Definition

> Define runtime-validated TypeScript schemas with z.object, primitives, enums, literals, and schema composition

## When to Use

- You need runtime validation that also produces TypeScript types (no manual interface duplication)
- You are receiving untrusted data: API responses, form submissions, environment variables, query params
- You want a single source of truth for both runtime validation and static typing
- You are starting a new data model and want to define it as a Zod schema first

## Instructions

1. Install Zod: `npm install zod`
2. Import the `z` namespace: `import { z } from 'zod'`
3. Define primitive fields — choose the right primitive for each field:
   - `z.string()`, `z.number()`, `z.boolean()`, `z.date()`, `z.bigint()`, `z.symbol()`
   - `z.undefined()`, `z.null()`, `z.void()`, `z.any()`, `z.unknown()`, `z.never()`
4. Use `z.object()` to compose fields into a schema object — each key maps to a Zod type:

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
  role: z.enum(['admin', 'editor', 'viewer']),
  createdAt: z.date(),
});
```

5. Use `z.enum()` for a fixed set of string literals — prefer over `z.union([z.literal(...)])` for simple cases:

```typescript
const StatusSchema = z.enum(['active', 'inactive', 'pending']);
type Status = z.infer<typeof StatusSchema>; // 'active' | 'inactive' | 'pending'
```

6. Use `z.literal()` for exact value matching:

```typescript
const TrueSchema = z.literal(true);
const FortyTwoSchema = z.literal(42);
const HelloSchema = z.literal('hello');
```

7. Make fields optional or nullable explicitly:

```typescript
const ProfileSchema = z.object({
  bio: z.string().optional(), // string | undefined
  avatar: z.string().nullable(), // string | null
  website: z.string().nullish(), // string | null | undefined
});
```

8. Compose schemas by nesting them — use schema references, not re-definition:

```typescript
const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zip: z.string().regex(/^\d{5}$/),
});

const OrderSchema = z.object({
  id: z.string().uuid(),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.optional(),
});
```

9. Parse input data — use `.parse()` to throw on failure, `.safeParse()` to handle errors gracefully:

```typescript
// Throws ZodError if invalid
const user = UserSchema.parse(rawData);

// Returns { success: true, data } or { success: false, error }
const result = UserSchema.safeParse(rawData);
if (result.success) {
  console.log(result.data); // fully typed
} else {
  console.error(result.error.issues);
}
```

10. Export both the schema and its inferred type together:

```typescript
export const UserSchema = z.object({ ... })
export type User = z.infer<typeof UserSchema>
```

## Details

Zod schemas are composable objects — they are not just validators, they are type constructors. Every schema carries both a runtime validator and a TypeScript type. The `z.infer<typeof Schema>` pattern eliminates the dual-maintenance problem of keeping an interface and a validator in sync.

**Schema composition strategies:**

- **Flat schemas** — all fields in one `z.object()`. Good for simple models.
- **Nested schemas** — reference child schemas by variable. Better for shared sub-shapes.
- **Extended schemas** — use `.extend()` to add fields without re-defining the base. See `zod-object-patterns`.

**Primitive coercion:**

Zod does not coerce by default. `z.number().parse("42")` throws. Use `z.coerce.number()` when input may be a string (e.g., URL query params, form fields):

```typescript
const PageSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

**Default values:**

```typescript
const ConfigSchema = z.object({
  timeout: z.number().default(5000),
  retries: z.number().default(3),
  debug: z.boolean().default(false),
});
```

**Recursive schemas:**

For tree structures, use `z.lazy()`:

```typescript
type Category = {
  name: string;
  subcategories: Category[];
};

const CategorySchema: z.ZodType<Category> = z.lazy(() =>
  z.object({
    name: z.string(),
    subcategories: z.array(CategorySchema),
  })
);
```

**When NOT to use Zod schema definition directly:**

- For large union types with many variants — prefer `z.discriminatedUnion()` (see `zod-union-discriminated`)
- For complex string patterns — use dedicated string validators (see `zod-string-validation`)
- For full object manipulation — use object-level methods (see `zod-object-patterns`)

## Source

https://zod.dev
