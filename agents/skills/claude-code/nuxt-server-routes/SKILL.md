# Nuxt Server Routes

> Build fully-typed server API endpoints using Nitro's event-handler model and H3 utilities

## When to Use

- You are creating REST API endpoints inside a Nuxt project under `server/api/` or `server/routes/`
- You need to read request bodies, query parameters, or headers server-side
- You want to return JSON, redirect, or stream responses from a Nuxt backend
- You are migrating Express/Fastify route logic into Nuxt's Nitro layer
- You need to understand how file-based routing maps to HTTP methods

## Instructions

1. Create files under `server/api/` to expose routes at `/api/<name>`. Files under `server/routes/` map to the root path with no `/api/` prefix.
2. Name files using the HTTP method suffix to restrict the method: `users.get.ts`, `users.post.ts`. Omit the suffix to handle all methods.
3. Export a default `defineEventHandler` function — this is the required Nitro entry point:

```typescript
// server/api/users.get.ts
export default defineEventHandler(async (event) => {
  const users = await fetchUsersFromDb();
  return users; // auto-serialized to JSON
});
```

4. Read query parameters with `getQuery`, request body with `readBody`, route params with `getRouterParam`:

```typescript
// server/api/users/[id].get.ts
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  const query = getQuery(event); // ?include=posts
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw createError({ statusCode: 404, message: 'User not found' });
  return user;
});
```

5. Throw errors with `createError` — Nuxt serializes these into structured JSON error responses:

```typescript
throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
```

6. Handle POST/PUT bodies with `readBody` — always validate the shape:

```typescript
// server/api/posts.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body.title) throw createError({ statusCode: 400, message: 'title required' });
  return db.post.create({ data: body });
});
```

7. Set response headers or status manually when needed:

```typescript
setResponseStatus(event, 201);
setHeader(event, 'X-Custom-Header', 'value');
```

8. Return raw non-JSON responses by setting content-type explicitly:

```typescript
setHeader(event, 'Content-Type', 'text/plain');
return 'Hello plain text';
```

9. Use `server/utils/` for shared server-side helpers — these are auto-imported within the `server/` tree.

## Details

Nuxt's server layer is powered by Nitro, which itself uses H3 as its HTTP framework. H3 is a minimal, composable HTTP toolkit where every request is represented as an `H3Event`. All H3 utility functions accept this event as their first argument.

**File-based routing:**

```
server/
  api/
    users.get.ts       → GET  /api/users
    users.post.ts      → POST /api/users
    users/[id].get.ts  → GET  /api/users/:id
    auth/
      login.post.ts    → POST /api/auth/login
  routes/
    feed.xml.get.ts    → GET  /feed.xml
```

**Dynamic catch-all routes:**

Use `[...slug].ts` to match multiple path segments:

```typescript
// server/api/[...slug].ts
export default defineEventHandler((event) => {
  const slug = getRouterParams(event).slug;
  return { path: slug };
});
```

**Middleware within server routes:**

You can apply server-side logic before any handler using `server/middleware/`. Files here run on every request automatically (no registration needed):

```typescript
// server/middleware/auth.ts
export default defineEventHandler((event) => {
  const token = getHeader(event, 'authorization');
  if (!token) throw createError({ statusCode: 401 });
  event.context.user = verifyToken(token);
});
```

**Streaming responses:**

Nitro supports streaming via Web Streams API for large payloads or SSE:

```typescript
export default defineEventHandler((event) => {
  setHeader(event, 'Content-Type', 'text/event-stream');
  return sendStream(event, createReadableStream());
});
```

**Type safety with `$fetch`:**

On the client side, use `$fetch` or `useFetch` — Nuxt infers the return type from the server handler automatically in full-stack TypeScript mode.

**When NOT to use:**

- Heavy CPU tasks — Nitro runs in a single-threaded worker; offload to a queue or worker thread
- File system access in edge deployments — `adapter-cloudflare` and `adapter-vercel-edge` have no Node.js `fs` module

## Source

https://nuxt.com/docs/guide/directory-structure/server
