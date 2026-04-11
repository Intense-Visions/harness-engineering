# Server-Side Rendering

> Master server-side rendering performance — SSR versus CSR trade-off analysis, hydration cost and mitigation, streaming SSR with React 18, selective hydration for interactive islands, React Server Components, and SSR caching strategies for optimal TTFB and TTI.

## When to Use

- First Contentful Paint is slow because the browser must download, parse, and execute JavaScript before rendering
- SEO requires fully rendered HTML for search engine crawlers
- Social media sharing needs Open Graph meta tags rendered in the initial HTML
- Users on slow devices experience long Time to Interactive due to client-side rendering
- Lighthouse flags poor FCP and LCP on a client-side rendered application
- A content-heavy site (blog, news, e-commerce) needs fast initial page loads
- The application has a high bounce rate correlated with slow initial render
- Migrating from a pure SPA to a server-rendered architecture for performance
- Hydration is blocking interactivity — the page looks loaded but does not respond to clicks
- Server response time (TTFB) is high due to data fetching during SSR

## Instructions

1. **Understand the SSR performance model.** SSR shifts rendering cost from the client to the server:

   ```
   Client-Side Rendering (CSR):
   Browser: Download HTML → Download JS → Parse JS → Execute JS → Render
   TTFB: ~50ms  |  FCP: ~2-4s  |  TTI: ~2-4s (FCP ≈ TTI)

   Server-Side Rendering (SSR):
   Server: Fetch data → Render HTML → Send to browser
   Browser: Receive HTML → Render (FCP) → Download JS → Hydrate (TTI)
   TTFB: ~200ms  |  FCP: ~0.5-1s  |  TTI: ~2-3s (gap between FCP and TTI)
   ```

   SSR improves FCP and LCP significantly. The trade-off is TTFB increases (server must render) and there is a gap between visual completeness and interactivity (hydration delay).

2. **Implement streaming SSR with React 18.** Streaming sends HTML chunks as they are ready instead of waiting for the entire page:

   ```typescript
   // server.ts — streaming SSR with React 18
   import { renderToPipeableStream } from 'react-dom/server';
   import { createServer } from 'http';

   createServer((req, res) => {
     const { pipe, abort } = renderToPipeableStream(
       <App url={req.url} />,
       {
         bootstrapScripts: ['/client.js'],
         onShellReady() {
           // Shell (layout + above-fold content) is ready
           res.statusCode = 200;
           res.setHeader('Content-Type', 'text/html');
           pipe(res);  // start streaming HTML
         },
         onShellError(error) {
           res.statusCode = 500;
           res.end('Server error');
         },
         onError(error) {
           console.error('SSR error:', error);
         },
       }
     );

     setTimeout(() => abort(), 10000); // 10s timeout
   }).listen(3000);
   ```

3. **Use Suspense boundaries to control streaming chunks.** Each Suspense boundary becomes a streaming boundary:

   ```typescript
   function ProductPage({ productId }) {
     return (
       <Layout>
         {/* Shell: renders immediately, streamed first */}
         <Header />
         <ProductInfo productId={productId} />

         {/* Streamed later when data resolves */}
         <Suspense fallback={<ReviewsSkeleton />}>
           <ProductReviews productId={productId} />
         </Suspense>

         <Suspense fallback={<RecommendationsSkeleton />}>
           <Recommendations productId={productId} />
         </Suspense>
       </Layout>
     );
   }
   ```

   The server streams the shell HTML immediately (Header, ProductInfo). When ProductReviews data resolves, its HTML is streamed as an inline `<script>` that replaces the skeleton. The browser shows progressive content without waiting for all data.

4. **Implement selective hydration.** Hydrate critical above-fold components first, defer below-fold:

   ```typescript
   // React 18 selective hydration — automatic with Suspense
   // Components inside Suspense boundaries hydrate independently
   // User interactions prioritize hydration of the clicked component

   // client.ts
   import { hydrateRoot } from 'react-dom/client';
   hydrateRoot(document.getElementById('root'), <App />);

   // If the user clicks a Suspense boundary that hasn't hydrated yet,
   // React prioritizes hydrating that component immediately.
   ```

5. **Optimize data fetching during SSR.** Parallel data fetching prevents waterfall delays:

   ```typescript
   // Bad: sequential data fetching (waterfall)
   async function getServerSideProps() {
     const user = await fetchUser(); // 100ms
     const products = await fetchProducts(); // 200ms
     const reviews = await fetchReviews(); // 150ms
     // Total: 450ms

     return { props: { user, products, reviews } };
   }

   // Good: parallel data fetching
   async function getServerSideProps() {
     const [user, products, reviews] = await Promise.all([
       fetchUser(), // 100ms
       fetchProducts(), // 200ms ← determines total
       fetchReviews(), // 150ms
     ]);
     // Total: 200ms (limited by slowest)

     return { props: { user, products, reviews } };
   }
   ```

