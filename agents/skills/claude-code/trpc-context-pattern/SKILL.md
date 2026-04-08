# tRPC Context Pattern

> Inject database clients, sessions, and request data into every procedure via `createTRPCContext`

## When to Use

- Setting up a tRPC server that needs database access in procedures
- Injecting the authenticated user's session into the context so middleware and procedures can read it
- Passing request headers or IP addresses to procedures for logging, rate limiting, or locale detection
- Structuring the context type so TypeScript understands what is available in every procedure handler

## Instructions

### 1. Define the context type and factory

```typescript
// server/context.ts
import { type inferAsyncReturnType } from '@trpc/server';
import { type FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function createTRPCContext({ req }: FetchCreateContextFnOptions) {
  const session = await getServerSession(authOptions);

  return {
    db,
    session,
    headers: req.headers,
  };
}

// Infer the Context type from the factory — use this throughout the codebase
export type Context = inferAsyncReturnType<typeof createTRPCContext>;
```

### 2. Pass context to initTRPC

```typescript
// server/trpc.ts
import { initTRPC } from '@trpc/server';
import { type Context } from './context';
import superjson from 'superjson';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
```

### 3. Wire the context factory to the adapter

```typescript
// app/api/trpc/[trpc]/route.ts — Next.js App Router
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/root';
import { createTRPCContext } from '@/server/context';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
  });

export { handler as GET, handler as POST };
```

### 4. Access context in procedures and middleware

```typescript
// server/routers/post.ts
import { router, publicProcedure, protectedProcedure } from '../trpc';

export const postRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    // ctx.db is typed as PrismaClient
    // ctx.session is typed as Session | null
    return ctx.db.post.findMany({
      where: { published: true },
    });
  }),

  myPosts: protectedProcedure.query(({ ctx }) => {
    // After isAuthed middleware, ctx.session is Session (non-null)
    return ctx.db.post.findMany({
      where: { authorId: ctx.session.user.id },
    });
  }),
});
```

### 5. Extend context in middleware

Middleware can add properties to the context using `next({ ctx: { ...ctx, extra } })`:

```typescript
// server/trpc.ts
import { TRPCError } from '@trpc/server';

const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      // TypeScript narrows: session and user are guaranteed non-null downstream
      session: ctx.session,
      user: ctx.session.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthed);
```

### 6. Create context for server-side callers (RSC)

```typescript
// lib/trpc/server.ts — for React Server Components
import { cache } from 'react';
import { headers } from 'next/headers';
import { createCallerFactory } from '@/server/trpc';
import { appRouter } from '@/server/root';
import { createTRPCContext } from '@/server/context';

// React.cache() scopes context to one instance per request
const createContext = cache(async () => {
  const headerStore = await headers();
  return createTRPCContext({
    req: new Request('http://internal', { headers: headerStore }),
  } as any);
});

const createCaller = createCallerFactory(appRouter);
export const api = createCaller(createContext);
```

## Details

**`inferAsyncReturnType` for the Context type.** Instead of manually defining the `Context` type, derive it from `createTRPCContext` using `inferAsyncReturnType<typeof createTRPCContext>`. This ensures the type stays in sync with the factory function — add a field to the factory and it automatically appears in `ctx` everywhere.

**Context creation runs per request.** `createTRPCContext` is called once per HTTP request (or once per WebSocket connection for subscriptions). Put expensive operations that are needed for every procedure here. Avoid per-procedure lookups that should be shared (e.g., loading the user's organization).

**Database connection patterns:**

- Prisma: import a singleton `db` instance and include it in context. Prisma manages the connection pool internally.
- Drizzle: same pattern — import the `db` instance.
- Raw pg/mysql2: create a connection per request or use a pool; return the client in context and close it after the request (use `responseMeta` or adapter lifecycle hooks).

**Context vs middleware for auth.** The context factory can include the session (as shown above), but it should NOT throw if the session is absent — some procedures are public. Use middleware to enforce auth on specific procedures. The context factory just makes data available; middleware enforces access control.

**Testing with custom context.** For unit tests, create a caller with a mock context using `createCallerFactory`:

```typescript
const caller = createCallerFactory(appRouter)({
  db: mockDb,
  session: { user: { id: 'test-user', role: 'user' } },
  headers: new Headers(),
});

const result = await caller.post.list({});
```

This bypasses HTTP entirely — pure function call with typed inputs and outputs.

## Source

https://trpc.io/docs/server/context
