# Static Generation

> Master static site generation — build-time rendering for instant page loads, incremental static regeneration for dynamic content, on-demand revalidation, hybrid rendering strategies mixing static and dynamic pages, and framework-specific patterns for Next.js, Astro, and Gatsby.

## When to Use

- Content changes infrequently (blog posts, documentation, marketing pages)
- The fastest possible Time to First Byte is required (static files from CDN)
- SEO is critical and pages must be pre-rendered with full HTML
- Build times are manageable for the number of pages (under 10,000)
- Content updates can tolerate a revalidation delay (seconds to minutes)
- A CMS publishes content that can be pre-rendered at build or on webhook
- Documentation sites need instant page loads with full-text searchability
- E-commerce product pages have predictable URLs and moderate update frequency
- Reducing server infrastructure cost by serving static files from a CDN
- A hybrid approach is needed: some pages static, some server-rendered

## Instructions

1. **Understand the static generation performance advantage.** Pre-rendered pages are served as static files from a CDN with no server computation:

   ```
   Static Generation:
   CDN → Browser (pre-built HTML)
   TTFB: 20-50ms (CDN edge)  |  FCP: 100-300ms  |  No server needed

   Server-Side Rendering:
   Server: fetch data → render → respond
   TTFB: 200-500ms (origin)  |  FCP: 400-800ms  |  Server required

   Static is 3-10x faster for TTFB because there is zero computation at request time.
   ```

2. **Implement static generation in Next.js App Router.** Pages are static by default unless they use dynamic features:

   ```typescript
   // app/blog/[slug]/page.tsx — statically generated at build time
   import { getPost, getAllSlugs } from '@/lib/blog';

   // Generate static paths at build time
   export async function generateStaticParams() {
     const slugs = await getAllSlugs();
     return slugs.map(slug => ({ slug }));
   }

   // This page is static — no dynamic data at request time
   export default async function BlogPost({ params }) {
     const post = await getPost(params.slug);
     return (
       <article>
         <h1>{post.title}</h1>
         <div dangerouslySetInnerHTML={{ __html: post.content }} />
       </article>
     );
   }
   ```

3. **Implement Incremental Static Regeneration (ISR).** Serve stale content instantly while regenerating in the background:

   ```typescript
   // Next.js App Router — revalidate every 60 seconds
   // app/products/[id]/page.tsx

   export const revalidate = 60;  // seconds

   export async function generateStaticParams() {
     const products = await getTopProducts(100);
     return products.map(p => ({ id: p.id }));
   }

   export default async function ProductPage({ params }) {
     const product = await getProduct(params.id);
     return <ProductDetail product={product} />;
   }

   // Timeline:
   // 0-60s:  Serve cached static page (instant)
   // >60s:   Serve stale page + regenerate in background
   // Next request: Serve fresh regenerated page
   ```

4. **Implement on-demand revalidation.** Revalidate specific pages when content changes instead of waiting for time-based expiry:

   ```typescript
   // app/api/revalidate/route.ts — webhook endpoint
   import { revalidatePath, revalidateTag } from 'next/cache';

   export async function POST(request: Request) {
     const { secret, path, tag } = await request.json();

     if (secret !== process.env.REVALIDATION_SECRET) {
       return Response.json({ error: 'Invalid secret' }, { status: 401 });
     }

     if (path) {
       revalidatePath(path); // revalidate specific page
     }
     if (tag) {
       revalidateTag(tag); // revalidate all pages using this cache tag
     }

     return Response.json({ revalidated: true });
   }

   // CMS webhook calls: POST /api/revalidate
   // { "secret": "...", "path": "/blog/my-post" }

   // Tag-based revalidation:
   // fetch(url, { next: { tags: ['products'] } })
   // revalidateTag('products') invalidates all pages using this tag
   ```

5. **Use Astro for content-heavy static sites.** Astro ships zero JavaScript by default:

   ```astro
   ---
   // src/pages/blog/[slug].astro
   import Layout from '../../layouts/Layout.astro';
   import { getCollection } from 'astro:content';

   export async function getStaticPaths() {
     const posts = await getCollection('blog');
     return posts.map(post => ({
       params: { slug: post.slug },
       props: { post },
     }));
   }

   const { post } = Astro.props;
   const { Content } = await post.render();
   ---

   <Layout title={post.data.title}>
     <article>
       <h1>{post.data.title}</h1>
       <Content />
     </article>
   </Layout>

   <!-- Result: pure HTML, 0KB JavaScript (unless islands are used) -->
   ```

