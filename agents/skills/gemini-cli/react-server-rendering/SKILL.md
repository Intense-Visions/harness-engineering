# React Server Rendering

> Pre-render React components on the server for improved SEO and initial load performance

## When to Use

- Public-facing pages where SEO and crawler indexability matter
- Applications where First Contentful Paint performance is critical
- You need personalized content rendered per-request (not suitable for static generation)
- Using Next.js Pages Router (`getServerSideProps`), Remix (`loader`), or custom Express + `renderToString`

## Instructions

1. In Next.js Pages Router, export `getServerSideProps` to fetch data server-side:
   ```typescript
   export async function getServerSideProps(context: GetServerSidePropsContext) {
     const data = await fetchData(context.params.id);
     return { props: { data } };
   }
   ```
2. In Remix, export a `loader` function:
   ```typescript
   export async function loader({ params }: LoaderFunctionArgs) {
     return json(await fetchData(params.id));
   }
   ```
3. The server renders the full HTML; the browser displays it immediately (no blank page flash).
4. React hydrates the server-rendered HTML on the client, attaching event handlers.
5. Use `cache` headers appropriately — per-request SSR bypasses CDN caching.

## Details

SSR sends fully-rendered HTML from the server. The browser displays content immediately while React hydrates in the background, making the UI interactive.

**SSR vs SSG:**

- **SSG (Static Generation):** HTML generated at build time. Fast, cacheable, but requires rebuild for updates.
- **SSR:** HTML generated per-request. Always fresh, but has server cost and latency.
- **ISR (Next.js):** Static with time-based revalidation — best of both for many cases.

**Hydration mismatch:** If server-rendered HTML differs from what client React would render, React throws a hydration error. Common causes: `Date.now()`, `Math.random()`, browser-only APIs in render paths. Suppress with `suppressHydrationWarning` for known-safe mismatches.

**React 18 streaming:** `renderToPipeableStream` streams HTML to the browser progressively, enabling Suspense boundaries to stream in chunks. Improves TTFB for slow data.

## Source

https://patterns.dev/react/server-side-rendering
