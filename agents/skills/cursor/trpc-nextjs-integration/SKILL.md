# tRPC Next.js Integration

> Integrate tRPC with Next.js App Router using the fetch adapter, server-side callers, and React Server Components

## When to Use

- Setting up tRPC in a Next.js App Router project
- Calling tRPC procedures from React Server Components (RSC) without an HTTP round-trip
- Creating server-side callers for use in `generateStaticParams`, `getServerSideProps` equivalents, or route handlers
- Sharing the same tRPC procedures between client components (via `useQuery`) and server components (via direct caller)

## Instructions

### 1. Create the Next.js API route handler

```typescript
// app/api/trpc/[trpc]/route.ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/root';
import { createTRPCContext } from '@/server/context';
import { type NextRequest } from 'next/server';

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ req }),
  });

export { handler as GET, handler as POST };
```

### 2. Create the tRPC client for React Client Components

```typescript
// lib/trpc/client.tsx
'use client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/root';

export const api = createTRPCReact<AppRouter>();
```

```typescript
// lib/trpc/provider.tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import { api } from './client';
import superjson from 'superjson';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
        }),
      ],
    })
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
```

### 3. Create a server-side caller for React Server Components

```typescript
// lib/trpc/server.ts
import { createCallerFactory } from '@/server/trpc';
import { appRouter } from '@/server/root';
import { createTRPCContext } from '@/server/context';
import { cache } from 'react';
import { headers } from 'next/headers';

// cache() ensures one context per request (React's request-scoped cache)
const createContext = cache(async () => {
  const heads = new Headers(await headers());
  heads.set('x-trpc-source', 'rsc');
  return createTRPCContext({ req: { headers: heads } as Request });
});

const createCaller = createCallerFactory(appRouter);

export const api = createCaller(createContext);
```

### 4. Call procedures from Server Components

```typescript
// app/posts/page.tsx — React Server Component (no 'use client')
import { api } from '@/lib/trpc/server';

export default async function PostsPage() {
  // Direct procedure call — no HTTP round-trip, no useQuery needed
  const posts = await api.post.list({ limit: 20 });

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

### 5. Use the client API in Client Components

```typescript
// app/posts/NewPostForm.tsx
'use client';
import { api } from '@/lib/trpc/client';

export function NewPostForm() {
  const utils = api.useUtils();
  const createPost = api.post.create.useMutation({
    onSuccess: () => {
      // Invalidate the list query to trigger a refetch
      void utils.post.list.invalidate();
    },
  });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      createPost.mutate({
        title: form.get('title') as string,
        content: form.get('content') as string,
      });
    }}>
      <input name="title" placeholder="Title" />
      <textarea name="content" placeholder="Content" />
      <button type="submit" disabled={createPost.isPending}>Create</button>
    </form>
  );
}
```

### 6. Wrap the app with the provider

```typescript
// app/layout.tsx
import { TRPCProvider } from '@/lib/trpc/provider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
```

## Details

**Two separate `api` objects.** The server `api` (from `lib/trpc/server.ts`) is for Server Components — it calls procedures directly in-process. The client `api` (from `lib/trpc/client.tsx`) is for Client Components — it calls procedures over HTTP. Never import the server `api` in a Client Component (it would bundle server code into the client).

**`cache()` for request-scoped context.** `React.cache()` memoizes the context creation per request in the React Server Component runtime. Without it, every `api.xxx()` call would create a fresh database connection. With it, all RSC procedure calls share one context (and one DB connection) per request.

**`createCallerFactory` vs direct import.** `createCallerFactory(appRouter)` creates a factory for the server-side caller. This is the stable API — do not call `appRouter.createCaller()` directly (deprecated in tRPC v11).

**Hydration and prefetching.** To pre-populate the TanStack Query cache on the server and hydrate it on the client (avoiding a loading flash), use `dehydrate`/`HydrationBoundary` from TanStack Query with tRPC's server API. This pattern is optional but eliminates the initial loading state.

**`httpBatchLink` batches multiple queries.** When a Client Component calls multiple `useQuery` hooks, tRPC batches them into a single HTTP request automatically. This is the default behavior with `httpBatchLink`.

## Source

https://trpc.io/docs/client/nextjs

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
