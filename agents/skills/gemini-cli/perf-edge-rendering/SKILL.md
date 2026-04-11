# Edge Rendering

> Master edge rendering — deploying server-side rendering to edge locations for minimal latency, understanding edge runtime constraints, regional deployment strategies, edge middleware patterns, data locality considerations, and platform-specific optimization for Cloudflare Workers, Vercel Edge, and Deno Deploy.

## When to Use

- Users are geographically distributed and origin server latency varies by region
- TTFB is high for users far from the origin server (>200ms)
- Server-side rendering is needed but origin-only deployment adds latency
- Personalization (A/B tests, geo-targeting, localization) needs to happen before content delivery
- Authentication and authorization checks could run closer to the user
- API responses could be transformed or enriched at the edge
- Static generation is too stale but full origin SSR adds unnecessary latency
- Edge middleware is needed for redirects, rewrites, or header manipulation
- A global application needs consistent sub-100ms TTFB worldwide
- Feature flags need to be evaluated before page rendering without a client-side flash

## Instructions

1. **Understand edge versus origin architecture.** Edge functions run in data centers close to the user (200+ locations) instead of a single origin:

   ```
   Origin-only SSR:
   User (Tokyo) → CDN → Origin (US-East) → DB → Render → Response
   Network RTT: ~150ms  |  TTFB: ~350ms

   Edge Rendering:
   User (Tokyo) → Edge (Tokyo) → Render → Response
   Network RTT: ~5ms  |  TTFB: ~50ms

   Edge + Origin Data:
   User (Tokyo) → Edge (Tokyo) → Origin API (US-East) → Edge Render → Response
   Network RTT: ~5ms + ~150ms (data)  |  TTFB: ~200ms
   (Still faster: user sees shell immediately via streaming)
   ```

2. **Deploy edge functions on Cloudflare Workers.** Workers run on V8 isolates with sub-millisecond cold starts:

   ```typescript
   // src/worker.ts — Cloudflare Worker
   export default {
     async fetch(request: Request, env: Env): Promise<Response> {
       const url = new URL(request.url);

       // Edge-rendered HTML
       const html = await renderPage(url.pathname, {
         userCountry: request.cf?.country,
         userCity: request.cf?.city,
       });

       return new Response(html, {
         headers: {
           'Content-Type': 'text/html; charset=utf-8',
           'Cache-Control': 'public, max-age=60, s-maxage=300',
         },
       });
     },
   };

   // wrangler.toml
   // name = "my-app"
   // main = "src/worker.ts"
   // compatibility_date = "2024-01-01"
   ```

3. **Use Vercel Edge Runtime for Next.js.** Mark routes to run on the edge instead of Node.js:

   ```typescript
   // app/api/geo/route.ts — Edge API route
   export const runtime = 'edge';

   export async function GET(request: Request) {
     const country = request.headers.get('x-vercel-ip-country') || 'US';
     const city = request.headers.get('x-vercel-ip-city') || 'Unknown';

     return Response.json({
       country,
       city,
       timestamp: Date.now(),
     });
   }

   // middleware.ts — geo-redirects and A/B tests at the edge
   // Use request.geo?.country for geo-routing, cookies for A/B persistence
   // Configure matcher to exclude static assets: /((?!_next/static|favicon).*)
   ```

4. **Handle edge runtime constraints.** Edge runtimes use a limited Web API subset (no Node.js APIs):

   ```typescript
   // Available at the edge:
   // - fetch(), Request, Response, Headers
   // - URL, URLSearchParams, URLPattern
   // - crypto.subtle, crypto.getRandomValues
   // - TextEncoder, TextDecoder
   // - structuredClone, atob, btoa
   // - setTimeout (limited), Promises, async/await
   // - Web Streams API

   // NOT available at the edge:
   // - fs, path, child_process (no file system)
   // - Buffer (use Uint8Array instead)
   // - net, http (use fetch instead)
   // - Most npm packages that use Node.js APIs

   // Edge-compatible alternatives:
   // Database: Neon serverless, PlanetScale, Turso (HTTP-based)
   // KV Store: Cloudflare KV, Vercel KV, Upstash Redis
   // ORM: Drizzle (with HTTP adapter), Prisma (with Accelerate)
   ```

