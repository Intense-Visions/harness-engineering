# Nuxt Composables Pattern

> Fetch data and coordinate async state across server and client using Nuxt's built-in composables

## When to Use

- You need to fetch data in a Nuxt page or component with SSR/SSG support
- You want to avoid duplicate requests (server fetches, client rehydrates)
- You are choosing between `useFetch`, `useAsyncData`, and `useLazyFetch`
- You need access to the Nuxt application instance (`useNuxtApp`) for plugins or runtime config

## Instructions

1. Use `useFetch` as the default for HTTP requests — it wraps `useAsyncData` + `$fetch` and handles SSR deduplication automatically:

```typescript
// pages/posts/[id].vue
const { data: post, pending, error } = await useFetch(`/api/posts/${route.params.id}`);
```

2. Use `useAsyncData` when the async operation is not a simple HTTP call (e.g., database query via a server composable, computed key based on reactive state):

```typescript
const { data: user } = await useAsyncData(
  'user-profile', // unique cache key — required
  () => fetchUserProfile(userId.value),
  { watch: [userId] } // re-fetch when userId changes
);
```

3. Use `useLazyFetch` / `useLazyAsyncData` to defer data loading — the page renders immediately and `pending` is true until data arrives:

```typescript
// Good for non-critical data below the fold
const { data: comments, pending } = useLazyFetch('/api/comments');
```

4. Always provide a unique string key to `useAsyncData`. Keys collide across components — use route params or namespacing to avoid cache pollution.

5. Use `$fetch` directly only in event handlers (button clicks, form submissions) — not at the top of `setup()`, which would bypass SSR deduplication:

```typescript
// Good: event handler
async function submitForm() {
  await $fetch('/api/contact', { method: 'POST', body: formData.value });
}

// Bad: top-level setup — use useFetch instead
const data = await $fetch('/api/posts'); // runs on both server AND client
```

6. Transform responses inline with the `transform` option to avoid storing raw API shapes:

```typescript
const { data: posts } = await useFetch('/api/posts', {
  transform: (raw) => raw.items.map((p) => ({ id: p.id, title: p.title })),
});
```

7. Access Nuxt internals with `useNuxtApp()`:

```typescript
const { $toast, $i18n, ssrContext } = useNuxtApp();
```

## Details

Nuxt's data fetching composables solve a fundamental SSR problem: if you use plain `fetch()` or `axios` in `setup()`, the request fires on the server during SSR and again on the client during hydration — doubling your API calls. `useFetch` and `useAsyncData` solve this by serializing the server-fetched data into the HTML payload and rehydrating it on the client without a second network request.

**Key differences:**

| Composable         | Use case                          | Blocks navigation |
| ------------------ | --------------------------------- | ----------------- |
| `useFetch`         | Simple HTTP calls                 | Yes (await)       |
| `useAsyncData`     | Custom async logic, reactive keys | Yes (await)       |
| `useLazyFetch`     | Non-blocking HTTP                 | No                |
| `useLazyAsyncData` | Non-blocking custom async         | No                |
| `$fetch`           | Event handlers only               | N/A               |

**Cache key design:**

`useAsyncData` keys are global within a Nuxt app instance. Two components using `useAsyncData('posts', ...)` will share data. This is often desired (shared cache) but causes bugs when the same key is used with different fetch functions. Pattern: `<entity>-<id>` or `<page>-<section>`.

**Error handling:**

```typescript
const { data, error } = await useFetch('/api/posts');
if (error.value) {
  throw createError({ statusCode: 500, message: 'Failed to load posts' });
}
```

**Refreshing data:**

```typescript
const { data, refresh } = await useFetch('/api/posts');
// Later:
await refresh();
```

## Source

https://nuxt.com/docs/getting-started/data-fetching
