# Svelte Error Pages

> Handle 404s, auth failures, and unexpected crashes in SvelteKit with +error.svelte, the error() helper, and handleError hooks

## When to Use

- You need to show a custom error page for 404s, 403s, or other HTTP errors thrown in load functions
- You want to customize the error UI per route segment (nested error boundaries)
- You need to capture unexpected server errors and report them to an error tracking service
- You are unsure when to use `error()` vs. throwing raw errors vs. returning `fail()`

## Instructions

**Defining error pages:**

1. Create `+error.svelte` in any route directory. It catches errors thrown by the load functions in that route segment and all its children:

```svelte
<!-- src/routes/+error.svelte — global error boundary -->
<script lang="ts">
  import { page } from '$app/stores'
</script>

<h1>{$page.status}: {$page.error?.message}</h1>

{#if $page.status === 404}
  <p>This page doesn't exist.</p>
  <a href="/">Go home</a>
{:else}
  <p>Something went wrong. Please try again.</p>
{/if}
```

2. Add nested `+error.svelte` files for section-specific error UIs. The nearest ancestor `+error.svelte` catches the error:

```
routes/
  +error.svelte           → global fallback
  blog/
    +error.svelte         → blog-specific errors
    [slug]/
      +page.server.ts     → throws error(404)
                            → caught by blog/+error.svelte
```

**Throwing expected errors:**

3. Use the `error` helper from `@sveltejs/kit` for expected, anticipated errors (404, 401, 403). These are shown to the user via `+error.svelte`:

```typescript
// +page.server.ts
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const post = await db.post.findUnique({ where: { slug: params.slug } });

  if (!post) throw error(404, 'Post not found');
  if (!post.published) throw error(403, 'This post is not published');

  return { post };
};
```

4. Pass a structured message object instead of a string for richer error data:

```typescript
throw error(422, { message: 'Validation failed', field: 'email' });
```

Access in `+error.svelte`:

```svelte
<p>{$page.error?.message}</p>
```

**Unexpected errors:**

5. Unhandled exceptions (thrown objects that are not SvelteKit errors) are treated as 500 errors. SvelteKit will NOT expose the error message to the client — only the `handleError` hook's return value is shown:

```typescript
// This exception message is NEVER shown to users
throw new Error('Database connection string exposed!');

// handleError in hooks.server.ts controls what users see:
export const handleError: HandleServerError = ({ error }) => {
  return { message: 'An internal error occurred. Please try again.' };
};
```

**Redirecting from error pages:**

6. Throw `redirect` from `@sveltejs/kit` to navigate the user rather than showing an error:

```typescript
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  return { user: locals.user };
};
```

**Custom error shape:**

7. Extend the `App.Error` interface to add fields to `$page.error`:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Error {
      message: string;
      errorId?: string;
      code?: string;
    }
  }
}
```

```typescript
// hooks.server.ts
export const handleError: HandleServerError = async ({ error, status }) => {
  const errorId = crypto.randomUUID();
  await reportError(error, errorId);
  return {
    message: status === 404 ? 'Page not found' : 'Something went wrong',
    errorId,
  };
};
```

```svelte
<!-- +error.svelte -->
{#if $page.error?.errorId}
  <small>Error ID: {$page.error.errorId}</small>
{/if}
```

## Details

**Expected vs. unexpected errors:**

| Type       | How thrown                 | User sees                  | Logged                  |
| ---------- | -------------------------- | -------------------------- | ----------------------- |
| Expected   | `throw error(4xx, msg)`    | The message directly       | No (by design)          |
| Unexpected | `throw new Error(...)`     | `handleError` return value | Yes (via `handleError`) |
| Redirect   | `throw redirect(3xx, url)` | Navigation                 | No                      |

**error() vs. fail():**

- `error()` — terminates the load function, shows the `+error.svelte` page
- `fail()` — only valid in form actions, re-renders the page with error data in the `form` prop

Never use `fail()` in load functions; never use `error()` in actions when you want to re-display the form.

**Layout-level errors:**

If an error is thrown in a layout load function, the nearest ancestor `+error.svelte` catches it — not a sibling of the layout. This means errors in `(app)/+layout.server.ts` render the `(app)/+error.svelte`, not the root `+error.svelte`.

**The root error page:**

The root `src/routes/+error.svelte` is the last resort. If this page itself throws an error, SvelteKit falls back to a static error page generated from `src/error.html` (if it exists) or a plain text response.

**$page.status:**

The `$page.status` reactive value reflects the HTTP status code of the current page, including error pages. Use it to render different UI for 404 vs. 500 errors.

## Source

https://kit.svelte.dev/docs/errors
