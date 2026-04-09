# tRPC: Router Composition

> Organize type-safe RPC procedures into nested routers that merge into a single appRouter

## When to Use

- Structuring a tRPC API with multiple resource domains (users, posts, comments)
- Splitting router definitions across files to keep each file focused
- Merging routers from different modules without losing end-to-end type safety
- Building a plugin or extension architecture where routers are composed dynamically

## Instructions

1. Initialize tRPC once per project in `server/trpc.ts` — export `t`, `router`, `publicProcedure`, and `protectedProcedure` from this file.
2. Create one router file per resource domain in `server/routers/` — each exports a router created with `createTRPCRouter()`.
3. Merge domain routers into the root `appRouter` in `server/root.ts` using `createTRPCRouter({ ... })` with each sub-router as a property.
4. Export `AppRouter` type from `server/root.ts` — import it in the client to infer all procedure types.
5. Never create multiple `initTRPC` instances — share the single `t` export across all router files.
6. Use consistent naming: `usersRouter`, `postsRouter`, `commentsRouter` — the property name becomes the namespace in client calls.
7. Keep individual routers under ~20 procedures — split by sub-resource or use middleware to group related procedures.

```typescript
// server/trpc.ts — single tRPC initialization
import { initTRPC } from '@trpc/server';
import type { TRPCContext } from './context';

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
```

```typescript
// server/routers/posts.ts — domain router
import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';

export const postsRouter = router({
  list: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(({ ctx, input }) => ctx.db.post.findMany({ take: input.limit })),

  create: protectedProcedure
    .input(z.object({ title: z.string().min(1), content: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.db.post.create({ data: { ...input, authorId: ctx.session.user.id } })
    ),
});

// server/root.ts — merge all routers
import { router } from './trpc';
import { postsRouter } from './routers/posts';
import { usersRouter } from './routers/users';

export const appRouter = router({
  posts: postsRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;
```

## Details

tRPC uses TypeScript's structural type system to infer the entire API contract from the router definition — no code generation, no schema files, no runtime reflection. The `AppRouter` type is the single source of truth for both client and server.

**Namespace hierarchy:** Nesting routers (`{ posts: postsRouter }`) creates a namespace. Client calls become `api.posts.list.useQuery()`. This mirrors the router file structure and makes API organization visible to consumers.

**Single `initTRPC` instance:** `initTRPC` is called once and the resulting `t` object is shared. Calling it multiple times produces isolated tRPC instances that cannot be merged — a common mistake when trying to split initialization.

**`router()` vs `mergeRouters()`:** `createTRPCRouter({ posts: postsRouter })` is namespace-based composition — the sub-router's procedures are nested under the key. `mergeRouters(routerA, routerB)` is flat composition — all procedures from both routers appear at the same level. Use namespacing for domain separation; use `mergeRouters` sparingly for cross-cutting procedures.

**`superjson` transformer:** tRPC procedures serialize/deserialize inputs and outputs as JSON by default. Adding `superjson` as a transformer enables passing `Date`, `Map`, `Set`, `BigInt`, and other non-JSON types through procedures. Add it to both `initTRPC` on the server and the client link configuration.

**Export only `AppRouter` type, not the instance:** The `appRouter` instance contains server-only dependencies (db client, etc.). Export only `typeof appRouter` (the type) for client consumption — never import the server router directly in client code.

## Source

https://trpc.io/docs/server/routers

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
