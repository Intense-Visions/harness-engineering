# Next.js Metadata API

> Define SEO metadata, Open Graph tags, and dynamic OG images with the Metadata API

## When to Use

- Setting page titles, descriptions, and canonical URLs
- Generating Open Graph and Twitter Card metadata for social sharing
- Creating dynamic OG images for blog posts, product pages, or any dynamic content
- Configuring robots.txt behavior, sitemaps, and web app manifests
- Overriding metadata from a parent layout in a child page

## Instructions

1. Export a `metadata` constant from any `layout.tsx` or `page.tsx` for static metadata.
2. Export an async `generateMetadata({ params, searchParams })` function for dynamic metadata derived from route parameters or fetched data.
3. Use the `title.template` property in root `layout.tsx` to set a consistent title suffix — child pages set only the page-specific prefix.
4. Pass `metadataBase` in root metadata to resolve relative URLs in `openGraph.images` and `twitter.images`.
5. Create `opengraph-image.tsx` in any route segment to generate a dynamic OG image with `@vercel/og` — no external service needed.
6. Use `robots`, `canonical`, and `alternates` fields to control crawler behavior and avoid duplicate content.
7. Metadata is merged from parent layouts down to child pages — child values override parent values for the same key.
8. Never duplicate metadata in both `layout.tsx` and `page.tsx` for the same route — define at the most specific level.

```typescript
// app/layout.tsx — root metadata with template and base URL
export const metadata: Metadata = {
  metadataBase: new URL('https://example.com'),
  title: { default: 'My App', template: '%s | My App' },
  description: 'The best app in the world',
  openGraph: { type: 'website', locale: 'en_US', siteName: 'My App' },
};

// app/posts/[slug]/page.tsx — dynamic metadata
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await fetchPost(params.slug);
  return {
    title: post.title, // becomes "Post Title | My App" via template
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [{ url: `/api/og?title=${encodeURIComponent(post.title)}`, width: 1200, height: 630 }],
    },
  };
}

// app/posts/[slug]/opengraph-image.tsx — dynamic OG image
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  const post = await fetchPost(params.slug);
  return new ImageResponse(<div style={{ fontSize: 48 }}>{post.title}</div>);
}
```

## Details

The Metadata API replaces `<Head>` from `next/head` in the App Router. It is declarative, type-safe, and tree-mergeable — parent layout metadata flows down to child pages, with child values winning on conflict.

**`title.template`:** The root layout sets `title: { default: 'My App', template: '%s | My App' }`. Every child page that sets `title: 'Dashboard'` automatically becomes `'Dashboard | My App'`. Pages that do not set a title fall back to `default`.

**`metadataBase`:** Required when any metadata field uses a relative URL (especially `openGraph.images`). Without it, Next.js warns and relative URLs are not resolved correctly for social crawlers.

**Dynamic OG images with `opengraph-image.tsx`:** Place this file in any route segment directory. It exports an `ImageResponse` and runs on the Edge Runtime. Next.js automatically serves it at `/{route}/opengraph-image` and links it from the page's `<meta>` tags. No additional configuration needed.

**Deduplication:** Next.js merges metadata from all parent layouts. If a parent sets `openGraph.images` and a child does not, the parent's images are used. If the child sets `openGraph.images`, it replaces the parent's entirely — not merged.

**Sitemap and robots:** Create `app/sitemap.ts` (returns `MetadataRoute.Sitemap`) and `app/robots.ts` (returns `MetadataRoute.Robots`) for programmatic control of these files.

## Source

https://nextjs.org/docs/app/building-your-application/optimizing/metadata

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
