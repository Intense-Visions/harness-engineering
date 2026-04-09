# Svelte Adapter Config

> Deploy SvelteKit to any platform by selecting and configuring the correct adapter in svelte.config.js

## When to Use

- You are preparing a SvelteKit app for production deployment
- You need to choose between Node server, Vercel, Cloudflare Pages, Netlify, or static hosting
- You need to configure prerendering or SSR for specific routes
- You are hitting adapter-specific runtime limitations (no Node.js APIs on edge, etc.)

## Instructions

**Selecting an adapter:**

1. Install and configure the appropriate adapter in `svelte.config.js`:

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-auto'; // or specific adapter

export default {
  kit: {
    adapter: adapter(),
  },
};
```

**adapter-auto (default):**

2. `adapter-auto` detects the deployment environment and selects the correct adapter automatically. It works for Vercel, Netlify, and Cloudflare Pages with zero configuration:

```bash
npm install -D @sveltejs/adapter-auto
```

Note: For production, prefer the specific adapter to avoid ambiguity and get access to all configuration options.

**adapter-node — Node.js server:**

3. For Docker, Railway, Render, or any VPS:

```bash
npm install -D @sveltejs/adapter-node
```

```javascript
import adapter from '@sveltejs/adapter-node';

export default {
  kit: {
    adapter: adapter({
      out: 'build', // output directory
      precompress: true, // gzip/brotli static assets
      envPrefix: 'APP_', // prefix for environment variable access
    }),
  },
};
```

Run the output: `node build/index.js`. Set `PORT` and `HOST` env vars to configure the server.

**adapter-vercel:**

4. Deploys SSR routes as Vercel serverless functions and API routes as edge functions:

```bash
npm install -D @sveltejs/adapter-vercel
```

```javascript
import adapter from '@sveltejs/adapter-vercel';

export default {
  kit: {
    adapter: adapter({
      runtime: 'nodejs20.x', // or 'edge'
      regions: ['iad1'], // function regions
      isr: { expiration: 60 }, // ISR default
    }),
  },
};
```

Configure per-route behavior using `export const config` in route files:

```typescript
// src/routes/api/stream/+server.ts
export const config = {
  runtime: 'edge',
};
```

**adapter-cloudflare:**

5. Deploys to Cloudflare Pages + Workers:

```bash
npm install -D @sveltejs/adapter-cloudflare
```

```javascript
import adapter from '@sveltejs/adapter-cloudflare';

export default {
  kit: {
    adapter: adapter({
      routes: { include: ['/*'], exclude: ['<all>'] },
    }),
  },
};
```

Access Cloudflare bindings (KV, R2, D1) via `event.platform.env`:

```typescript
// +page.server.ts
export const load: PageServerLoad = async ({ platform }) => {
  const kv = platform?.env?.MY_KV_NAMESPACE;
  const value = await kv?.get('my-key');
  return { value };
};
```

Declare the `App.Platform` interface for type safety:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Platform {
      env: {
        MY_KV_NAMESPACE: KVNamespace;
        MY_D1: D1Database;
      };
    }
  }
}
```

**adapter-static — full static export:**

6. Pre-renders all pages at build time for hosting on any static file server:

```bash
npm install -D @sveltejs/adapter-static
```

```javascript
import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: '200.html', // for SPA mode
      precompress: false,
      strict: true,
    }),
  },
};
```

All pages must be prerenderable. Disable SSR globally or per-page for SPA mode:

```typescript
// src/routes/+layout.ts
export const ssr = false;
export const prerender = true;
```

**Prerendering specific pages:**

7. Mark pages for prerendering individually without switching the whole app to static:

```typescript
// +page.ts or +page.server.ts
export const prerender = true;
```

Or configure in `svelte.config.js`:

```javascript
export default {
  kit: {
    prerender: {
      entries: ['/', '/about', '/blog'],
      crawl: true, // follow links from prerendered pages
      handleMissingId: 'warn',
    },
  },
};
```

## Details

**Adapter comparison:**

| Adapter            | Hosting           | SSR | Edge           | Static files   |
| ------------------ | ----------------- | --- | -------------- | -------------- |
| adapter-auto       | Vercel/Netlify/CF | Yes | Partial        | CDN            |
| adapter-node       | VPS/Docker        | Yes | No             | Serve manually |
| adapter-vercel     | Vercel            | Yes | Yes            | CDN            |
| adapter-cloudflare | CF Pages          | Yes | Yes (Workers)  | CF CDN         |
| adapter-netlify    | Netlify           | Yes | Yes (Edge Fns) | CDN            |
| adapter-static     | Any               | No  | No             | Any CDN        |

**Environment variables:**

SvelteKit distinguishes between build-time and runtime env vars:

```typescript
// Build-time (baked into bundle):
import { PUBLIC_API_URL } from '$env/static/public';
import { SECRET_KEY } from '$env/static/private';

// Runtime (read from process.env):
import { PUBLIC_API_URL } from '$env/dynamic/public';
import { SECRET_KEY } from '$env/dynamic/private';
```

Use `$env/dynamic/*` for variables that change between deployments without a rebuild.

**Cloudflare vs. Node — key differences:**

- No `fs` on Cloudflare Workers — use R2 or KV for storage
- Limited CPU time per request on edge — avoid heavy computation
- No `process.env` on Workers — use Cloudflare bindings and `platform.env`
- Bundle size limit of 1MB (compressed) on Workers

**adapter-node + Docker:**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY build ./build
COPY node_modules ./node_modules
COPY package.json .
EXPOSE 3000
CMD ["node", "build/index.js"]
```

## Source

https://kit.svelte.dev/docs/adapters

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
