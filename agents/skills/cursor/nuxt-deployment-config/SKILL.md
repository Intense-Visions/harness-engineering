# Nuxt Deployment Config

> Target Node.js servers, edge runtimes, static hosting, or hybrid modes using Nitro presets and route rules

## When to Use

- You are preparing a Nuxt app for production deployment to Vercel, Cloudflare, Netlify, or a Node server
- You need to prerender specific pages for static hosting while keeping others server-rendered
- You want ISR (Incremental Static Regeneration) — cached SSR with time-based revalidation
- You are hitting cold start latency on serverless and need edge rendering

## Instructions

**Selecting an output preset:**

1. Set the Nitro preset via the `NITRO_PRESET` environment variable or in `nuxt.config.ts`:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: {
    preset: 'vercel-edge', // or 'cloudflare-pages', 'netlify', 'node-server', etc.
  },
});
```

Common presets:

| Preset                  | Target                                   |
| ----------------------- | ---------------------------------------- |
| `node-server` (default) | Node.js server (Docker, Railway, Render) |
| `vercel`                | Vercel serverless functions              |
| `vercel-edge`           | Vercel Edge Network                      |
| `cloudflare-pages`      | Cloudflare Pages + Workers               |
| `netlify`               | Netlify Functions                        |
| `netlify-edge`          | Netlify Edge Functions                   |
| `static`                | Full static export                       |

**Static prerendering:**

2. Prerender specific routes at build time:

```typescript
export default defineNuxtConfig({
  nitro: {
    prerender: {
      routes: ['/sitemap.xml', '/robots.txt', '/'],
      crawlLinks: true, // follow <a> tags from prerendered pages
    },
  },
});
```

3. Mark a page for prerendering from within the page component:

```typescript
definePageMeta({ prerender: true });
```

4. Prerender all pages (full static site):

```typescript
export default defineNuxtConfig({
  ssr: true,
  nitro: {
    prerender: { crawlLinks: true, routes: ['/'] },
  },
});
```

**Hybrid rendering with routeRules:**

5. Apply per-route rendering strategies using `routeRules`:

```typescript
export default defineNuxtConfig({
  routeRules: {
    // Static generation at build time
    '/': { prerender: true },
    '/blog/**': { prerender: true },

    // ISR — revalidate every 60 seconds
    '/products/**': { isr: 60 },

    // Full SSR — no caching
    '/dashboard/**': { ssr: true },

    // SPA-only — no SSR
    '/admin/**': { ssr: false },

    // Redirect
    '/old-page': { redirect: '/new-page' },

    // Headers
    '/api/**': { headers: { 'cache-control': 's-maxage=3600' } },

    // CORS
    '/api/public/**': { cors: true },
  },
});
```

**Client-only mode:**

6. Disable SSR globally for a SPA deployment:

```typescript
export default defineNuxtConfig({
  ssr: false,
});
```

**Edge deployment considerations:**

7. Edge runtimes (Cloudflare Workers, Vercel Edge) have no Node.js APIs. Check compatibility:
   - No `fs` module — use KV stores or R2/S3 for persistence
   - No `process.env` — use Nitro runtime config
   - Bundle size matters — avoid heavy Node.js dependencies

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: {
    preset: 'cloudflare-pages',
    // Polyfill or replace Node APIs
    externals: { traceInclude: ['./server/db.ts'] },
  },
});
```

**Runtime config for deployment variables:**

8. Never hardcode secrets. Use runtime config with environment variables:

```typescript
export default defineNuxtConfig({
  runtimeConfig: {
    // Server-only (private)
    databaseUrl: process.env.DATABASE_URL,
    secretKey: process.env.SECRET_KEY,
    // Exposed to client
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? '/api',
    },
  },
});
```

## Details

**Build output structure:**

Running `nuxt build` produces `.output/`:

```
.output/
  public/    ← static assets, served directly by CDN
  server/    ← Nitro server bundle
    index.mjs  ← server entry point
    chunks/
```

The `.output/server/index.mjs` is environment-agnostic — the preset wraps it for the target platform.

**ISR vs. SWR:**

Both revalidate cached responses in the background:

- `isr: 60` — revalidate every 60 seconds (time-based, Vercel-style)
- `swr: true` — stale-while-revalidate (serve cached, revalidate in background)

**Prerender vs. generate:**

In Nuxt 3, `nuxt generate` is an alias for `nuxt build` with the `static` preset. The `prerender.crawlLinks` option replaces the Nuxt 2 routes array generation.

**Caching headers with routeRules:**

The `headers` rule sets response headers on the Nitro server. For CDN caching, use `s-maxage`; for browser caching, use `max-age`:

```typescript
'/assets/**': { headers: { 'cache-control': 'max-age=31536000, immutable' } }
```

**When to use each rendering mode:**

- **Prerender** — marketing pages, docs, blogs (content rarely changes, maximum CDN cache hit rate)
- **ISR** — product listings, news feeds (content changes periodically, acceptable staleness)
- **SSR** — user dashboards, personalized pages (must be fresh per request)
- **SPA** — admin panels, apps behind auth (SEO not needed, maximum interactivity)

## Source

https://nuxt.com/docs/getting-started/deployment

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
