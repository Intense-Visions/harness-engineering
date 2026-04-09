# Critical Rendering Path

> Understand and optimize the browser's 5-stage pixel pipeline — Parse HTML to DOM, Parse CSS to CSSOM, Render Tree construction, Layout, Paint and Composite — to minimize time-to-first-paint and eliminate render-blocking bottlenecks.

## When to Use

- A page shows a blank white screen for more than 1 second before any content appears
- Lighthouse flags "Eliminate render-blocking resources" as a performance opportunity
- Time to First Paint or First Contentful Paint exceeds 1.8 seconds on mobile
- The DevTools Network waterfall shows CSS or JS files blocking the initial render
- You need to decide between inlining critical CSS versus loading external stylesheets
- A page loads many resources in the `<head>` and you need to determine which are render-blocking
- Server response includes large HTML documents that could benefit from streaming/chunked delivery
- You are implementing a performance budget and need to understand critical path length, bytes, and resource count
- A Single Page Application shows delayed first paint due to JavaScript-dependent rendering
- Core Web Vitals field data shows LCP regression correlated with render-blocking resource changes

## Instructions

1. **Map the critical rendering path.** Open Chrome DevTools Performance panel with CPU throttling set to 4x slowdown. Record a page load. Identify these 5 stages in the flame chart:
   - **Parse HTML to DOM** — the HTML parser tokenizes and constructs the DOM tree incrementally
   - **Parse CSS to CSSOM** — CSS is parsed into the CSS Object Model; this is render-blocking by default
   - **Render Tree** — the browser combines DOM and CSSOM, excluding invisible nodes (`display: none`, `<head>`)
   - **Layout** — the browser computes exact position and size of every visible element in pixels
   - **Paint and Composite** — the browser fills pixels and composites layers to the screen

2. **Identify render-blocking resources.** In DevTools Network panel, filter by "Render-blocking" or look for CSS `<link>` tags and synchronous `<script>` tags in the `<head>`. Every render-blocking resource adds its download and parse time to time-to-first-paint.

3. **Measure the three critical path metrics:**
   - **Critical path length** — the number of roundtrips required to fetch all critical resources (minimum is 1 for the HTML document itself)
   - **Critical bytes** — total bytes of all render-blocking resources
   - **Critical resources** — count of resources that block first render

4. **Inline critical CSS.** Extract the CSS required for above-the-fold content (tools: Critical, Critters, PurgeCSS) and inline it in a `<style>` tag in `<head>`. Keep inlined CSS under 14KB — this matches TCP's initial congestion window (10 segments x ~1,460 bytes), meaning it arrives in the first network roundtrip.

   ```html
   <head>
     <style>
       /* Critical CSS — only above-the-fold styles, under 14KB */
       .hero {
         display: flex;
         min-height: 60vh;
       }
       .nav {
         position: sticky;
         top: 0;
         background: #fff;
       }
     </style>
     <link
       rel="preload"
       href="/styles/main.css"
       as="style"
       onload="this.onload=null;this.rel='stylesheet'"
     />
     <noscript><link rel="stylesheet" href="/styles/main.css" /></noscript>
   </head>
   ```

5. **Eliminate parser-blocking scripts.** Add `defer` or `async` to every `<script>` tag that does not need to run before first paint. Use `defer` for scripts that depend on DOM order; use `async` for independent scripts like analytics.

   ```html
   <!-- Parser-blocking (bad) — blocks HTML parsing until downloaded and executed -->
   <script src="/app.js"></script>

   <!-- Deferred (good) — downloads in parallel, executes after HTML parsing completes -->
   <script src="/app.js" defer></script>

   <!-- Async (good for independent scripts) — downloads in parallel, executes when ready -->
   <script src="/analytics.js" async></script>
   ```

6. **Use media queries on non-critical CSS.** A print stylesheet should not block rendering on screen:

   ```html
   <!-- Render-blocking for all media (bad) -->
   <link rel="stylesheet" href="/print.css" />

   <!-- Only blocks rendering when printing (good) -->
   <link rel="stylesheet" href="/print.css" media="print" />
   ```

7. **Enable streaming HTML.** Configure the server to flush the `<head>` section immediately (including critical CSS and preload hints) before the backend finishes generating the `<body>`. This allows the browser to start fetching critical resources while the server is still processing.

## Details

### The Pixel Pipeline in Depth

The browser processes each frame through five stages, and each stage depends on the output of the previous one:

1. **DOM Construction** — The HTML parser reads bytes, decodes characters, tokenizes tags, and builds nodes into the Document Object Model. This is incremental — the browser can start constructing the DOM before the entire HTML document arrives.

