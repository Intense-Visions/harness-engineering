# Largest Contentful Paint (LCP)

> Measure and optimize LCP — the time until the largest visible content element renders — by decomposing it into 4 sub-parts (TTFB, resource load delay, resource load time, element render delay) and targeting each with specific strategies.

## When to Use

- Lighthouse or CrUX reports LCP exceeding 2.5 seconds at the 75th percentile
- The hero image or main content block takes noticeably long to appear
- You need to determine whether LCP is bottlenecked by server response, resource loading, or rendering
- A Single Page Application has poor LCP because content depends on JavaScript execution
- Field data (CrUX, RUM) shows LCP regression after a deployment
- You are implementing `fetchpriority` or `<link rel="preload">` for critical resources
- Lazy-loading might be accidentally applied to above-the-fold images
- Server response time (TTFB) exceeds 800ms and contributes to LCP delay
- You need to identify which element is the LCP candidate on a given page
- Image optimization (format, compression, sizing) could reduce LCP resource load time

## Instructions

1. **Identify the LCP element.** In Chrome DevTools, run a Lighthouse audit or use the Performance panel. The LCP element is highlighted in the Performance Insights panel. Common LCP elements: hero images, background images via CSS, large text blocks, video poster images. The LCP candidate can change during load — the browser reports the largest element at the time each candidate is rendered.

2. **Decompose LCP into 4 sub-parts.** Every millisecond of LCP belongs to one of these phases:
   - **TTFB (Time to First Byte)** — Time from navigation start to first byte of HTML. Target: <800ms. Affected by server processing, CDN, redirects.
   - **Resource load delay** — Time from TTFB to when the LCP resource starts downloading. This is the gap caused by the browser not discovering the resource early enough.
   - **Resource load time** — Time to download the LCP resource. Affected by file size, compression, CDN, connection speed.
   - **Element render delay** — Time from resource loaded to LCP element rendered. Caused by render-blocking CSS/JS, main thread contention.

3. **Optimize TTFB.** Reduce server response time:
   - Use a CDN with edge caching for HTML documents
   - Implement stale-while-revalidate caching headers
   - Reduce redirect chains (each redirect adds 300-600ms)
   - Stream HTML to flush `<head>` early

4. **Eliminate resource load delay.** Ensure the browser discovers the LCP resource as early as possible:

   ```html
   <!-- Preload the LCP image so the browser fetches it immediately -->
   <link rel="preload" href="/hero.webp" as="image" fetchpriority="high" />

   <!-- For responsive images, preload with srcset -->
   <link
     rel="preload"
     href="/hero-800.webp"
     as="image"
     imagesrcset="/hero-400.webp 400w, /hero-800.webp 800w"
     imagesizes="100vw"
   />
   ```

5. **Reduce resource load time.** Optimize the LCP resource itself:
   - Use modern formats: WebP (26-34% smaller than JPEG) or AVIF (50% smaller)
   - Serve correctly sized images (do not serve 4000px when viewport needs 800px)
   - Enable compression (Brotli for text, already compressed for images)
   - Use a CDN with HTTP/2 or HTTP/3

6. **Minimize element render delay.** Remove bottlenecks between resource load and render:
   - Eliminate render-blocking CSS that is not needed for the LCP element
   - Inline critical CSS to avoid waiting for external stylesheet download
   - Do not wrap LCP elements in JavaScript-rendered containers (client-side rendering adds JS parse + execute + fetch + render)

7. **Never lazy-load the LCP image.** `loading="lazy"` on the LCP image delays its discovery and loading:

   ```html
   <!-- BAD — hero image waits for intersection observer, delaying LCP -->
   <img src="/hero.webp" loading="lazy" alt="Hero" />

   <!-- GOOD — hero image loads immediately with high priority -->
   <img src="/hero.webp" fetchpriority="high" alt="Hero" />
   ```

## Details

### LCP Thresholds

| Rating            | LCP (p75) | Description                 |
| ----------------- | --------- | --------------------------- |
| Good              | <= 2.5s   | Users perceive load as fast |
| Needs improvement | <= 4.0s   | Noticeable delay            |
| Poor              | > 4.0s    | Users likely to abandon     |

