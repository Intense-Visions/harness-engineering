# Streaming Rendering

> Master streaming rendering — React Suspense-based streaming SSR, chunked transfer encoding, out-of-order HTML delivery, shell-first rendering, progressive page assembly, and error handling for streamed content to achieve the fastest possible Time to First Byte and progressive content delivery.

## When to Use

- SSR blocks on slow data fetches, delaying TTFB for the entire page
- Users wait for the full page to render before seeing any content
- A page depends on multiple data sources with different response times
- Traditional SSR returns a blank screen until all data is fetched and rendered
- TTFB is high because the server waits for the slowest API before responding
- Above-fold content is ready quickly but below-fold content blocks the response
- A page mixes fast data (cached) with slow data (database, third-party API)
- Progressive enhancement requires content to appear incrementally
- React 18+ is available and streaming SSR can replace renderToString
- Server response is buffered entirely before sending, wasting time-to-first-byte potential

## Instructions

1. **Understand streaming versus buffered SSR.** Traditional SSR buffers the entire HTML response. Streaming sends HTML chunks as they become ready:

   ```
   Buffered SSR (renderToString):
   Server: [fetch all data...400ms] [render...100ms] [send complete HTML]
   Browser:                                           [receive...parse...FCP]
   TTFB: 500ms  |  FCP: 600ms

   Streaming SSR (renderToPipeableStream):
   Server: [render shell...20ms] [stream shell HTML] [fetch slow data...] [stream rest]
   Browser:                      [receive shell...FCP]  [...progressive content]
   TTFB: 20ms  |  FCP: 100ms  |  Full content: 500ms
   ```

2. **Structure the page with Suspense boundaries for streaming.** Each Suspense boundary is a potential streaming point:

   ```typescript
   // The server streams each Suspense boundary independently
   export default function DashboardPage() {
     return (
       <Shell>
         {/* Streams immediately — no data dependency */}
         <Header />
         <Navigation />

         <div className="dashboard-grid">
           {/* Streams when metrics data resolves (~50ms) */}
           <Suspense fallback={<MetricsSkeleton />}>
             <MetricsPanel />
           </Suspense>

           {/* Streams when chart data resolves (~200ms) */}
           <Suspense fallback={<ChartSkeleton />}>
             <RevenueChart />
           </Suspense>

           {/* Streams when activity data resolves (~400ms) */}
           <Suspense fallback={<ActivitySkeleton />}>
             <RecentActivity />
           </Suspense>
         </div>
       </Shell>
     );
   }
   ```

3. **Implement streaming in a Node.js server.** Use renderToPipeableStream with onShellReady:

   ```typescript
   import { renderToPipeableStream } from 'react-dom/server';

   async function handleRequest(req: Request, res: Response) {
     const { pipe, abort } = renderToPipeableStream(
       <App url={req.url} />,
       {
         bootstrapScripts: ['/client.js'],

         onShellReady() {
           // The app shell (everything outside Suspense) is ready
           // Start streaming immediately — don't wait for Suspense content
           res.statusCode = 200;
           res.setHeader('Content-Type', 'text/html; charset=utf-8');
           res.setHeader('Transfer-Encoding', 'chunked');
           pipe(res);
         },

         onAllReady() {
           // Everything including Suspense content is ready
           // For crawlers/bots, wait for this instead of onShellReady
         },

         onShellError(error) {
           // Shell failed to render — send error page
           res.statusCode = 500;
           res.end('<h1>Something went wrong</h1>');
         },

         onError(error) {
           // Non-shell error — log but continue streaming
           console.error('Streaming error:', error);
         },
       }
     );

     // Abort streaming after timeout
     setTimeout(() => abort(), 10000);
   }
   ```

4. **Handle bot/crawler requests differently.** Detect bots via user-agent (`/bot|crawl|spider/i`). For users, call `pipe(res)` in `onShellReady` for fast TTFB. For bots, call `pipe(res)` in `onAllReady` so they receive complete HTML for SEO indexing.

5. **Understand out-of-order streaming mechanics.** React streams HTML in order (shell first), then replaces Suspense fallbacks out-of-order as data resolves:

   ```html
   <!-- Initial stream: shell + fallbacks -->
   <html>
     <body>
       <header>...</header>
       <div id="metrics">
         <!--$?--><template id="B:0"></template>
         <div class="skeleton">...</div>
         <!--/$-->
       </div>
       <div id="chart">
         <!--$?--><template id="B:1"></template>
         <div class="skeleton">...</div>
         <!--/$-->
       </div>

       <!-- Streamed later when metrics resolve (out of order, before chart): -->
       <div hidden id="S:0"><div class="metrics-panel">Real metrics content...</div></div>
       <script>
         $RC('B:0', 'S:0');
       </script>
       <!-- $RC swaps the fallback template with the real content -->

       <!-- Streamed even later when chart resolves: -->
       <div hidden id="S:1"><div class="chart">Real chart content...</div></div>
       <script>
         $RC('B:1', 'S:1');
       </script>
     </body>
   </html>
   ```