2. **CSSOM Construction** — CSS is not incremental. The browser must fully parse all CSS before it can compute styles, because later rules can override earlier ones (the cascade). This is why CSS is render-blocking: the browser will not paint until the CSSOM is complete.

3. **Render Tree** — Combines DOM and CSSOM. Walks the DOM, finds matching CSSOM rules for each visible node, and produces a tree of visible elements with computed styles. Elements with `display: none` are excluded entirely. Elements with `visibility: hidden` are included (they occupy space).

4. **Layout (Reflow)** — Converts the render tree's relative units (%, em, vh) into absolute pixel positions. Computes exact box geometry for every element. This is computationally expensive for deep DOM trees.

5. **Paint and Composite** — Rasterizes each layer into pixels, then composites layers together respecting z-order, transforms, and opacity. GPU-accelerated compositing handles `transform` and `opacity` changes without repaint.

### Worked Example: Google.com First Paint Optimization

Google.com achieves first paint in under 1 second on 3G networks. The technique: the entire critical CSS (~4KB) is inlined in the `<head>`, and the HTML payload for the search page is under 14KB total. This means the complete above-the-fold content arrives in the first TCP roundtrip (initial congestion window = 10 TCP segments = ~14KB). No additional network roundtrips are needed before the browser can construct DOM, CSSOM, render tree, and paint. External CSS and JavaScript are loaded with `defer` or dynamically injected after first paint.

### Worked Example: Shopify Storefront CRP Optimization

Shopify reduced their critical rendering path from 8 critical resources to 3 by auditing their storefront themes. The original CRP included 4 external CSS files and 4 synchronous JS files in `<head>`. They inlined critical CSS (6KB), deferred all JavaScript, and combined remaining CSS into one file loaded with `media="print"` and swapped to `media="all"` on load. The result: Start Render improved by 50% (from 3.2s to 1.6s on 3G) because the critical path length dropped from 4 roundtrips to 1.

### Anti-Patterns

**Render-blocking CSS without media queries.** Loading `print.css` without `media="print"` forces the browser to download and parse it before rendering anything on screen. Every CSS `<link>` in `<head>` without a specific media query blocks rendering for all media types.

**Synchronous scripts in `<head>` without `defer` or `async`.** A `<script src="...">` tag without attributes blocks HTML parsing entirely — the parser stops, downloads the script, executes it, then resumes parsing. This can add seconds to first paint if the script is large or on a slow connection.

**Over-inlining CSS.** Inlining the entire CSS framework (200KB+ of Tailwind or Bootstrap) defeats the purpose. Inlined CSS cannot be cached separately, so users re-download it on every page navigation. Inline only the critical above-the-fold CSS; load the rest asynchronously.

**Invisible text during font loading.** Using `font-display: block` (the default for many font services) makes text invisible until the web font downloads. On slow connections, users see a blank content area for 1-3 seconds. Use `font-display: swap` or `font-display: optional` to show fallback text immediately.

### Resource Priority and Discovery

The browser assigns fetch priority to resources based on their type and position:

- CSS `<link>` in `<head>` — Highest priority, render-blocking
- Synchronous `<script>` in `<head>` — High priority, parser-blocking
- `<script defer>` — Low priority during parse, executes in order after DOMContentLoaded
- `<script async>` — High priority download, executes immediately when ready (out of order)
- `<img>` above the fold — High priority (browsers use heuristics to detect viewport position)
- `<img>` below the fold — Low priority
- `<link rel="preload">` — High priority early fetch without blocking render

Use `fetchpriority="high"` to boost critical images (hero images, LCP candidates) and `fetchpriority="low"` to deprioritize below-the-fold resources that the browser might otherwise fetch eagerly.

### Measuring CRP Metrics in Code

```javascript
// Measure critical path timing with Navigation Timing API
const timing = performance.getEntriesByType('navigation')[0];
const ttfb = timing.responseStart - timing.requestStart;
const domParsing = timing.domInteractive - timing.responseStart;
const cssBlocking = timing.domContentLoadedEventStart - timing.domInteractive;
console.log(`TTFB: ${ttfb}ms, DOM parsing: ${domParsing}ms, CSS blocking: ${cssBlocking}ms`);
```

## Source

- Google Web Fundamentals: Critical Rendering Path — https://web.dev/articles/critical-rendering-path
- Ilya Grigorik, "High Performance Browser Networking" (O'Reilly)
- W3C Navigation Timing Level 2 — https://www.w3.org/TR/navigation-timing-2/
- HTTP Archive Web Almanac, Performance chapter

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
- Critical rendering path is measured before and after optimization with specific metrics.
- Render-blocking resources are identified and addressed with appropriate strategies.
