# Astro Server Endpoints

> Build REST API routes, webhooks, and form handlers inside your Astro project using `.ts` endpoint files and the middleware API.

## When to Use

- You need a GET or POST handler in the same project as your Astro pages (form submissions, data APIs, webhooks)
- You want to keep backend logic co-located with your frontend without spinning up a separate server
- You are building an authenticated route that reads cookies or headers on each request
- You need middleware to run before every request (auth checks, logging, locale detection)
- You are in SSR or hybrid mode and need dynamic data endpoints

## Instructions

1. Create endpoint files in `src/pages/` with a `.ts` or `.js` extension. The file path maps to the URL, same as page routing:
   - `src/pages/api/hello.ts` → `GET /api/hello`
   - `src/pages/api/posts/[id].ts` → `GET/POST /api/posts/:id`

2. Export named functions for each HTTP method you want to handle. Function names must be uppercase:

```typescript
// src/pages/api/posts.ts
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, url, cookies, locals }) => {
  const tag = url.searchParams.get('tag');
  const posts = await fetchPosts(tag);
  return new Response(JSON.stringify(posts), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  if (!body.title) {
    return new Response(JSON.stringify({ error: 'title is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const post = await createPost(body);
  return new Response(JSON.stringify(post), { status: 201 });
};
```

3. Use `context.request` to read the raw `Request` object. Parse the body based on content type:

```typescript
// JSON body
const data = await request.json();

// Form data
const formData = await request.formData();
const email = formData.get('email') as string;

// Raw text
const text = await request.text();

// Request headers
const auth = request.headers.get('authorization');
```

4. Read and set cookies via `context.cookies`:

```typescript
export const GET: APIRoute = async ({ cookies }) => {
  const token = cookies.get('session')?.value;
  if (!token) return new Response(null, { status: 401 });

  cookies.set('last-visit', new Date().toISOString(), {
    httpOnly: true,
    secure: true,
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  });

  return new Response('OK');
};
```

5. Create middleware at `src/middleware.ts` to run logic before every request. Use `defineMiddleware` and call `next()` to continue the chain:

```typescript
// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const token = context.cookies.get('session')?.value;
  context.locals.user = token ? await validateToken(token) : null;

  // Block unauthenticated access to /dashboard
  if (context.url.pathname.startsWith('/dashboard') && !context.locals.user) {
    return context.redirect('/login');
  }

  return next(); // proceed to page/endpoint handler
});
```

6. Chain multiple middleware functions with `sequence()` from `astro:middleware`:

```typescript
import { defineMiddleware, sequence } from 'astro:middleware';

const auth = defineMiddleware(async (ctx, next) => {
  /* ... */ return next();
});
const logging = defineMiddleware(async (ctx, next) => {
  console.log(`${ctx.request.method} ${ctx.url.pathname}`);
  return next();
});

export const onRequest = sequence(logging, auth);
```

7. Add types for `locals` to get IntelliSense in middleware and pages. Augment the `App.Locals` interface in `env.d.ts`:

```typescript
// src/env.d.ts
/// <reference types="astro/client" />
interface Locals {
  user: { id: string; email: string } | null;
}
```

8. In SSG mode, endpoints with `GET` handlers can generate static files (JSON, XML, RSS). Export `getStaticPaths()` from a dynamic endpoint file to generate multiple static output files.

## Details

Astro endpoints use the standard Web `Request`/`Response` API — the same API available in Cloudflare Workers, Deno, and modern Node.js. This means your endpoint logic is portable across runtimes without an adapter-specific API.

**SSG vs. SSR endpoints:**

In SSG mode, only `GET` handlers are useful. The build calls each `GET` handler and writes the response body to a static file. A `src/pages/feed.xml.ts` with `export const GET` produces a static `dist/feed.xml`.

In SSR mode, all HTTP methods work and endpoints are invoked on every request. This is where POST, PUT, DELETE, and PATCH handlers are useful.

**`prerender` per endpoint:**

In `output: 'hybrid'` mode, endpoints are server-rendered by default. Add `export const prerender = true` to opt a specific endpoint into static generation. In `output: 'server'` mode, endpoints are server-rendered by default; add `export const prerender = true` to force static output.

**Error handling:**

Always return a `Response` — never throw from an endpoint. If you need to return an error, construct a `Response` with the appropriate status code. Unhandled throws will produce a 500 with an Astro error page.

**`locals` — the middleware/page contract:**

`context.locals` is a mutable plain object scoped to the current request. Set values in middleware, read them in pages and endpoints. This is the correct way to pass auth state, tenant context, or feature flags from middleware to handlers.

**Rate limiting and edge cases:**

Astro has no built-in rate limiting. Implement rate limiting in middleware using a memory store (for single-instance) or an external store (Redis, KV for edge). Check `context.clientAddress` for the caller's IP — this is populated correctly when behind a reverse proxy if the adapter is configured for it.

## Source

https://docs.astro.build/en/guides/endpoints