6. **Implement error boundaries for streamed content.** Individual Suspense sections can fail without crashing the entire stream:

   ```typescript
   // Error boundary catches failures in individual sections
   function StreamSection({ children, fallback }) {
     return (
       <ErrorBoundary fallback={<SectionError />}>
         <Suspense fallback={fallback}>
           {children}
         </Suspense>
       </ErrorBoundary>
     );
   }

   function DashboardPage() {
     return (
       <Shell>
         <StreamSection fallback={<MetricsSkeleton />}>
           <MetricsPanel />  {/* If this fails, shows SectionError */}
         </StreamSection>

         <StreamSection fallback={<ChartSkeleton />}>
           <RevenueChart />  {/* Independent — unaffected by metrics failure */}
         </StreamSection>
       </Shell>
     );
   }
   ```

7. **Configure streaming in Next.js App Router.** Next.js App Router streams by default with loading.tsx files:

   ```typescript
   // app/dashboard/loading.tsx — automatic Suspense boundary
   export default function DashboardLoading() {
     return <DashboardSkeleton />;
   }

   // app/dashboard/page.tsx — async component triggers streaming
   export default async function Dashboard() {
     const metrics = await getMetrics();  // data fetch during streaming
     return <MetricsDisplay data={metrics} />;
   }

   // Nested streaming with parallel data fetching:
   // app/dashboard/@metrics/page.tsx   — streams independently
   // app/dashboard/@chart/page.tsx     — streams independently
   // app/dashboard/layout.tsx          — renders the slot composition
   ```

## Details

### Chunked Transfer Encoding

Streaming SSR uses HTTP chunked transfer encoding (or HTTP/2 DATA frames). The server sends the response in chunks without knowing the total content length upfront. The browser incrementally parses and renders each chunk. This is a standard HTTP/1.1 feature (Transfer-Encoding: chunked) and is native to HTTP/2 and HTTP/3. No special client-side code is needed — browsers have always supported incremental HTML parsing.

### Shell Content Selection

The "shell" is everything outside Suspense boundaries. Choosing what goes in the shell is a critical design decision. Shell content should be: (1) immediately available (no data fetching), (2) visually meaningful (layout, navigation, headers), (3) sufficient for LCP (if LCP is text-based). Shell content should NOT include: data-dependent content, personalized content, or content that requires slow API calls.

### Worked Example: Vercel Dashboard

Five Suspense boundaries: navigation (shell, instant), project list (~30ms from cache), deployment status (~100ms from API), analytics (~300ms), team activity (~500ms). Users see navigation and project list within 50ms of TTFB. Perceived load is under 100ms despite the full page taking 600ms.

### Anti-Patterns

**Wrapping everything in a single Suspense boundary.** One large Suspense boundary behaves like buffered SSR — nothing streams until all data resolves. Use multiple Suspense boundaries around independent data sources.

**Putting the LCP element inside a Suspense boundary.** If the LCP element (hero image, main heading) is inside Suspense, it will not stream with the shell. LCP content must be in the shell for optimal Core Web Vitals.

**Not providing meaningful fallbacks.** Suspense fallbacks that are empty or just a spinner waste the opportunity to show a structural preview. Use skeleton screens that match the loaded content's layout and dimensions to prevent CLS.

**Ignoring streaming errors.** The onError callback in renderToPipeableStream fires for non-shell errors. Without logging and error handling, failed Suspense boundaries silently show fallbacks permanently. Monitor streaming errors to detect data source failures.

## Source

- React: Streaming SSR — https://react.dev/reference/react-dom/server/renderToPipeableStream
- Next.js: Streaming — https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming
- Dan Abramov: "New Suspense SSR Architecture" — https://github.com/reactwg/react-18/discussions/37
- HTTP Chunked Transfer Encoding — https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Transfer-Encoding

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- TTFB is under 100ms for the shell content (navigation, layout, LCP elements).
- Each independent data source has its own Suspense boundary for parallel streaming.
- LCP content is in the shell, not inside a Suspense boundary.
- Suspense fallbacks use skeleton screens that match loaded content dimensions.
- Streaming errors are logged and individual section failures do not crash the page.
