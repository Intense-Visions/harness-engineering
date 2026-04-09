# Next.js Static Generation

> Pre-render pages at build time or on a schedule using SSG, generateStaticParams, and ISR

## When to Use

- Pages whose content does not change per-request (marketing pages, blog posts, documentation)
- Routes with a finite, known set of dynamic segments (e.g., `/posts/[slug]`)
- High-traffic pages where serving from CDN cache is preferable to per-request rendering
- Implementing Incremental Static Regeneration (ISR) to refresh content on a schedule
- Reducing server compute costs by pre-rendering at build time

## Instructions

1. Make a page statically rendered by not using dynamic functions (`cookies()`, `headers()`, `searchParams`) and not setting `dynamic = 'force-dynamic'`.
2. Export `generateStaticParams()` from a dynamic route's `page.tsx` to pre-render all known slugs at build time.
3. Set `export const revalidate = 60` (seconds) at the page or layout level to enable ISR — the page re-generates in the background after the interval.
4. Use `revalidatePath()` or `revalidateTag()` from a Server Action or route handler for on-demand ISR triggered by a CMS webhook.
5. Pass `{ next: { tags: ['posts'] } }` to `fetch()` to attach cache tags for granular invalidation.
6. Set `export const dynamicParams = false` to return 404 for slugs not returned by `generateStaticParams()`.
7. Use `notFound()` inside `generateStaticParams()` return values — simply omit slugs you want to 404.

```typescript
// app/posts/[slug]/page.tsx
import { notFound } from 'next/navigation';

export const revalidate = 3600; // Re-generate every hour

export async function generateStaticParams() {
  const posts = await fetch('https://api.example.com/posts', {
    next: { tags: ['posts'] },
  }).then(r => r.json());
  return posts.map((p: { slug: string }) => ({ slug: p.slug }));
}

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = await fetch(`https://api.example.com/posts/${params.slug}`, {
    next: { tags: [`post-${params.slug}`] },
  }).then(r => r.json());
  if (!post) notFound();
  return <article>{post.content}</article>;
}
```

## Details

Next.js App Router has four rendering modes: static (default), dynamic, streaming, and ISR. Static generation produces HTML at build time and serves it from a CDN — zero server compute per request.

**ISR mechanics:** When `revalidate` is set, Next.js uses a stale-while-revalidate strategy. The first request after the interval triggers a background regeneration; the stale page is served during regeneration. This means the interval is a minimum, not a guarantee — high-traffic pages regenerate quickly, low-traffic pages may take longer.

**On-demand ISR:** Call `revalidatePath('/posts/my-slug')` or `revalidateTag('posts')` from a route handler secured with a secret token. Wire this to your CMS webhook to regenerate pages immediately on content updates.

**generateStaticParams at build time:** Next.js calls `generateStaticParams` during `next build` and pre-renders every returned slug. If `dynamicParams` is `true` (default), slugs not pre-rendered are rendered on-demand and then cached. If `false`, they return 404.

**fetch() caching:** In the App Router, `fetch()` is extended to accept `{ next: { revalidate, tags } }` options. This opts individual fetch calls into the Data Cache, separate from the HTTP cache. Server Components without any dynamic functions are cached by the Full Route Cache.

## Source

https://nextjs.org/docs/app/building-your-application/rendering/static-and-dynamic-rendering

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
