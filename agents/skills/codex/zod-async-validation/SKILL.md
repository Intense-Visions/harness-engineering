# Zod Async Validation

> Run async Zod validation with parseAsync, safeParseAsync, async refinements, and external checks

## When to Use

- Validating uniqueness constraints against a database (e.g., email not already registered)
- Calling an external service during validation (e.g., checking if an address is deliverable)
- Running async transforms that fetch or process data
- Using Zod in an async context (server actions, API handlers) where awaiting is natural

## Instructions

1. Use `.parseAsync()` when your schema contains async refinements or transforms:

```typescript
import { z } from 'zod';
import { db } from '@/lib/db';

const UniqueEmailSchema = z
  .string()
  .email()
  .refine(
    async (email) => {
      const existing = await db.user.findUnique({ where: { email } });
      return !existing;
    },
    { message: 'Email address is already registered' }
  );

// Must await — throws ZodError on failure
const validEmail = await UniqueEmailSchema.parseAsync(rawEmail);
```

2. Use `.safeParseAsync()` for error handling without try/catch:

```typescript
const result = await UniqueEmailSchema.safeParseAsync(rawEmail);

if (!result.success) {
  const errors = result.error.flatten();
  return { success: false, errors: errors.formErrors };
}

return { success: true, email: result.data };
```

3. Add async refinements to object schemas for cross-field async checks:

```typescript
const CreateAccountSchema = z
  .object({
    username: z.string().min(3).max(20),
    email: z.string().email(),
    password: z.string().min(8),
  })
  .superRefine(async (data, ctx) => {
    const emailTaken = await db.user.findUnique({ where: { email: data.email } });
    if (emailTaken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email is already in use',
        path: ['email'],
      });
    }

    const usernameTaken = await db.user.findUnique({ where: { username: data.username } });
    if (usernameTaken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Username is already taken',
        path: ['username'],
      });
    }
  });

// In a server action:
const result = await CreateAccountSchema.safeParseAsync(formData);
```

4. Use async transforms for data enrichment during parsing:

```typescript
const UserIdSchema = z
  .string()
  .uuid()
  .transform(async (id) => {
    const user = await db.user.findUniqueOrThrow({ where: { id } });
    return user; // Output type is User, not string
  });

type ResolvedUser = z.infer<typeof UserIdSchema>; // User (database type)

const user = await UserIdSchema.parseAsync(rawId);
```

5. Short-circuit expensive async checks using synchronous pre-checks:

```typescript
const SlugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, 'Invalid slug format')
  .refine(
    async (slug) => {
      // Only hit DB if synchronous checks pass
      const existing = await db.post.findUnique({ where: { slug } });
      return !existing;
    },
    { message: 'Slug is already in use' }
  );
```

6. Parallelize multiple async checks using `Promise.all` inside `superRefine`:

```typescript
const CreatePostSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    categoryId: z.string().uuid(),
    authorId: z.string().uuid(),
  })
  .superRefine(async (data, ctx) => {
    const [slugExists, categoryExists, authorExists] = await Promise.all([
      db.post.findUnique({ where: { slug: data.slug } }),
      db.category.findUnique({ where: { id: data.categoryId } }),
      db.user.findUnique({ where: { id: data.authorId } }),
    ]);

    if (slugExists) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Slug already used', path: ['slug'] });
    }
    if (!categoryExists) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Category not found',
        path: ['categoryId'],
      });
    }
    if (!authorExists) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Author not found',
        path: ['authorId'],
      });
    }
  });
```

## Details

**Sync schema with async context:**

A schema without async refinements or transforms can still be used with `.parseAsync()` — it just resolves synchronously:

```typescript
// This works fine (resolves synchronously under the hood)
const result = await z.string().email().safeParseAsync(rawEmail);
```

**Error: "Schema must be used with parseAsync" — when it appears:**

If a schema has an async refinement and you call `.parse()` (not `.parseAsync()`), Zod throws a synchronous error. This is a common mistake when extracting schemas from server-side code.

**Timeout and abort:**

Zod does not have built-in timeout support for async refinements. Wrap your async checks with a timeout utility if needed:

```typescript
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Validation timeout')), ms)
  )
  return Promise.race([promise, timeout])
}

// Use inside refine:
.refine(async (email) => {
  return withTimeout(checkEmailUniqueness(email), 3000)
})
```

**Caching in async refinements:**

Do not cache Zod schema instances that hold open DB connections or closures. Create them in the request scope or use a factory function.

## Source

https://zod.dev/api#parseAsync

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
