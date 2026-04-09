# Nuxt Middleware Pattern

> Protect routes, redirect unauthenticated users, and transform navigation using Nuxt's layered middleware system

## When to Use

- You need to redirect unauthenticated or unauthorized users before a page renders
- You want to run logic on every navigation (analytics, breadcrumb updates, locale detection)
- You need server-side request interception (rate limiting, auth header validation, logging)
- You are implementing per-page access control using `definePageMeta`

## Instructions

**Route middleware (client + server navigation guards):**

1. Create files in `middleware/` — they run during navigation, before the target page component renders.
2. Use `navigateTo` to redirect or `abortNavigation` to cancel:

```typescript
// middleware/auth.ts
export default defineNuxtRouteMiddleware((to, from) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated.value) {
    return navigateTo('/login');
  }
});
```

3. Apply middleware to a page with `definePageMeta`:

```typescript
// pages/dashboard.vue
<script setup lang="ts">
definePageMeta({
  middleware: 'auth'           // single
  // middleware: ['auth', 'role-check']  // multiple, runs in order
})
</script>
```

4. Use global middleware by naming the file with a `.global` suffix — it runs on every route automatically:

```typescript
// middleware/analytics.global.ts
export default defineNuxtRouteMiddleware((to) => {
  trackPageView(to.fullPath);
});
```

5. Define inline anonymous middleware directly in `definePageMeta` for one-off page guards:

```typescript
definePageMeta({
  middleware: [
    async function (to, from) {
      const allowed = await checkPermission(to.params.id);
      if (!allowed) abortNavigation(createError({ statusCode: 403 }));
    },
  ],
});
```

**Server middleware (HTTP-level interception):**

6. Create files in `server/middleware/` — these run on every incoming HTTP request before any server route:

```typescript
// server/middleware/cors.ts
export default defineEventHandler((event) => {
  setHeader(event, 'Access-Control-Allow-Origin', '*');
  setHeader(event, 'Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
});
```

7. Use `event.context` to pass data from server middleware to route handlers:

```typescript
// server/middleware/auth.ts
export default defineEventHandler(async (event) => {
  const token = getCookie(event, 'auth_token');
  if (token) {
    event.context.user = await verifyToken(token);
  }
});
```

**Auth pattern — combining both layers:**

```typescript
// middleware/auth.ts (client-side guard)
export default defineNuxtRouteMiddleware(() => {
  const user = useSupabaseUser();
  if (!user.value) return navigateTo('/login');
});

// server/api/protected.get.ts (server-side validation)
export default defineEventHandler((event) => {
  if (!event.context.user) throw createError({ statusCode: 401 });
  return { secret: 'data' };
});
```

## Details

Nuxt has two distinct middleware layers that serve different purposes:

**Route middleware** runs in the Vue Router navigation cycle on the client (and during SSR navigation). It has access to the full Nuxt composable context (`useNuxtApp`, `useRuntimeConfig`, etc.) and is the right place for UI-level auth checks, redirects, and analytics.

**Server middleware** runs in Nitro's HTTP pipeline before any route handler. It operates on raw H3 events with no access to Vue reactivity. This is where you handle CORS, rate limiting, auth token validation, and request logging.

**Execution order for route middleware:**

1. Global middleware (alphabetical by filename)
2. Page-level middleware (in the order listed in `definePageMeta`)

**SSR vs. CSR behavior:**

Route middleware runs on both server (during initial SSR render) and client (on subsequent navigations). Guard against environment-specific APIs:

```typescript
export default defineNuxtRouteMiddleware(() => {
  if (import.meta.server) return; // skip on server
  initClientOnlyAnalytics();
});
```

**Redirecting with status codes:**

```typescript
return navigateTo('/new-path', { redirectCode: 301 });
```

**Error handling in middleware:**

Throw errors to trigger the Nuxt error page:

```typescript
throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
```

**When NOT to use:**

- Data fetching that belongs in `useAsyncData` — middleware is for guards, not loading page data
- Server middleware for client-only concerns (session UI state, theme, etc.)

## Source

https://nuxt.com/docs/guide/directory-structure/middleware

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
