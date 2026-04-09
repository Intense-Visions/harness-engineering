# Next.js Caching Strategies

> Control Next.js's four cache layers to balance freshness, performance, and cost

## When to Use

- Deciding how long fetched data should remain valid before re-fetching
- Implementing on-demand cache invalidation triggered by CMS or database mutations
- Debugging stale data that persists despite server restarts or code changes
- Optimizing expensive API calls with appropriate cache lifetimes
- Understanding why a page is not updating after deploying new data

## Instructions

1. Use `fetch(url, { next: { revalidate: 60 } })` to cache a fetch result for 60 seconds (ISR-style).
2. Use `fetch(url, { cache: 'no-store' })` to opt out of caching entirely — equivalent to always fetching fresh data.
3. Use `fetch(url, { next: { tags: ['posts'] } })` to attach a cache tag — call `revalidateTag('posts')` later to purge it.
4. Use `unstable_cache(fn, keyParts, { tags, revalidate })` to cache non-fetch data (database queries, third-party SDK calls).
5. Set `export const revalidate = 60` at the page or layout level as a per-segment default that applies to all fetches in that segment.
6. Set `export const dynamic = 'force-dynamic'` to opt the entire route out of all caching — equivalent to SSR.
7. Call `revalidatePath('/posts')` from a Server Action or Route Handler to purge all cache entries for that path.
8. Use `revalidateTag('tag')` for targeted invalidation without knowing specific paths — one tag can cover many routes.

```typescript
// lib/posts.ts — cached database query with tags
import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';

export const getPosts = unstable_cache(
  async () => db.post.findMany({ orderBy: { createdAt: 'desc' } }),
  ['posts-list'],
  { tags: ['posts'], revalidate: 3600 }
);

// app/api/revalidate/route.ts — webhook-triggered on-demand revalidation
import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-revalidate-secret');
  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { tag } = await request.json();
  revalidateTag(tag);
  return NextResponse.json({ revalidated: true });
}
```

## Details

Next.js App Router has four distinct caches that interact:

1. **Request Memoization** — deduplicates identical `fetch()` calls within a single request lifecycle. Automatic, not configurable. Reset per request.
2. **Data Cache** — persists `fetch()` results across requests and deployments. Controlled by `revalidate` and `cache` fetch options. The primary cache for server-side data.
3. **Full Route Cache** — caches the rendered HTML and RSC payload of static routes. Populated at build time and on background revalidation. Invalidated by `revalidatePath()`.
4. **Router Cache** — client-side cache of RSC payloads for previously visited routes. Reduces server requests during navigation. Automatically expires; call `router.refresh()` to purge.

**`unstable_cache` vs fetch cache:** `fetch()` caching only applies to the native `fetch` function. Use `unstable_cache` to cache ORM queries (Prisma, Drizzle), Redis calls, or any async function. The API is identical in semantics — tags, revalidate, key parts.

**Opt-out cascade:** Using `cookies()`, `headers()`, or `searchParams` in a Server Component automatically opts that route into dynamic rendering, bypassing the Full Route Cache. A single dynamic function in a layout propagates dynamism to all child routes.

**Debugging stale cache:** Run `next build` and inspect the build output — routes marked `○` are static, `λ` are dynamic, `ƒ` are ISR. Use `NEXT_PRIVATE_DEBUG_CACHE=1` environment variable in development to log cache hits and misses.

## Source

https://nextjs.org/docs/app/building-your-application/caching

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