6. **Cache SSR output for repeated requests.** Avoid re-rendering identical pages:

   ```typescript
   // Page-level caching for anonymous/public content
   import { LRUCache } from 'lru-cache';

   const ssrCache = new LRUCache<string, string>({
     max: 500,
     ttl: 60_000, // 60 seconds
   });

   async function handleRequest(req, res) {
     const cacheKey = req.url;

     // Serve from cache if available
     const cached = ssrCache.get(cacheKey);
     if (cached) {
       res.setHeader('X-Cache', 'HIT');
       return res.end(cached);
     }

     // Render and cache
     const html = await renderPage(req);
     ssrCache.set(cacheKey, html);
     res.setHeader('X-Cache', 'MISS');
     res.end(html);
   }
   ```

7. **Use React Server Components to eliminate hydration cost.** Server Components render only on the server and send zero JavaScript to the client:

   ```typescript
   // Server Component (default in Next.js App Router)
   // No JavaScript shipped to client — pure HTML
   async function ProductPage({ params }) {
     const product = await db.product.findUnique({
       where: { id: params.id },
     });

     return (
       <div>
         <h1>{product.name}</h1>
         <p>{product.description}</p>

         {/* Client Component — only this ships JavaScript */}
         <AddToCartButton productId={product.id} />
       </div>
     );
   }

   // Client Component — 'use client' boundary
   'use client';
   function AddToCartButton({ productId }) {
     const [adding, setAdding] = useState(false);
     // ... interactive logic, event handlers
   }
   ```

## Details

### Hydration Cost Analysis

Hydration is the process of attaching event handlers to server-rendered HTML and making it interactive. It requires: (1) downloading the JavaScript bundle, (2) parsing and executing it, (3) React walking the entire component tree to attach handlers. For a complex page, hydration can take 500ms-2s on mobile devices. During this time, the page looks interactive but clicks are dropped. This "uncanny valley" between visual completeness and actual interactivity is the primary SSR performance concern.

### Worked Example: Airbnb Listing Page

Airbnb's listing page uses streaming SSR with strategic Suspense boundaries. The shell (header, listing photos, title, price) streams within 100ms TTFB. Below-fold content (reviews, host info, similar listings) streams as their data resolves. The photo carousel uses selective hydration — it hydrates immediately because users interact with it quickly. The reviews section hydrates when scrolled into view. Result: LCP of 0.8s (from the listing photo) and INP of <100ms for the carousel, despite the full page requiring 1.5MB of JavaScript when fully hydrated.

### Worked Example: Netflix Homepage

Netflix's homepage uses server-side rendering for the initial hero row and first category row, with client-side rendering for subsequent rows. The initial HTML includes the hero image as a preloaded resource and the first row's movie posters as inline base64 thumbnails. JavaScript hydrates the hero's interactive elements (play button, info modal) within 200ms. Additional category rows load via client-side data fetching as the user scrolls. This hybrid approach achieves a 0.5s LCP on broadband and defers 80% of the JavaScript bundle until after initial interaction.

### Anti-Patterns

**Rendering user-specific content in SSR without caching.** SSR that includes personalized data (user name, cart count, recommendations) cannot be cached and must re-render for every request. Render a generic shell server-side and populate personalized content client-side.

**Blocking SSR on slow external APIs.** If SSR waits for a slow third-party API (payment processor, inventory system), TTFB suffers. Use streaming SSR with Suspense so the shell renders immediately and slow data streams in later.

**Hydrating everything at once.** Full-page hydration blocks the main thread for hundreds of milliseconds on large pages. Use Suspense boundaries to enable selective hydration, prioritizing above-fold interactive elements.

**Duplicating data in HTML and JavaScript.** SSR often embeds fetched data as `<script>window.__DATA__=...</script>` for hydration. If this data is large (>50KB), it doubles the page weight. Use streaming to send data alongside components, or use Server Components to avoid client-side data transfer entirely.

## Source

- React: renderToPipeableStream — https://react.dev/reference/react-dom/server/renderToPipeableStream
- Next.js: Streaming SSR — https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming
- web.dev: Rendering on the Web — https://web.dev/articles/rendering-on-the-web
- React Server Components RFC — https://github.com/reactjs/rfcs/blob/main/text/0188-server-components.md

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- SSR produces visible content (FCP) within 1 second on broadband connections.
- Streaming SSR is used with Suspense boundaries to prevent TTFB blocking on slow data.
- Hydration is selective — above-fold interactive components hydrate before below-fold.
- Data fetching during SSR runs in parallel (no waterfall).
- Server Components are used for non-interactive content to eliminate hydration cost.
