# tRPC: Input Validation

> Define type-safe inputs and outputs with Zod schemas for end-to-end type inference

## When to Use

- Adding validated inputs to tRPC queries and mutations
- Defining output schemas for explicit contract documentation and runtime validation
- Sharing input types between the client form and the server procedure without duplication
- Using `superjson` to pass complex types (Dates, Maps) through tRPC procedures
- Composing complex input schemas from reusable Zod objects

## Instructions

1. Call `.input(zodSchema)` on any procedure to define validated input — tRPC rejects requests that do not match the schema.
2. Infer the TypeScript type from the Zod schema with `z.infer<typeof schema>` — share this type between client and server.
3. Call `.output(zodSchema)` to define the expected output shape — tRPC validates and strips unknown fields at runtime.
4. Use `z.object()` for structured inputs, `z.string().uuid()` for IDs, and `z.enum()` for fixed option sets.
5. Use `.optional()`, `.default()`, and `.nullish()` on Zod fields for optional procedure inputs.
6. Use `superjson` transformer for procedures that pass `Date`, `BigInt`, or other non-JSON-serializable types.
7. Export reusable Zod schemas from a shared `schemas/` directory — import them in both the router and the client form validation.

```typescript
// schemas/post.ts — shared Zod schemas
import { z } from 'zod';

export const createPostSchema = z.object({
  title: z.string().min(1, 'Title required').max(200),
  content: z.string().min(1),
  published: z.boolean().default(false),
  tags: z.array(z.string()).max(10).default([]),
});

export const updatePostSchema = createPostSchema.partial().extend({
  id: z.string().cuid(),
});

export const postFiltersSchema = z.object({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  authorId: z.string().cuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

// server/routers/posts.ts — using schemas in procedures
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { createPostSchema, updatePostSchema, postFiltersSchema } from '@/schemas/post';

export const postsRouter = router({
  list: publicProcedure.input(postFiltersSchema).query(({ ctx, input }) =>
    ctx.db.post.findMany({
      where: { status: input.status, authorId: input.authorId },
      take: input.limit,
      cursor: input.cursor ? { id: input.cursor } : undefined,
    })
  ),

  create: protectedProcedure
    .input(createPostSchema)
    .mutation(({ ctx, input }) =>
      ctx.db.post.create({ data: { ...input, authorId: ctx.session.user.id } })
    ),
});
```

## Details

tRPC's type inference flows from Zod schemas through procedure definitions to the client. When you call `api.posts.create.useMutation()`, the `variables` type is automatically inferred from the `.input()` schema — no manual type annotation required.

**`.input()` vs `.output()` usage:** `.input()` is nearly universal — every procedure that accepts parameters should use it. `.output()` is more situational — use it when you want to guarantee the return shape (strip extra fields from DB objects) or when documenting a public API contract. Output validation adds runtime overhead for every procedure call.

**Zod schema reuse between client and server:** Define schemas in a shared location (e.g., `src/schemas/` or a `@repo/schemas` monorepo package). Import them in the tRPC router for server-side validation AND in React Hook Form or Zod's `safeParse` for client-side form validation. One schema, two uses, zero drift.

**Partial schemas for updates:** `createPostSchema.partial()` makes all fields optional — perfect for PATCH-style update procedures where only the changed fields are sent. Add back required fields (like `id`) with `.extend({ id: z.string() })`.

**Procedure chaining:** Procedures are built by chaining: `t.procedure.use(middleware).input(schema).query(handler)`. The order matters — `.use()` must come before `.input()`. The `ctx` type in the handler reflects all middleware transformations applied before it.

**`superjson` for Dates:** Without `superjson`, JSON serialization converts `Date` to string. With `superjson`, `Date` round-trips correctly. Add it to `initTRPC.create({ transformer: superjson })` and the corresponding client link. All procedures in the router automatically use it.

## Source

https://trpc.io/docs/server/validators

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** trpc-router-composition, trpc-error-handling, next-route-handlers, ts-utility-types, api-validation-errors

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
