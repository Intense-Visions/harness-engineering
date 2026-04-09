# React Client Rendering

> Render React entirely in the browser for highly interactive single-page applications

## When to Use

- Building dashboards, admin tools, or SPAs where SEO is not required
- The application is behind authentication (no public search indexing needed)
- Extremely dynamic UI where server rendering provides little benefit
- Rapid prototyping or tooling (internal apps, developer tools)

## Instructions

1. Use Vite or Create React App (legacy) to scaffold a pure client-rendered app.
2. Mount React at a root element with `createRoot`:
   ```typescript
   import { createRoot } from 'react-dom/client';
   createRoot(document.getElementById('root')!).render(<App />);
   ```
3. For routing, use React Router or TanStack Router in client mode.
4. Serve a minimal `index.html` with a single `<div id="root">` from any static host.
5. Configure your hosting to redirect all routes to `index.html` for client-side routing.

## Details

Client-side rendering (CSR) sends an empty HTML shell to the browser; React builds the DOM entirely in JavaScript. The advantages are simplicity (no server) and rich interactivity; the disadvantages are slower Time to First Contentful Paint (FCP) and poor SEO.

**When CSR is appropriate:**

- Applications requiring authentication before first meaningful content
- Dashboards with real-time data that changes after load
- Apps with high interactivity that would not benefit from SSR

**Performance concerns:**

- Large JavaScript bundles increase time-to-interactive
- Mitigate with code-splitting (`React.lazy` + route-based splitting), tree-shaking, and CDN caching
- Core Web Vitals (LCP, FID/INP) are negatively affected by large bundles — measure before shipping

**Versus SSR/SSG:** If public SEO matters or First Contentful Paint is critical, use a framework with SSR (Next.js, Remix) or static generation instead.

## Source

https://patterns.dev/react/client-side-rendering

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
