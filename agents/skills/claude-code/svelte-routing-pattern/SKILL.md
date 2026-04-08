# Svelte Routing Pattern

> Build SvelteKit routes using the file-system convention with +page.svelte, +layout.svelte, route groups, and dynamic segments

## When to Use

- You are adding new routes to a SvelteKit application
- You need to understand how `+page.svelte`, `+layout.svelte`, and their server counterparts relate
- You need dynamic route segments (e.g., `/users/[id]`), catch-all routes, or optional params
- You want to share layout UI (nav, sidebar) across a group of routes without affecting the URL

## Instructions

**Basic file structure:**

1. Every route is a directory in `src/routes/`. The `+page.svelte` file renders the page content:

```
src/routes/
  +page.svelte          → /
  +layout.svelte        → wraps all pages
  about/
    +page.svelte        → /about
  blog/
    +page.svelte        → /blog
    [slug]/
      +page.svelte      → /blog/:slug
```

2. Create a layout by adding `+layout.svelte` — it wraps all sibling and descendant pages. Use `<slot />` to render child content:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import Nav from '$lib/components/Nav.svelte'
  let { children } = $props()
</script>

<Nav />
<main>
  {@render children()}
</main>
```

**Dynamic segments:**

3. Use `[param]` for dynamic route segments. Read them via `$page.params` or from the load function:

```
routes/
  users/
    [id]/
      +page.svelte      → /users/:id
      +page.server.ts   → server load for this route
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { page } from '$app/stores'
  const userId = $page.params.id
</script>
```

4. Use `[...rest]` for catch-all segments that match one or more path parts:

```
routes/
  docs/
    [...path]/
      +page.svelte      → /docs/a/b/c — params.path = 'a/b/c'
```

5. Use `[[optional]]` for optional segments:

```
routes/
  [[lang]]/
    +page.svelte        → / and /:lang both match
```

**Route groups — layout without URL impact:**

6. Wrap routes in parentheses to create a group that shares a layout without affecting the URL:

```
routes/
  (marketing)/
    +layout.svelte      → marketing layout
    +page.svelte        → /
    about/
      +page.svelte      → /about
  (app)/
    +layout.svelte      → app layout with auth check
    dashboard/
      +page.svelte      → /dashboard
```

**Navigation:**

7. Use `<a>` tags for client-side navigation — SvelteKit intercepts them automatically. Use `goto` for programmatic navigation:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation'

  async function handleSubmit() {
    await submitForm()
    goto('/dashboard')
  }
</script>

<a href="/about">About</a>
```

8. Preload data on hover using the `data-sveltekit-preload-data` attribute:

```svelte
<a href="/expensive-page" data-sveltekit-preload-data="hover">Load on hover</a>
```

**Named layouts (breaking out of parent layouts):**

9. Reset the layout inheritance by naming the layout file `+layout-reset.svelte` or using the `@` syntax for matching a specific ancestor:

```
routes/
  +layout.svelte        → root layout
  admin/
    +layout.svelte      → admin layout
    +layout@.svelte     → reset: only uses root layout
```

## Details

**File naming reference:**

| File                | Purpose                          |
| ------------------- | -------------------------------- |
| `+page.svelte`      | Page UI component                |
| `+page.ts`          | Universal load (client + server) |
| `+page.server.ts`   | Server-only load + form actions  |
| `+layout.svelte`    | Layout wrapper with `<slot />`   |
| `+layout.ts`        | Universal layout load            |
| `+layout.server.ts` | Server-only layout load          |
| `+error.svelte`     | Error boundary for the route     |
| `+server.ts`        | API endpoint (no UI)             |

**Data flow:**

Parent layout `load()` runs before child page `load()`. Data from a layout load is available to all descendant pages. Data does not flow upward.

**$page store:**

The `$page` store from `$app/stores` provides reactive access to the current route:

```typescript
import { page } from '$app/stores';

$page.url; // URL object
$page.params; // route params
$page.data; // merged data from all load functions
$page.status; // HTTP status
$page.error; // error object if on error page
```

**Nested layouts and data isolation:**

Each layout can have its own load function. The `data` prop in a layout component only receives data from that layout's load — not child page data. Use `$page.data` to read the full merged data object.

**API routes:**

Use `+server.ts` for routes that return JSON or other non-HTML responses:

```typescript
// src/routes/api/users/+server.ts
import { json } from '@sveltejs/kit';

export const GET = async ({ locals }) => {
  const users = await locals.db.users.findMany();
  return json(users);
};
```

## Source

https://kit.svelte.dev/docs/routing