These thresholds are at the 75th percentile of page loads — meaning 75% of users should see LCP under 2.5s for a "good" rating.

### Worked Example: Vodafone LCP Optimization

Vodafone improved LCP by 31%, from 4.2s to 2.9s. The sub-part breakdown before optimization:

- TTFB: 800ms (acceptable)
- Resource load delay: 1,800ms (hero image not discovered until CSS was parsed)
- Resource load time: 1,200ms (large JPEG, no CDN)
- Element render delay: 400ms (render-blocking analytics script)

Fixes applied:

1. Added `<link rel="preload" href="/hero.webp" as="image" fetchpriority="high">` in `<head>` — resource load delay dropped from 1,800ms to 300ms
2. Converted hero from 850KB JPEG to 200KB WebP — resource load time dropped from 1,200ms to 350ms
3. Deferred analytics script — render delay dropped from 400ms to 50ms

### Worked Example: The Economic Times SSR Migration

The Economic Times reduced LCP from 7s to 2.5s by switching from client-side rendering (CSR) to server-side rendering (SSR) with streamed HTML. Under CSR, LCP required: HTML download (200ms) + JS bundle download (1.5s) + JS parse and execute (2s) + API fetch (1.5s) + render (500ms) + image load (1.3s). Under SSR, the HTML already contains the rendered content, so LCP required: HTML download with streamed flush (200ms) + image preloaded in parallel (800ms) + render (200ms).

### LCP Element Types

The LCP API considers these element types:

- `<img>` elements (including `<img>` inside `<picture>`)
- `<image>` inside `<svg>`
- `<video>` poster images (the poster attribute image, not the video itself)
- Elements with `background-image` loaded via CSS `url()`
- Block-level elements containing text nodes (paragraphs, headings)

Elements with `opacity: 0`, `visibility: hidden`, or zero-size are excluded.

### Measuring LCP with the Performance API

```javascript
const observer = new PerformanceObserver((list) => {
  const entries = list.getEntries();
  const lastEntry = entries[entries.length - 1];
  console.log('LCP:', lastEntry.startTime, 'Element:', lastEntry.element);
  console.log('URL:', lastEntry.url); // resource URL for images
  console.log('Size:', lastEntry.size); // area in pixels
});
observer.observe({ type: 'largest-contentful-paint', buffered: true });
```

### Anti-Patterns

**Lazy-loading the LCP image.** `loading="lazy"` defers image loading until it enters the viewport, detected by an IntersectionObserver. For the LCP image (which is by definition visible in the viewport), this adds unnecessary delay — the image is not fetched until after layout determines it is visible, instead of immediately on HTML parse.

**LCP element loaded via JavaScript.** Client-side rendering means the LCP element does not exist in the initial HTML. The browser must download JavaScript, parse it, execute it, potentially fetch data from an API, then render the element. This adds 2-5 seconds to LCP compared to server-side rendering.

**Excessive redirect chains before the document.** Each HTTP redirect adds a full roundtrip (300-600ms). A chain of marketing-tracking redirect to www redirect to HTTPS redirect adds 1-2 seconds before the HTML even begins downloading.

**Unoptimized hero images.** A 6MB PNG hero image when a 200KB WebP would produce identical visual quality at the viewport size. Always serve correctly-sized, modern-format images. Use `<picture>` with `<source>` for format fallbacks.

**Render-blocking third-party scripts.** Synchronous third-party scripts (analytics, A/B testing, consent managers) in `<head>` delay rendering of the LCP element. Load them with `defer` or `async`, or load them after LCP fires.

## Source

- web.dev LCP documentation — https://web.dev/articles/lcp
- Chrome User Experience Report methodology — https://developers.google.com/web/tools/chrome-user-experience-report
- Web Vitals JavaScript library — https://github.com/GoogleChrome/web-vitals
- "Optimize Largest Contentful Paint" — https://web.dev/articles/optimize-lcp

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
- LCP is measured with the Performance API and meets the 2.5s threshold at p75.
- Each LCP sub-part is identified and optimized individually.
