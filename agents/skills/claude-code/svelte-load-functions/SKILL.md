# Svelte Load Functions

> Fetch route data before rendering using SvelteKit's load functions — server-only, universal, streaming, and invalidation patterns

## When to Use

- You need to fetch data before a page renders (and show it server-side)
- You are choosing between `+page.ts` (universal) and `+page.server.ts` (server-only)
- You need access to database clients, cookies, or session data in your load function
- You want to stream slow data to the browser without blocking the initial render
- You need to invalidate and re-fetch data after a form action or user interaction

## Instructions

**Server load (+page.server.ts):**

1. Use `+page.server.ts` when you need secrets, database access, cookies, or server-only APIs. This function never runs in the browser:

```typescript
// src/routes/users/[id]/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
  const user = await locals.db.user.findUnique({
    where: { id: params.id },
  });

  if (!user) throw error(404, 'User not found');

  return { user };
};
```

2. Access the authenticated session via `locals` (set in `hooks.server.ts`):

```typescript
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  return { user: locals.user };
};
```

**Universal load (+page.ts):**

3. Use `+page.ts` for load functions that can run on both server (initial request) and client (navigation). Use the provided `fetch` — it is enhanced by SvelteKit for deduplication and credentials:

```typescript
// src/routes/posts/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, params }) => {
  const res = await fetch(`/api/posts?page=${params.page ?? 1}`);
  const posts = await res.json();
  return { posts };
};
```

**Accessing load data in the page:**

4. Receive `data` as a prop (Svelte 5 with `$props`) or as `export let data` (Svelte 4):

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import type { PageData } from './$types'
  let { data }: { data: PageData } = $props()
</script>

{#each data.posts as post}
  <article>{post.title}</article>
{/each}
```

**Error handling:**

5. Throw `error` or `redirect` from `@sveltejs/kit` to trigger the error page or redirect:

```typescript
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const post = await getPost(params.slug);
  if (!post) throw error(404, { message: 'Post not found' });
  if (post.status === 'draft') redirect(303, '/');
  return { post };
};
```

**Layout loads:**

6. Add a `+layout.server.ts` to provide data to all pages in a route segment. Layout data is merged with page data:

```typescript
// src/routes/(app)/+layout.server.ts
export const load: LayoutServerLoad = async ({ locals }) => {
  return { currentUser: locals.user };
};
```

**Streaming with promises:**

7. Return a promise for slow data to stream it to the client without blocking the initial render. Wrap the slow part in `{#await}`:

```typescript
// +page.server.ts
export const load: PageServerLoad = async ({ params }) => {
  // fast — included in initial HTML
  const product = await getProduct(params.id);

  // slow — streamed after initial render
  const reviews = getReviews(params.id); // not awaited

  return { product, reviews };
};
```

```svelte
<!-- +page.svelte -->
{#await data.reviews}
  <p>Loading reviews...</p>
{:then reviews}
  {#each reviews as review}<Review {review} />{/each}
{/await}
```

**Invalidation:**

8. Use `depends('app:tag')` to declare a custom dependency; call `invalidate('app:tag')` to re-run the load function:

```typescript
// load function
export const load: PageLoad = async ({ fetch, depends }) => {
  depends('app:cart');
  const cart = await fetch('/api/cart').then((r) => r.json());
  return { cart };
};

// After updating cart:
import { invalidate } from '$app/navigation';
await invalidate('app:cart');
```

9. Use `invalidateAll()` to re-run all load functions on the current page.

## Details

**Server vs. universal load — decision matrix:**

| Need                        | Use               |
| --------------------------- | ----------------- |
| Database access             | `+page.server.ts` |
| Cookies / session           | `+page.server.ts` |
| Secret env vars             | `+page.server.ts` |
| Works without JS            | `+page.server.ts` |
| Runs on CDN edge            | `+page.ts`        |
| Client-side navigation data | `+page.ts`        |
| Public API, no secrets      | Either            |

**Data merging:**

When a route has both `+layout.server.ts` and `+page.server.ts`, SvelteKit merges the returned data. If both return a key with the same name, the page-level value wins.

**Type generation:**

SvelteKit generates types for `PageData`, `PageServerLoad`, `LayoutLoad`, and `LayoutServerLoad` in `.svelte-kit/types/`. Always import from `./$types` to get the correct inferred types.

**The `parent` function:**

Load functions can await parent layout data via `parent()`:

```typescript
export const load: PageLoad = async ({ parent }) => {
  const { user } = await parent();
  return { greeting: `Hello, ${user.name}` };
};
```

**Fetch in load vs. $fetch:**

Always use the `fetch` provided by SvelteKit's load function — it:

- Includes credentials (cookies) when fetching same-origin
- Deduplicates identical requests within the same render cycle
- Works correctly on both server and client

Do not use the global `fetch` directly inside load functions.

## Source

https://kit.svelte.dev/docs/load
