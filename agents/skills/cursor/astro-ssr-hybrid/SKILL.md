# Astro SSR and Hybrid Rendering

> Control rendering mode at the project level and per-page — combine static pre-rendering with server-side dynamic pages using `output: 'hybrid'` and adapter configuration.

## When to Use

- You need some pages to be server-rendered (authenticated dashboards, personalized content, real-time data) while others stay static
- You are adding authentication, user sessions, or cookie-based personalization to an Astro project
- You want to read `Astro.request` headers, `Astro.cookies`, or `Astro.locals` in a page
- You are selecting an adapter for a deployment target (Vercel, Node.js, Cloudflare)
- You need to understand which features (redirects, cookies, `Astro.params`) are available in SSG vs. SSR mode

## Instructions

1. Set the `output` field and install an adapter in `astro.config.mjs`:

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';

export default defineConfig({
  output: 'server', // all pages are SSR by default
  adapter: vercel(),
});
```

Available `output` values:

- `'static'` (default) — all pages pre-rendered at build time; no server required
- `'server'` — all pages SSR; a server adapter is required
- `'hybrid'` — all pages static by default; opt specific pages into SSR with `prerender = false`

2. In `output: 'hybrid'` mode, opt a page into SSR by exporting `prerender = false`:

```astro
---
// src/pages/dashboard.astro
export const prerender = false; // This page is server-rendered

const user = Astro.locals.user;
if (!user) return Astro.redirect('/login');
const data = await fetchUserData(user.id);
---
<h1>Welcome, {user.name}</h1>
```

3. In `output: 'server'` mode, opt a page into static pre-rendering by exporting `prerender = true`:

```astro
---
// src/pages/about.astro
export const prerender = true; // Pre-render this page at build time
---
<h1>About Us</h1>
```

4. Use `Astro.request` to read request data in SSR pages. This is a standard `Request` object:

```astro
---
export const prerender = false;

const url = new URL(Astro.request.url);
const query = url.searchParams.get('q') ?? '';
const userAgent = Astro.request.headers.get('user-agent');
const clientIp = Astro.clientAddress; // requires adapter support
---
```

5. Read and write cookies with `Astro.cookies`:

```astro
---
export const prerender = false;

// Read a cookie
const theme = Astro.cookies.get('theme')?.value ?? 'light';

// Set a cookie
Astro.cookies.set('theme', 'dark', {
  httpOnly: false,
  secure: true,
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365, // 1 year
  path: '/',
});
---
```

6. Return a redirect from a page with `Astro.redirect()`:

```astro
---
export const prerender = false;

const session = Astro.cookies.get('session')?.value;
if (!session) return Astro.redirect('/login', 302);
---
```

7. Install the correct adapter for your deployment target:

```bash
# Vercel
npx astro add vercel

# Node.js (standalone server)
npx astro add node

# Cloudflare Pages/Workers
npx astro add cloudflare

# Netlify
npx astro add netlify
```

8. For dynamic routes in SSR mode, do not implement `getStaticPaths()`. Astro reads `Astro.params` directly from the request URL:

```astro
---
// src/pages/blog/[slug].astro
export const prerender = false;

const { slug } = Astro.params;
const post = await fetchPost(slug);
if (!post) return Astro.redirect('/404');
---
<article><h1>{post.title}</h1></article>
```

## Details

Astro's rendering model is a spectrum from fully static to fully dynamic. Understanding which mode to use for each page is the key design decision in an Astro SSR project.

**When to use each mode:**

| Page type                         | Recommended mode                               |
| --------------------------------- | ---------------------------------------------- |
| Marketing pages, blog posts, docs | `prerender = true` (static)                    |
| Authenticated dashboards          | `prerender = false` (SSR)                      |
| Product pages (semi-static)       | `prerender = true` + client-side data fetching |
| Search results                    | `prerender = false` (SSR)                      |
| API endpoints with dynamic data   | `prerender = false` (SSR)                      |
| Sitemap, RSS feed                 | `prerender = true` (static)                    |

**`output: 'hybrid'` vs. `output: 'server'`:**

Choose `output: 'hybrid'` when most of your pages are static and a few need SSR. This is the most common pattern for content sites with authenticated features. Choose `output: 'server'` for applications where most pages are dynamic (dashboards, SaaS apps).

**Adapter selection:**

The adapter transforms Astro's SSR output into the format required by the target platform:

- `@astrojs/vercel/serverless` — Vercel serverless functions
- `@astrojs/vercel/edge` — Vercel Edge Functions (limited Node.js API surface)
- `@astrojs/node` — standalone Node.js server (requires `node src/server.mjs`)
- `@astrojs/cloudflare` — Cloudflare Pages / Workers (no Node.js built-ins)
- `@astrojs/netlify` — Netlify Functions / Edge Functions

**`Astro.locals` and middleware:**

Middleware populates `Astro.locals` before the page runs. This is the correct channel for auth state, feature flags, and tenant context. In SSG mode, `Astro.locals` is available but middleware only runs at build time (not per-request).

**Streaming:**

Astro supports streaming SSR responses. The page begins streaming HTML to the client before all async data is resolved. Components that are not awaited render as placeholders until their data arrives. This improves Time To First Byte (TTFB) for pages with multiple independent async data sources.

**Environment variables in SSR:**

Use `import.meta.env.SECRET_API_KEY` for server-only secrets. These values are available at build time and runtime in SSR, but are never exposed to the client bundle. Public variables must be prefixed with `PUBLIC_` to be accessible in client-side scripts.

## Source

https://docs.astro.build/en/guides/server-side-rendering

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
