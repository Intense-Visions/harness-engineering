# Astro Deployment Configuration

> Configure adapters, environment variables, and build output for deploying Astro to Vercel, Node.js, Cloudflare, and Netlify.

## When to Use

- You are deploying an Astro project for the first time and need to choose and configure an adapter
- You are switching deployment targets and need to change the adapter and output format
- You need to manage environment variables correctly across build time and runtime
- You are debugging a deployment where pages work locally but fail in production
- You need to configure custom headers, redirects, or asset CDN behavior in the deployment target

## Instructions

1. Install the adapter for your target platform. Each adapter configures Astro's SSR output for that runtime:

```bash
# Vercel (serverless functions)
npx astro add vercel

# Vercel Edge (edge runtime — limited Node.js APIs)
# Manual: import vercel from '@astrojs/vercel/edge'

# Node.js (self-hosted server)
npx astro add node

# Cloudflare Pages
npx astro add cloudflare

# Netlify
npx astro add netlify
```

2. Configure the adapter in `astro.config.mjs`:

```javascript
// Vercel — serverless (most common)
import vercel from '@astrojs/vercel/serverless';
export default defineConfig({
  output: 'server',
  adapter: vercel({
    webAnalytics: { enabled: true },
    imageService: true, // use Vercel Image Optimization
    devImageService: 'sharp', // local dev uses sharp
  }),
});

// Node.js — standalone server
import node from '@astrojs/node';
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }), // or 'middleware' for Express
});

// Cloudflare Pages
import cloudflare from '@astrojs/cloudflare';
export default defineConfig({
  output: 'server',
  adapter: cloudflare({ mode: 'directory' }), // or 'advanced'
});
```

3. Manage environment variables using `import.meta.env`. Astro follows Vite's env convention:

```typescript
// Public variables (exposed to client bundles) — must be prefixed PUBLIC_
const apiBase = import.meta.env.PUBLIC_API_BASE_URL;

// Server-only variables (never sent to client)
const dbUrl = import.meta.env.DATABASE_URL;
const secretKey = import.meta.env.SECRET_KEY;

// Built-in variables
const isDev = import.meta.env.DEV; // boolean
const isProd = import.meta.env.PROD; // boolean
const siteUrl = import.meta.env.SITE; // set in astro.config.mjs > site
const baseUrl = import.meta.env.BASE_URL; // set in astro.config.mjs > base
```

4. Set environment variables in `.env` files (never commit secrets):

```
# .env (committed — only PUBLIC_ vars)
PUBLIC_API_BASE_URL=https://api.example.com

# .env.local (gitignored — secrets)
DATABASE_URL=postgres://...
SECRET_KEY=abc123

# .env.production (committed — production public vars only)
PUBLIC_API_BASE_URL=https://api.production.com
```

5. Configure static deployments (no adapter needed) for fully static sites:

```javascript
// astro.config.mjs
export default defineConfig({
  output: 'static', // default — no adapter needed
  site: 'https://example.com',
  base: '/docs', // if deployed to a subdirectory
  build: {
    assets: '_assets', // custom directory for built assets (default: '_astro')
  },
});
```

Deploy the `dist/` directory to any static host (GitHub Pages, Netlify, Cloudflare Pages in static mode, S3 + CloudFront).

6. Configure redirects and headers directly in `astro.config.mjs` for static deployments:

```javascript
export default defineConfig({
  redirects: {
    '/old-blog': '/blog',
    '/old-blog/[slug]': '/blog/[slug]',
  },
});
```

For SSR deployments, platform-specific config files take precedence:

- Vercel: `vercel.json` (headers, rewrites)
- Netlify: `netlify.toml` (headers, redirects, functions)
- Cloudflare: `wrangler.toml` + `_headers` / `_redirects` files

7. Set `site` in `astro.config.mjs` — it is required for canonical URLs, sitemaps, and the `SITE` env variable:

```javascript
export default defineConfig({
  site: 'https://www.example.com', // must be the full URL including protocol
});
```

8. For Node.js adapter deployments, start the server with the generated entry point:

```bash
# Build
npx astro build

# Start (standalone mode)
node ./dist/server/entry.mjs

# With environment variables
DATABASE_URL=postgres://... node ./dist/server/entry.mjs

# Configure the host/port
HOST=0.0.0.0 PORT=3000 node ./dist/server/entry.mjs
```

## Details

**Adapter selection guide:**

| Platform         | Adapter                          | Notes                                        |
| ---------------- | -------------------------------- | -------------------------------------------- |
| Vercel           | `@astrojs/vercel/serverless`     | Best DX; automatic image optimization        |
| Vercel Edge      | `@astrojs/vercel/edge`           | No Node.js built-ins; lower latency          |
| Netlify          | `@astrojs/netlify`               | Functions + Edge Functions                   |
| Cloudflare Pages | `@astrojs/cloudflare`            | Workers runtime; no Node.js fs module        |
| AWS Lambda       | `@astrojs/node` + custom wrapper | Requires additional glue                     |
| Docker / VPS     | `@astrojs/node` standalone       | Full control; bring your own process manager |
| GitHub Pages     | none (static)                    | Free; limited to `output: 'static'`          |

**Cloudflare-specific considerations:**

Cloudflare Workers do not support Node.js built-in modules (`fs`, `path`, `crypto` from Node.js). Use the Cloudflare-native equivalents: `crypto.subtle` for crypto, `KV` / `R2` for storage. Add `{ mode: 'directory' }` to the Cloudflare adapter when deploying to Pages (as opposed to Workers).

**Environment variables at runtime vs. build time:**

- SSG: env vars are consumed at build time — they are baked into the static HTML. Changing a public env var requires a rebuild.
- SSR: env vars are consumed at request time — update them in the platform dashboard without a rebuild.
- `SECRET_*` vars in SSG are only available in the build process and `getStaticPaths()`. They are never included in client bundles.

**`base` path configuration:**

When deploying to a subdirectory (e.g., GitHub Pages project site at `/repo-name/`), set `base: '/repo-name'`. Astro prefixes all internal links, assets, and the router with this base. Access it via `import.meta.env.BASE_URL`.

**Build output structure:**

- `dist/` — build output root
- `dist/index.html` — static pages (SSG)
- `dist/_astro/` — hashed JS/CSS chunks
- `dist/server/` — SSR entry point and chunks (when using an adapter)

**CI/CD patterns:**

Most platforms (Vercel, Netlify, Cloudflare Pages) auto-detect Astro projects and set the build command (`astro build`) and output directory (`dist/`) automatically. For Node.js self-hosted deployments, set up a process manager (PM2, systemd) to keep the server running and restart on crash.

## Source

https://docs.astro.build/en/guides/deploy

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
