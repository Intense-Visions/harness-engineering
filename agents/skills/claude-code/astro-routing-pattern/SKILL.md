# Astro Routing Pattern

> File-based routing maps your `src/pages/` directory structure to URLs — static, dynamic, and rest-parameter routes all follow the same filesystem convention.

## When to Use

- You are creating new pages or routes in an Astro project
- You need dynamic routes (e.g., `/blog/[slug]`) and must implement `getStaticPaths()`
- You want to use rest parameters for catch-all or paginated routes
- You are configuring redirects, custom 404 pages, or route priority
- You are moving from SSG to SSR and need to understand which routing behaviors change

## Instructions

1. Create files in `src/pages/` to define routes. The file path maps directly to the URL:
   - `src/pages/index.astro` → `/`
   - `src/pages/about.astro` → `/about`
   - `src/pages/blog/index.astro` → `/blog`
   - `src/pages/blog/first-post.astro` → `/blog/first-post`

2. Use bracket syntax for dynamic route segments. The bracket name becomes the param key:
   - `src/pages/blog/[slug].astro` → `/blog/:slug`
   - `src/pages/[lang]/about.astro` → `/:lang/about`

3. Implement `getStaticPaths()` in every dynamic route page used in SSG mode. It must return an array of `{ params }` objects:

```astro
---
// src/pages/blog/[slug].astro
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map((post) => ({
    params: { slug: post.slug },
    props: { post },          // pass data to avoid re-fetching in frontmatter
  }));
}

const { post } = Astro.props;
const { Content } = await post.render();
---
<article>
  <h1>{post.data.title}</h1>
  <Content />
</article>
```

4. Use rest parameters (`[...slug]`) for nested dynamic routes and catch-all paths:
   - `src/pages/docs/[...slug].astro` matches `/docs/`, `/docs/guide`, `/docs/guide/intro`
   - Access via `Astro.params.slug` — it will be `undefined` (root), `'guide'`, or `'guide/intro'`

5. Implement pagination with `paginate()` inside `getStaticPaths()`:

```typescript
export async function getStaticPaths({ paginate }) {
  const posts = await getCollection('blog');
  const sorted = posts.sort((a, b) => b.data.pubDate - a.data.pubDate);
  return paginate(sorted, { pageSize: 10 });
}

const { page } = Astro.props;
// page.data: current page items
// page.currentPage: page number (1-indexed)
// page.url.next / page.url.prev: adjacent page URLs
```

6. Create `src/pages/404.astro` for a custom 404 page. In SSR mode this file is served for unmatched routes; in SSG it depends on the host.

7. Use `Astro.redirect()` for programmatic redirects in SSR mode. In SSG, configure redirects in `astro.config.mjs`:

```javascript
// astro.config.mjs
export default defineConfig({
  redirects: {
    '/old-path': '/new-path',
    '/blog/[slug]': '/posts/[slug]', // dynamic redirect
  },
});
```

8. Understand route priority when multiple routes could match the same URL:
   - Static routes win over dynamic: `/about` beats `[slug]`
   - More specific dynamic routes win: `/blog/[slug]` beats `/[...rest]`
   - Named rest params lose to all other patterns

## Details

Astro's file-based router has no runtime overhead in SSG mode — all route resolution happens at build time, producing a flat directory of `.html` files. In SSR mode, the router resolves requests at the edge/server using the same file structure.

**`getStaticPaths()` contract:**

This function is called once per dynamic route file during the build. It must return a serializable array — the return value is cached and cannot be async per-entry (do all async work inside the function before mapping). Every params combination returned becomes a generated page. If a param is missing from the return value, that URL will 404.

**Passing props through `getStaticPaths()`:**

The `props` key in each `getStaticPaths()` return object is merged into `Astro.props` for that specific page. This is the correct way to pass fetched data (collection entries, API responses) into the page frontmatter without a second network/file-system round-trip.

**`params` vs. `Astro.params`:**

- `params` in `getStaticPaths()` — the object you define that shapes the URL segments
- `Astro.params` — the resolved param values available in the frontmatter at render time. In SSG they match the params object you returned. In SSR they come from the live request URL.

**Endpoint routes:**

Files in `src/pages/` with `.ts` or `.js` extensions (not `.astro`) become API endpoints, not HTML pages. See astro-server-endpoints for that pattern.

**Named groups and optional segments (Astro 4+):**

- Optional params: `[...slug]` already acts as optional (can match zero segments)
- For a truly optional single segment, use `[slug]` with a rest route fallback or handle `undefined` in SSR

**Hybrid SSR and routing:**

In `output: 'hybrid'` mode, every page is static by default. Add `export const prerender = false` to opt specific pages into SSR. Dynamic route pages in SSR do not need `getStaticPaths()` — `Astro.params` is populated from the live request.

## Source

https://docs.astro.build/en/guides/routing

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
