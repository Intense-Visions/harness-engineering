# tRPC: Middleware

> Add cross-cutting logic (auth checks, logging, rate limiting) to procedures via t.middleware

## When to Use

- Enforcing authentication on a set of procedures without repeating the check in each handler
- Enriching the context with derived data (user object from session ID) before the handler runs
- Logging request/response for observability across all procedures
- Adding rate limiting or permission checks that apply to procedure groups
- Creating reusable procedure builders (`protectedProcedure`, `adminProcedure`)

## Instructions

1. Create middleware with `t.middleware(async ({ ctx, next }) => { ... })` — call `next({ ctx: { ...ctx, ...enriched } })` to pass enriched context to the handler.
2. Attach middleware to a procedure with `.use(middleware)` — the middleware runs before the input validation and handler.
3. Build typed procedure builders by chaining `.use()` and exporting the result: `export const protectedProcedure = t.procedure.use(isAuthed)`.
4. Throw `new TRPCError({ code: 'UNAUTHORIZED' })` in middleware to reject the request — the error propagates to the client's `onError` handler.
5. Access the enriched context type in the handler — TypeScript narrows the type based on what middleware adds to `ctx`.
6. Use `.pipe()` to compose multiple middleware — each receives the context enriched by the previous middleware.
7. Return `next()` at the end of middleware — forgetting this causes the procedure to never respond.

```typescript
// server/trpc.ts — middleware and procedure builders
import { initTRPC, TRPCError } from '@trpc/server';
import type { TRPCContext } from './context';

const t = initTRPC.context<TRPCContext>().create();

// Auth middleware — enriches ctx with session and user
const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not signed in' });
  }
  return next({
    ctx: {
      ...ctx,
      // TypeScript now knows session and user are non-null in subsequent handlers
      session: ctx.session,
      user: ctx.session.user,
    },
  });
});

// Admin middleware — must be used after isAuthed (pipes)
const isAdmin = t.middleware(async ({ ctx, next }) => {
  // ctx.user is typed as defined by isAuthed — no null check needed
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

// Timing middleware — logs procedure duration
const timingMiddleware = t.middleware(async ({ path, next }) => {
  const start = Date.now();
  const result = await next();
  console.log(`[tRPC] ${path} took ${Date.now() - start}ms`);
  return result;
});

export const publicProcedure = t.procedure.use(timingMiddleware);
export const protectedProcedure = publicProcedure.use(isAuthed);
export const adminProcedure = protectedProcedure.use(isAdmin);
```

## Details

tRPC middleware is a functional chain: each middleware receives the current `ctx` and calls `next()` to pass control to the next middleware or the handler. The `ctx` passed to `next()` becomes the `ctx` available in subsequent middleware and the handler.

**Context type narrowing:** When middleware adds properties to `ctx` (e.g., `user: NonNullable<Ctx['session']['user']>`), TypeScript updates the `ctx` type for everything downstream. This is why `protectedProcedure`'s handler can access `ctx.user` without null checks — the middleware has already asserted non-null.

**Middleware composition:** `protectedProcedure.use(isAdmin)` creates `adminProcedure`. Middleware applied earlier in the chain runs first. `timingMiddleware.use(isAuthed).use(isAdmin)` runs timing, then auth, then admin check, then the handler.

**`next()` return value:** Middleware can inspect the handler's return value by `const result = await next()` and then examine or transform `result.ok` / `result.data`. This pattern is useful for response logging and transforming output globally.

**Procedure reuse pattern:** Instead of applying middleware individually to each procedure, create named procedure builders (`publicProcedure`, `protectedProcedure`, `adminProcedure`) and use them as the base for all procedures in a domain. This guarantees consistent middleware application.

**Input access in middleware:** Middleware does not have access to the validated input by default. If middleware needs input values (e.g., for rate limiting by resource ID), use `experimental_caller` or restructure to check after input validation by placing middleware after `.input()`.

## Source

https://trpc.io/docs/server/middlewares
