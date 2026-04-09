# Resource Hints

> Use preload, prefetch, preconnect, dns-prefetch, modulepreload, fetchpriority, and 103 Early Hints to inform the browser about resources needed soon — eliminating discovery latency and accelerating critical resource delivery.

## When to Use

- LCP is delayed because the browser discovers the hero image or critical font late during HTML parsing
- Third-party origins (fonts, analytics, CDN) add visible connection establishment delay
- Navigation to a likely next page is slow and could benefit from prefetching key resources
- ES module loading creates a waterfall as the browser discovers import dependencies sequentially
- The browser prioritizes a non-critical resource over a critical one (e.g., fetching below-fold images before hero image)
- 103 Early Hints is available on your server and you want to send preload hints before the full response
- A Single Page Application can predict the next route and prefetch its JavaScript chunks
- Fonts are discovered late (during CSS parsing) and cause FOIT or FOUT
- WebPageTest shows a "gap" in the waterfall where the browser has idle network capacity
- You need a systematic approach to resource loading prioritization

## Instructions

1. **Audit resource discovery timing.** Open Chrome DevTools Network panel and look for resources that start loading late despite being needed early. The "Initiator" column shows what triggered each request. Late-discovered resources are candidates for resource hints.

2. **Add preconnect for critical third-party origins.** Preconnect performs DNS + TCP + TLS ahead of time, saving 100-300ms per origin:

   ```html
   <head>
     <!-- Preconnect to critical third-party origins -->
     <link rel="preconnect" href="https://fonts.googleapis.com" />
     <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
     <link rel="preconnect" href="https://cdn.example.com" />

     <!-- dns-prefetch as fallback for older browsers -->
     <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
   </head>
   ```

   Limit preconnect to 4-6 origins maximum. Each preconnect consumes a socket and CPU for the TLS handshake.

3. **Use preload for late-discovered critical resources.** Preload tells the browser to fetch a resource immediately at high priority, even before it would normally be discovered:

   ```html
   <head>
     <!-- Preload LCP hero image (browser would discover it late in body) -->
     <link
       rel="preload"
       href="/images/hero.webp"
       as="image"
       type="image/webp"
       fetchpriority="high"
     />

     <!-- Preload critical font (browser discovers during CSS parsing) -->
     <link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin />

     <!-- Preload critical CSS that's loaded dynamically -->
     <link rel="preload" href="/styles/above-fold.css" as="style" />
   </head>
   ```

   **Critical rule:** Always include the `as` attribute. Without it, the browser cannot set the correct priority or content-security-policy check, and may double-fetch the resource.

4. **Use modulepreload for ES module dependency chains.** Standard preload does not parse module dependencies. Modulepreload fetches the module AND its static imports:

   ```html
   <!-- Preload the module and its dependency tree -->
   <link rel="modulepreload" href="/js/app.mjs" />
   <link rel="modulepreload" href="/js/utils.mjs" />
   ```

5. **Use prefetch for next-navigation resources.** Prefetch downloads resources at low priority for future navigations:

   ```html
   <!-- Prefetch likely next page's resources -->
   <link rel="prefetch" href="/dashboard/chunk.js" />
   <link rel="prefetch" href="/api/user/profile" />
   ```

6. **Use fetchpriority to override browser heuristics.** When the browser's automatic priority is wrong:

   ```html
   <!-- Boost LCP image priority -->
   <img src="/hero.webp" fetchpriority="high" alt="Hero" />

   <!-- Lower priority for below-fold images the browser might prioritize -->
   <img src="/ad-banner.webp" fetchpriority="low" alt="Ad" />

   <!-- Boost priority for critical async script -->
   <script src="/critical-widget.js" async fetchpriority="high"></script>
   ```

7. **Implement 103 Early Hints.** 103 Early Hints allows the server to send preload hints while still processing the request:

   ```
   HTTP/1.1 103 Early Hints
   Link: </styles/main.css>; rel=preload; as=style
   Link: </fonts/inter.woff2>; rel=preload; as=font; crossorigin
   Link: <https://cdn.example.com>; rel=preconnect

   HTTP/1.1 200 OK
   Content-Type: text/html
   ...
   ```

   This is especially valuable when the server takes 200-500ms to generate the response — the browser starts fetching resources during that wait time.

