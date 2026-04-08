# Svelte Server Hooks

> Intercept every request, populate locals, modify responses, and handle errors using SvelteKit's hooks.server.ts

## When to Use

- You need to validate session cookies and attach a user object to every request
- You want to add CORS headers, rate limiting, or logging across all routes
- You need to modify outgoing responses (add security headers, compress, cache)
- You are composing multiple `handle` functions using `sequence`
- You want to capture and report unhandled server errors

## Instructions

**handle — the main request hook:**

1. Export a `handle` function from `src/hooks.server.ts`. It intercepts every request and must call `resolve(event)` to continue:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Runs before load functions and routes
  const response = await resolve(event);
  // Runs after
  return response;
};
```

2. Attach per-request data to `event.locals` — accessible in all load functions and actions:

```typescript
export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session_id');

  if (sessionId) {
    event.locals.user = await db.session.findUser(sessionId);
  }

  return resolve(event);
};
```

```typescript
// src/app.d.ts — declare the locals shape
declare global {
  namespace App {
    interface Locals {
      user: User | null;
    }
  }
}
export {};
```

3. Short-circuit a request (bypass routing) by returning a response directly:

```typescript
export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api') && !event.locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  return resolve(event);
};
```

4. Modify the resolved response to add security headers:

```typescript
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
};
```

5. Use `transformPageChunk` to modify HTML output (inject scripts, replace placeholders):

```typescript
const response = await resolve(event, {
  transformPageChunk: ({ html }) => html.replace('%theme%', event.locals.theme ?? 'light'),
});
```

**sequence — composing multiple handle functions:**

6. Use `sequence` from `@sveltejs/kit/hooks` to chain multiple handle functions cleanly:

```typescript
import { sequence } from '@sveltejs/kit/hooks';
import { auth } from './hooks/auth';
import { logging } from './hooks/logging';
import { security } from './hooks/security';

export const handle = sequence(auth, logging, security);
```

Each function in the sequence calls `resolve(event)` to pass to the next.

**handleFetch — modifying server-side fetch calls:**

7. Intercept `fetch` calls made inside load functions (only on the server during SSR):

```typescript
import type { HandleFetch } from '@sveltejs/kit';

export const handleFetch: HandleFetch = async ({ request, fetch }) => {
  // Rewrite internal API calls to avoid the network round-trip
  if (request.url.startsWith('https://myapp.com/api/')) {
    const url = request.url.replace('https://myapp.com', 'http://localhost:3000');
    return fetch(new Request(url, request));
  }
  return fetch(request);
};
```

**handleError — unhandled server errors:**

8. Capture and report unexpected errors. The return value shapes what `$page.error` contains:

```typescript
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = async ({ error, event, status, message }) => {
  const errorId = crypto.randomUUID();

  // Log to your error tracking service
  await reportError({ error, errorId, url: event.url.pathname });

  // Return safe error info (never expose internals)
  return {
    message: 'An unexpected error occurred',
    errorId,
  };
};
```

**Client hooks (hooks.client.ts):**

9. Export `handleError` from `src/hooks.client.ts` to capture client-side errors:

```typescript
// src/hooks.client.ts
import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error, event }) => {
  Sentry.captureException(error);
  return { message: 'Something went wrong' };
};
```

## Details

**Execution order:**

```
Request
  → handle (hooks.server.ts)
    → layout load (+layout.server.ts)
      → page load (+page.server.ts)
        → page renders
      ← response
    ← response
  ← handle (can modify)
Response
```

**locals type safety:**

Always declare your `App.Locals` interface in `src/app.d.ts`. TypeScript will then infer the correct types when you access `event.locals` in load functions and actions.

**Auth pattern:**

```typescript
// hooks/auth.ts
import type { Handle } from '@sveltejs/kit';

export const auth: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get('auth_token');
  event.locals.user = token ? await verifyToken(token) : null;
  return resolve(event);
};

// Any load function:
export const load: PageServerLoad = ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  return { user: locals.user };
};
```

**CORS for API routes:**

```typescript
export const handle: Handle = async ({ event, resolve }) => {
  if (event.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const response = await resolve(event);
  response.headers.set('Access-Control-Allow-Origin', '*');
  return response;
};
```

**handleFetch use cases:**

- Replace public API URLs with internal service URLs during SSR (avoid DNS round-trip)
- Inject auth headers into all server-side fetch calls
- Mock API calls in test environments

## Source

https://kit.svelte.dev/docs/hooks
