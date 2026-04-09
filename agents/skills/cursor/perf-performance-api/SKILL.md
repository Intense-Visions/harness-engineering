# Performance API

> Master the browser Performance API — PerformanceObserver, Navigation Timing, Resource Timing, User Timing, Server Timing, and Element Timing — to build custom performance measurement, monitoring, and alerting into any web application.

## When to Use

- You need to measure custom business metrics (time-to-interactive for specific components, checkout flow duration)
- `PerformanceObserver` is needed to collect Web Vitals data (LCP, CLS, INP) in production
- Resource Timing data is needed to identify slow or large network requests
- Navigation Timing is needed to measure TTFB, DOM parsing, or total page load time
- Server Timing headers need to pass backend timing breakdowns to the frontend
- You are building a RUM (Real User Monitoring) pipeline to collect field performance data
- `performance.now()` is preferred over `Date.now()` for sub-millisecond precision
- The `buffered: true` flag is needed to capture entries that occurred before observer registration
- Long-lived SPAs need `performance.clearMarks()` and `performance.clearMeasures()` to prevent memory accumulation
- Element Timing API is needed to measure render time of specific elements

## Instructions

1. **Use `PerformanceObserver` (not `getEntriesByType`).** The observer pattern is more reliable — it captures entries as they occur and supports the `buffered` flag to retrieve entries that happened before registration:

   ```javascript
   const observer = new PerformanceObserver((list) => {
     for (const entry of list.getEntries()) {
       console.log(entry.entryType, entry.name, entry.startTime, entry.duration);
     }
   });

   // buffered: true captures entries that occurred before this line
   observer.observe({ type: 'resource', buffered: true });
   ```

2. **Measure custom business metrics with User Timing:**

   ```javascript
   // Mark the start of an operation
   performance.mark('checkout-start');

   // ... checkout logic ...

   // Mark the end
   performance.mark('checkout-end');

   // Measure the duration between marks
   const measure = performance.measure('checkout-duration', 'checkout-start', 'checkout-end');
   console.log('Checkout took:', measure.duration, 'ms');

   // Measure with metadata (User Timing Level 3)
   performance.measure('api-call', {
     start: 'api-start',
     end: 'api-end',
     detail: { endpoint: '/api/cart', method: 'POST' },
   });
   ```

3. **Extract Navigation Timing data:**

   ```javascript
   const nav = performance.getEntriesByType('navigation')[0];

   const metrics = {
     // DNS lookup
     dns: nav.domainLookupEnd - nav.domainLookupStart,
     // TCP connection
     tcp: nav.connectEnd - nav.connectStart,
     // TLS negotiation
     tls: nav.secureConnectionStart > 0 ? nav.connectEnd - nav.secureConnectionStart : 0,
     // Time to First Byte
     ttfb: nav.responseStart - nav.requestStart,
     // HTML download
     download: nav.responseEnd - nav.responseStart,
     // DOM parsing
     domParsing: nav.domInteractive - nav.responseEnd,
     // DOM content loaded
     domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
     // Total page load
     pageLoad: nav.loadEventEnd - nav.startTime,
   };
   ```

4. **Analyze resource loading with Resource Timing:**

   ```javascript
   const observer = new PerformanceObserver((list) => {
     for (const entry of list.getEntries()) {
       // transferSize = bytes over the network (0 means cache hit)
       // encodedBodySize = compressed size
       // decodedBodySize = uncompressed size
       if (entry.transferSize === 0) {
         console.log('Cache hit:', entry.name);
       } else {
         const compressionRatio = entry.decodedBodySize / entry.encodedBodySize;
         console.log(
           'Resource:',
           entry.name,
           'Size:',
           entry.transferSize,
           'Compression:',
           compressionRatio.toFixed(2)
         );
       }
     }
   });
   observer.observe({ type: 'resource', buffered: true });
   ```

5. **Read Server Timing from response headers:**

   ```javascript
   // Server sends: Server-Timing: db;dur=53, cache;desc="Cache Read";dur=2, app;dur=120
   const resources = performance.getEntriesByType('resource');
   for (const resource of resources) {
     if (resource.serverTiming) {
       for (const timing of resource.serverTiming) {
         console.log(`${timing.name}: ${timing.duration}ms (${timing.description})`);
         // db: 53ms, cache: 2ms (Cache Read), app: 120ms
       }
     }
   }
   ```

6. **Use Element Timing for specific element render time:**

   ```html
   <!-- Add elementtiming attribute to elements you want to measure -->
   <img src="/hero.jpg" elementtiming="hero-image" alt="Hero" />
   <h1 elementtiming="main-heading">Page Title</h1>
   ```

   ```javascript
   const observer = new PerformanceObserver((list) => {
     for (const entry of list.getEntries()) {
       console.log(entry.identifier, 'rendered at:', entry.startTime, 'ms');
     }
   });
   observer.observe({ type: 'element', buffered: true });
   ```