6. **Handle dynamic content within static pages.** Mix static shells with client-side dynamic content:

   ```typescript
   // Static page with dynamic client component
   // app/products/[id]/page.tsx

   export default async function ProductPage({ params }) {
     const product = await getProduct(params.id);

     return (
       <div>
         {/* Static: rendered at build/revalidation time */}
         <h1>{product.name}</h1>
         <p>{product.description}</p>
         <img src={product.image} alt={product.name} />

         {/* Dynamic: fetched client-side, updates in real-time */}
         <Suspense fallback={<PriceSkeleton />}>
           <LivePrice productId={product.id} />
         </Suspense>
         <Suspense fallback={<StockSkeleton />}>
           <StockAvailability productId={product.id} />
         </Suspense>
       </div>
     );
   }
   ```

7. **Optimize build times for large static sites.** When generating thousands of pages:

   ```typescript
   // Generate only high-traffic pages at build time
   export async function generateStaticParams() {
     // Build top 500 products statically
     const topProducts = await getTopProducts(500);
     return topProducts.map((p) => ({ id: p.id }));
   }

   // dynamicParams = true (default): other products render on-demand and cache
   // First visitor triggers SSR, subsequent visitors get cached static page

   // Parallel build with worker threads (Astro)
   // astro.config.mjs
   export default defineConfig({
     build: {
       concurrency: 4, // parallel page generation
     },
   });
   ```

## Details

### ISR Freshness Guarantee

ISR does not guarantee that users see content newer than the revalidate interval. The flow is: (1) cached page is served instantly, (2) if the revalidate interval has passed, the page is regenerated in the background, (3) the NEXT request gets the fresh page. This means one request after the interval still sees stale content. For most content this is acceptable. When immediate consistency is required, use on-demand revalidation triggered by a CMS webhook.

### Worked Example: Hashicorp Documentation

Hashicorp generates 20,000+ documentation pages statically across multiple products (Terraform, Vault, Consul). Build time was 45 minutes before optimization. They implemented: (1) incremental builds that regenerate only changed pages, (2) parallel page generation with worker threads, (3) content-addressed caching of rendered MDX. Result: incremental builds complete in 2-5 minutes. Full rebuilds take 12 minutes. Every page loads in <100ms from the CDN with a perfect Lighthouse score. On-demand revalidation triggers when docs are merged to main.

### Worked Example: Shopify Storefront

Shopify Hydrogen (their React framework) uses a hybrid approach: product listing pages are statically generated with ISR (revalidate: 60), product detail pages are statically generated with on-demand revalidation (triggered by inventory/price changes via webhook), and the cart/checkout is fully server-rendered with no caching. This achieves <50ms TTFB for browsing (CDN-served static pages) while ensuring the cart always reflects current inventory. The merchant dashboard triggers revalidation when products are updated.

### Anti-Patterns

**Statically generating user-specific pages.** Pages that depend on the authenticated user (dashboards, profiles, settings) cannot be statically generated in a shared CDN cache. Use SSR or CSR for authenticated content.

**Generating too many pages at build time.** A 100,000-page static build takes hours and wastes resources for pages that may never be visited. Generate the top N pages statically, use ISR for the long tail, and set `dynamicParams: true` to render on-demand.

**Forgetting to set Cache-Control on ISR pages.** ISR pages need `stale-while-revalidate` CDN cache headers to match the ISR behavior. Without this, the CDN may cache indefinitely or not cache at all.

**Using ISR without on-demand revalidation for time-sensitive content.** If product prices change and ISR revalidate is 60 seconds, users may see stale prices for up to 60 seconds. For price-sensitive content, trigger on-demand revalidation from the CMS/API when prices change.

## Source

- Next.js: Static Generation — https://nextjs.org/docs/app/building-your-application/rendering/server-components#static-rendering-default
- Next.js: ISR — https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration
- Astro: Static Site Generation — https://docs.astro.build/en/core-concepts/routing/
- web.dev: Rendering on the Web — https://web.dev/articles/rendering-on-the-web

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Content pages (blog, docs, marketing) are statically generated with <50ms TTFB from CDN.
- ISR is configured with appropriate revalidation intervals for each content type.
- On-demand revalidation is triggered by CMS webhooks for time-sensitive content updates.
- Only high-traffic pages are generated at build time; long-tail pages use on-demand generation.
- Dynamic content within static pages is loaded client-side without blocking the static shell.
