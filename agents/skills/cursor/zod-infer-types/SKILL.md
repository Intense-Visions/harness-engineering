# Zod Infer Types

> Derive TypeScript types from Zod schemas with z.infer, input vs output types, and ZodTypeAny

## When to Use

- You want TypeScript types to be automatically derived from Zod schemas (single source of truth)
- A schema uses `.transform()` and you need to access both the input and output types separately
- You are writing utilities that accept any Zod schema and need to express that generically
- You want to avoid maintaining separate TypeScript interfaces alongside Zod schemas

## Instructions

1. Use `z.infer<typeof Schema>` to derive the TypeScript type from a schema — always export both together:

```typescript
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['admin', 'editor', 'viewer']),
  createdAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;
// {
//   id: string;
//   name: string;
//   email: string;
//   role: 'admin' | 'editor' | 'viewer';
//   createdAt: Date;
// }
```

2. When a schema uses `.transform()`, distinguish between input and output types:

```typescript
const DateInputSchema = z.object({
  name: z.string(),
  createdAt: z
    .string()
    .datetime()
    .transform((s) => new Date(s)),
});

type DateInput = z.input<typeof DateInputSchema>;
// { name: string; createdAt: string }   ← what you pass to .parse()

type DateOutput = z.infer<typeof DateInputSchema>;
// { name: string; createdAt: Date }     ← what you get back from .parse()

// z.infer always gives you the OUTPUT type
// z.input gives you the INPUT type (before transforms)
```

3. Use `z.output<typeof Schema>` as an explicit alias for `z.infer` — communicates intent clearly:

```typescript
type ParsedUser = z.output<typeof UserSchema>; // same as z.infer<typeof UserSchema>
type RawUser = z.input<typeof UserSchema>; // before any transforms
```

4. Write generic functions that accept any Zod schema using `z.ZodTypeAny`:

```typescript
import { z } from 'zod';

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, data: unknown): z.output<T> {
  return schema.parse(data);
}

function safeValidate<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): { success: true; data: z.output<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}
```

5. Use `z.ZodSchema<T>` when you want to accept a schema that must produce a known output type:

```typescript
function registerSchema<T>(name: string, schema: z.ZodSchema<T>): void {
  // schema.parse(data) is guaranteed to return T
  schemaRegistry.set(name, schema);
}

// TypeScript enforces the schema output matches T
registerSchema<User>('user', UserSchema); // OK
registerSchema<User>('user', z.object({ foo: z.string() })); // Type error
```

6. Extract element types from array schemas:

```typescript
const ItemsSchema = z.array(
  z.object({
    id: z.string(),
    label: z.string(),
    value: z.number(),
  })
);

type Items = z.infer<typeof ItemsSchema>; // { id: string; label: string; value: number }[]
type Item = Items[number]; // { id: string; label: string; value: number }
// Or: type Item = z.infer<typeof ItemsSchema.element>
```

7. Extract enum values as a type and as a runtime value array:

```typescript
const RoleSchema = z.enum(['admin', 'editor', 'viewer']);
type Role = z.infer<typeof RoleSchema>; // 'admin' | 'editor' | 'viewer'
const roles = RoleSchema.options; // ['admin', 'editor', 'viewer'] — runtime array
```

## Details

**Never write a TypeScript type alongside a Zod schema that describes the same shape:**

```typescript
// Bad: duplicate maintenance burden
interface User {
  id: string;
  name: string;
  email: string;
}
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

// Good: one source of truth
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});
type User = z.infer<typeof UserSchema>;
```

**Conditional types with discriminated unions:**

```typescript
const EventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), x: z.number(), y: z.number() }),
  z.object({ type: z.literal('keypress'), key: z.string() }),
]);

type Event = z.infer<typeof EventSchema>;
// { type: 'click'; x: number; y: number } | { type: 'keypress'; key: string }

// Extract individual variants
type ClickEvent = Extract<Event, { type: 'click' }>;
```

**Utility type helpers for Zod:**

```typescript
// Make all fields required (undo partials)
type RequiredUser = Required<z.infer<typeof UserSchema>>;

// Pick specific fields
type UserPreview = Pick<User, 'id' | 'name'>;

// These work because z.infer produces a plain TypeScript type
```

## Source

https://zod.dev/api#type-inference
