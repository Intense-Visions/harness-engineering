# Zod Object Patterns

> Shape and compose Zod objects with pick, omit, partial, required, extend, merge, strict, and passthrough

## When to Use

- Deriving a subset schema from an existing schema (e.g., update payload excludes `id`)
- Making all or some fields optional for PATCH endpoints
- Extending a base schema with additional fields without re-definition
- Controlling whether unknown keys are stripped, passed through, or rejected

## Instructions

1. Use `.pick()` to create a schema with only specified keys:

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'viewer']),
  createdAt: z.date(),
});

// Only name and email — for public-facing profile display
const PublicProfileSchema = UserSchema.pick({ name: true, email: true });
type PublicProfile = z.infer<typeof PublicProfileSchema>; // { name: string; email: string }
```

2. Use `.omit()` to exclude specific keys:

```typescript
// Create user input — exclude server-generated fields
const CreateUserSchema = UserSchema.omit({ id: true, createdAt: true });
type CreateUserInput = z.infer<typeof CreateUserSchema>;
// { name: string; email: string; role: 'admin' | 'viewer' }
```

3. Use `.partial()` to make all fields optional (for PATCH/update payloads):

```typescript
// Full partial — all fields optional
const UpdateUserSchema = UserSchema.partial();

// Selective partial — only some fields optional
const PatchUserSchema = UserSchema.partial({ name: true, role: true });
// id and email remain required
```

4. Use `.required()` to make optional fields required again:

```typescript
const DraftSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  publishedAt: z.date().optional(),
});

// Publish requires all fields
const PublishSchema = DraftSchema.required();
```

5. Use `.extend()` to add new fields to an existing schema:

```typescript
const BaseEntitySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const PostSchema = BaseEntitySchema.extend({
  title: z.string().min(1),
  content: z.string(),
  authorId: z.string().uuid(),
  tags: z.array(z.string()).default([]),
});
```

6. Use `.merge()` to combine two object schemas (right side wins on key conflicts):

```typescript
const TimestampsSchema = z.object({
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

const ArticleSchema = z
  .object({
    title: z.string(),
    content: z.string(),
  })
  .merge(TimestampsSchema);
```

7. Control unknown key handling — default is strip (silently remove unknown keys):

```typescript
const StrictUserSchema = UserSchema.strict();
// Throws if input has keys not in the schema

const PassthroughSchema = UserSchema.passthrough();
// Passes unknown keys through to the output unchanged

const StrippedSchema = UserSchema.strip(); // default behavior — explicit for clarity
```

8. Access the shape of a schema for programmatic inspection:

```typescript
const keys = Object.keys(UserSchema.shape); // ['id', 'name', 'email', 'role', 'createdAt']
const emailSchema = UserSchema.shape.email; // z.ZodString
```

## Details

**`.extend()` vs `.merge()`:**

Both add fields to an object schema. The difference:

- `.extend()` accepts a plain object of Zod types (more ergonomic, handles most cases)
- `.merge()` accepts a full `ZodObject` (needed when combining two existing schema variables)

```typescript
// extend — preferred when adding known fields
const WithMetadata = UserSchema.extend({ metadata: z.record(z.string()) });

// merge — preferred when combining two schema variables
const Combined = SchemaA.merge(SchemaB);
```

**Deep partial:**

Zod's `.partial()` is shallow — nested objects remain fully required. For deep partial, recurse manually or use a utility:

```typescript
function deepPartial<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const entries = Object.entries(schema.shape).map(([key, val]) => {
    if (val instanceof z.ZodObject) {
      return [key, deepPartial(val).optional()];
    }
    return [key, (val as z.ZodTypeAny).optional()];
  });
  return z.object(Object.fromEntries(entries));
}
```

**Deriving CRUD schemas from one base:**

```typescript
const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']),
  dueDate: z.date().optional(),
  completedAt: z.date().nullable(),
});

export const CreateTaskSchema = TaskSchema.omit({ id: true, completedAt: true });
export const UpdateTaskSchema = TaskSchema.partial().required({ id: true });
export const TaskResponseSchema = TaskSchema;

export type Task = z.infer<typeof TaskSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
```

## Source

https://zod.dev/api#objects

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