## Details

### Resource Hint Decision Tree

| Scenario                                         | Hint            | Priority              |
| ------------------------------------------------ | --------------- | --------------------- |
| Resource needed on THIS page, discovered late    | `preload`       | High                  |
| Resource needed on NEXT page (likely navigation) | `prefetch`      | Low (idle)            |
| Third-party origin needed soon                   | `preconnect`    | N/A (connection only) |
| Third-party origin might be needed               | `dns-prefetch`  | N/A (DNS only)        |
| ES module with dependency chain                  | `modulepreload` | High                  |
| Override browser's resource priority             | `fetchpriority` | Explicit              |

### Preload vs Prefetch

These are frequently confused. Preload is for the current navigation — it tells the browser "you will need this resource NOW, start fetching immediately at high priority." Prefetch is for future navigations — it tells the browser "the user might navigate here next, download this at idle priority if bandwidth allows."

Using prefetch for current-page resources wastes the first visit (resource loads at low priority). Using preload for next-page resources wastes bandwidth on resources that may never be used.

### Worked Example: Shopify LCP Improvement

Shopify improved LCP by 1.3 seconds on their storefront pages by adding two resource hints: (1) `<link rel="preload" href="/hero.webp" as="image" fetchpriority="high">` for the product hero image — previously discovered only when the browser parsed the `<img>` tag in the body, and (2) `<link rel="preconnect" href="https://cdn.shopify.com">` for their CDN origin — previously the connection was established on first resource request. The preload moved image fetch start from 800ms to 200ms (saving 600ms), and preconnect saved 300ms of connection overhead.

### Worked Example: Wikipedia DNS-Prefetch

Wikipedia reduced page load time by 300ms by implementing dns-prefetch for all external origins (Wikimedia Commons, upload.wikimedia.org, meta.wikimedia.org) and preloading critical fonts. Their pages reference 3-4 external origins, and dns-prefetch eliminated the DNS resolution delay (averaging 40-80ms per origin) from the critical path. They also preloaded their custom font (WikiFont, 28KB WOFF2) to prevent FOIT on first visits.

### Anti-Patterns

**Preloading everything.** If more than 3-5 resources are preloaded, they compete for bandwidth and may delay actually critical resources. Preload only resources that are: (1) critical for the current page, (2) discovered late by the browser, and (3) on the critical rendering path.

**Preload without `as` attribute.** Without `as`, the browser cannot determine the resource type, resulting in: (1) wrong fetch priority, (2) potential double-fetch when the resource is actually used, (3) CSP violations. Always specify: `as="image"`, `as="font"`, `as="style"`, `as="script"`, etc.

**Using prefetch for current-page resources.** Prefetch is low priority and may not complete before the resource is needed. If the resource is needed on the current page, use preload instead. Chrome shows a console warning when a preloaded resource is not used within 3 seconds.

**Too many preconnect hints.** Each preconnect opens a socket and performs a TLS handshake. Beyond 6 origins, the connection overhead (memory, CPU) creates diminishing returns and can actually slow down high-priority connections due to socket exhaustion.

## Source

- W3C Resource Hints Specification — https://www.w3.org/TR/resource-hints/
- W3C Preload Specification — https://www.w3.org/TR/preload/
- RFC 8297: 103 Early Hints — https://www.rfc-editor.org/rfc/rfc8297
- Chrome Priority System documentation — https://web.dev/articles/fetch-priority
- web.dev Preconnect guide — https://web.dev/articles/uses-rel-preconnect

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
- Critical resources (LCP image, primary font) are preloaded and start fetching within 200ms of navigation.
- Third-party origins have appropriate preconnect or dns-prefetch hints (maximum 6 preconnect hints).
- No unused preloads (Chrome DevTools shows no "preloaded but not used within 3 seconds" warnings).