7. **Use `performance.now()` for high-resolution timing:**

   ```javascript
   // performance.now() — microsecond precision, monotonic (not affected by clock adjustments)
   const start = performance.now();
   doExpensiveWork();
   const elapsed = performance.now() - start;
   console.log(`Elapsed: ${elapsed.toFixed(3)}ms`);

   // Date.now() — millisecond precision, wall clock (affected by NTP, manual adjustments)
   // DO NOT use Date.now() for performance measurement
   ```

## Details

### PerformanceEntry Types Reference

| Entry Type                 | Source                        | Key Properties                                     |
| -------------------------- | ----------------------------- | -------------------------------------------------- |
| `navigation`               | Page load                     | `responseStart`, `domInteractive`, `loadEventEnd`  |
| `resource`                 | Each network request          | `transferSize`, `encodedBodySize`, `serverTiming`  |
| `mark`                     | `performance.mark()`          | `name`, `startTime`                                |
| `measure`                  | `performance.measure()`       | `name`, `duration`, `detail`                       |
| `longtask`                 | Tasks >50ms                   | `duration`, `attribution`                          |
| `event`                    | User interactions             | `processingStart`, `processingEnd`, `duration`     |
| `largest-contentful-paint` | LCP candidate                 | `element`, `url`, `size`, `startTime`              |
| `layout-shift`             | Visual shifts                 | `value`, `hadRecentInput`, `sources`               |
| `element`                  | Elements with `elementtiming` | `identifier`, `startTime`, `element`               |
| `paint`                    | FP and FCP                    | `name` (`first-paint` or `first-contentful-paint`) |

### Worked Example: Etsy Product Card Timing

Etsy measures time-to-render for each product card on search results pages. They place `performance.mark('card-render-start')` before hydrating each card and `performance.mark('card-render-end')` after:

```javascript
function renderProductCard(card, index) {
  performance.mark(`card-${index}-start`);
  hydrateCard(card);
  performance.mark(`card-${index}-end`);
  performance.measure(`card-${index}-render`, `card-${index}-start`, `card-${index}-end`);
}

// Aggregate and send to analytics
const measures = performance
  .getEntriesByType('measure')
  .filter((m) => m.name.includes('card'))
  .map((m) => m.duration);
const p50 = percentile(measures, 50);
const p95 = percentile(measures, 95);
sendToGrafana({ cardRenderP50: p50, cardRenderP95: p95 });
```

### Worked Example: Cloudflare Server Timing

Cloudflare uses `Server-Timing` headers to pass backend timing breakdowns through to the browser. The edge server adds headers: `Server-Timing: edge;dur=2, origin;dur=150, db;dur=53`. The frontend Performance API reads these without any custom telemetry:

```javascript
const pageNav = performance.getEntriesByType('navigation')[0];
if (pageNav.serverTiming) {
  const timingMap = Object.fromEntries(pageNav.serverTiming.map((t) => [t.name, t.duration]));
  // { edge: 2, origin: 150, db: 53 }
  dashboard.update(timingMap);
}
```

This gives frontend dashboards full-stack timing visibility: TTFB = 200ms, of which edge processing = 2ms, origin fetch = 150ms, database = 53ms.

### Cross-Origin Timing Restrictions

By default, Resource Timing entries for cross-origin resources have zero values for detailed timing (DNS, TCP, TLS, request/response). This is a privacy protection. To enable full timing:

1. The cross-origin server must include `Timing-Allow-Origin: *` (or the specific origin) in response headers
2. Without this header, only `startTime`, `duration`, `transferSize` (sometimes 0), and `encodedBodySize` (0) are available

### Anti-Patterns

**Polling `performance.getEntriesByType()` instead of using `PerformanceObserver`.** Polling wastes CPU, misses entries between polls, and does not capture entries that occur after the poll. `PerformanceObserver` fires exactly when entries are available.

**Forgetting `buffered: true` on observer.** Without `buffered: true`, entries that occurred before observer registration are missed. For LCP, CLS, and navigation timing, these entries always occur before your observer code runs.

**Not clearing marks and measures in SPAs.** In long-lived single-page applications, marks and measures accumulate in the performance buffer. Without `performance.clearMarks()` and `performance.clearMeasures()`, memory grows linearly with user actions. Clear after sending data to analytics.

**Using `Date.now()` for performance measurement.** `Date.now()` has 1ms resolution, is affected by system clock adjustments (NTP sync, manual changes), and can go backward. `performance.now()` has 5-microsecond resolution (subject to cross-origin isolation), is monotonic, and is unaffected by clock adjustments.

**Measuring in non-isolated contexts expecting full precision.** Without cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`), `performance.now()` is rounded to 100 microseconds (not 5 microseconds). For sub-millisecond measurements, enable cross-origin isolation.

## Source

- W3C Performance Timeline Level 2 — https://www.w3.org/TR/performance-timeline/
- W3C User Timing Level 3 — https://www.w3.org/TR/user-timing/
- W3C Resource Timing Level 2 — https://www.w3.org/TR/resource-timing-2/
- W3C Navigation Timing Level 2 — https://www.w3.org/TR/navigation-timing-2/
- MDN Performance API reference — https://developer.mozilla.org/en-US/docs/Web/API/Performance_API

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
- Custom performance metrics are measured with User Timing API and sent to analytics.
- PerformanceObserver is used with `buffered: true` for all metric collection.