5. **Implement edge caching for dynamic content.** Cache rendered pages at the edge with smart invalidation:

   ```typescript
   // Cloudflare Workers — Cache API
   async function handleRequest(request: Request): Promise<Response> {
     const cache = caches.default;
     const cacheKey = new Request(request.url, request);

     // Check edge cache
     let response = await cache.match(cacheKey);
     if (response) {
       return response;
     }

     // Render at the edge
     const html = await renderPage(request);
     response = new Response(html, {
       headers: {
         'Content-Type': 'text/html',
         'Cache-Control': 'public, s-maxage=300', // cache at edge for 5 min
       },
     });

     // Store in edge cache (non-blocking)
     const cacheResponse = response.clone();
     await cache.put(cacheKey, cacheResponse);

     return response;
   }
   ```

6. **Manage data locality.** Edge rendering is fast only if data access is also fast. Strategies for reducing data latency:

   ```typescript
   // Strategy 1: Edge KV for read-heavy data
   // Cloudflare KV: eventually consistent, <10ms reads globally
   const config = await env.CONFIG_KV.get('site-config', 'json');

   // Strategy 2: Edge-local database replicas
   // Turso (libSQL): read replicas in 30+ regions
   // Read from local replica, write to primary
   import { createClient } from '@libsql/client';
   const db = createClient({
     url: 'libsql://db-name-region.turso.io',
     authToken: '...',
   });

   // Strategy 3: Cache at the edge, fetch from origin
   // Best for: data that changes infrequently, high read volume
   const data = await env.CACHE.get(key, 'json');
   if (!data) {
     const fresh = await fetch('https://origin.example.com/api/data');
     await env.CACHE.put(key, await fresh.text(), { expirationTtl: 300 });
   }

   // Strategy 4: Smart routing — render at the edge closest to the database
   // Vercel: configure function regions to match database location
   // export const preferredRegion = 'iad1'; // US East, near the DB
   ```

7. **Monitor edge function performance.** Instrument with `Date.now()` timing, log the edge location (`request.cf?.colo` on Cloudflare), and always fall back to `fetch(request)` on error. Track cold start frequency, P99 execution time, and cache hit rates via platform analytics (Cloudflare Analytics Engine, Vercel Analytics).

## Details

### Edge Runtime Cold Starts

Cloudflare Workers use V8 isolates with sub-millisecond cold starts; Vercel Edge Functions ~5ms. Both are far faster than Lambda (100-1000ms). Trade-off: no file system, no native modules, limited memory (128MB), and limited CPU time (10-50ms free tier). Design edge functions to be lightweight.

### Worked Example: Cloudflare Blog

Runs entirely on Workers with streaming SSR. Blog posts render from Markdown in Workers KV, cached at the edge. First request renders and caches; subsequent requests serve in <5ms globally. Webhook-based cache purging on content updates. Result: <50ms TTFB worldwide, zero origin load for reads.

### Worked Example: Shopify Oxygen

Deploys Remix storefronts to Cloudflare Workers. Edge rendering takes 20-50ms, Storefront API responds in 50-100ms, yielding 70-150ms total TTFB vs 200-400ms origin-only. Stale-while-revalidate caching drops frequently-accessed pages to <10ms TTFB.

### Anti-Patterns

**Edge rendering with origin-only databases.** If every request queries a database in US-East, the edge latency advantage is negated. Use edge-local data stores (KV, replicas) or accept the benefit is limited to non-data-dependent content.

**Heavy computation at the edge.** Edge runtimes have strict CPU time limits (10-50ms on free tiers). Offload image processing and heavy transformations to origin functions. Use the edge for lightweight rendering, routing, and personalization.

**Not falling back to origin on edge failure.** Always implement a fallback path to the origin server for when edge functions fail due to platform issues or resource limits.

**Deploying globally when data is in one region.** If most traffic is regional and the DB is in US-East, 200+ edge locations add no benefit. Use `preferredRegion` to deploy near the database for data-heavy pages.

## Source

- Cloudflare Workers — https://developers.cloudflare.com/workers/
- Vercel Edge Functions — https://vercel.com/docs/functions/edge-functions
- Deno Deploy — https://deno.com/deploy
- web.dev: Edge Rendering — https://web.dev/articles/rendering-on-the-web#edge_rendering

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Edge functions achieve <100ms TTFB for users in the primary geographic region.
- Edge runtime constraints are respected (no Node.js-only APIs in edge functions).
- Data access strategy accounts for edge-to-origin latency (KV, replicas, or regional deployment).
- Edge caching is configured with appropriate TTLs and invalidation mechanisms.
- Fallback to origin is implemented for edge function failures.
