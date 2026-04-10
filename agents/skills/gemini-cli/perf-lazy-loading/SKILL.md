# Lazy Loading

> Master lazy loading strategies — Intersection Observer-based visibility triggers, route-based lazy loading, component-level deferral, progressive hydration, and virtual scrolling to minimize initial payload and prioritize above-the-fold content.

## When to Use

- Below-the-fold content loads JavaScript and assets that delay Time to Interactive
- A page renders 100+ items in a list but users see only 10 at a time
- Heavy components (charts, maps, editors) load on pages where they are not immediately visible
- Lighthouse flags "Defer offscreen images" or "Reduce unused JavaScript"
- Initial page load transfers >1MB of JavaScript before the user can interact
- Modal dialogs, tooltips, or dropdown content load eagerly despite being hidden
- Server-side rendered pages hydrate all components regardless of viewport visibility
- Infinite scroll or paginated lists need to load data as the user scrolls
- Third-party widgets (chat, analytics dashboards) compete with critical content for bandwidth
- Tab panels load content for all tabs even though only one tab is visible

## Instructions

1. **Identify lazy loading candidates.** Content below the fold, inside tabs, behind user interactions (modals, dropdowns), or conditional on feature flags is a candidate. Content above the fold or critical to LCP must NOT be lazy loaded.

2. **Implement Intersection Observer for visibility-based loading.** Load content only when it enters (or approaches) the viewport:

   ```typescript
   function useLazyLoad(rootMargin = '200px') {
     const ref = useRef<HTMLDivElement>(null);
     const [isVisible, setIsVisible] = useState(false);

     useEffect(() => {
       const observer = new IntersectionObserver(
         ([entry]) => {
           if (entry.isIntersecting) {
             setIsVisible(true);
             observer.disconnect();
           }
         },
         { rootMargin }  // start loading 200px before visible
       );
       if (ref.current) observer.observe(ref.current);
       return () => observer.disconnect();
     }, [rootMargin]);

     return { ref, isVisible };
   }

   // Usage
   function HeavyChartSection() {
     const { ref, isVisible } = useLazyLoad();
     return (
       <div ref={ref} style={{ minHeight: 400 }}>
         {isVisible ? <ExpensiveChart /> : <ChartPlaceholder />}
       </div>
     );
   }
   ```

3. **Combine lazy loading with code splitting.** Intersection Observer triggers the dynamic import, so neither the code nor the component renders until needed:

   ```typescript
   const HeavyChart = lazy(() => import('./HeavyChart'));

   function LazyChartSection() {
     const { ref, isVisible } = useLazyLoad('300px');
     return (
       <div ref={ref} style={{ minHeight: 400 }}>
         {isVisible && (
           <Suspense fallback={<ChartSkeleton />}>
             <HeavyChart />
           </Suspense>
         )}
       </div>
     );
   }
   ```

4. **Implement virtual scrolling for long lists.** Render only visible items plus a buffer zone. This handles thousands of items with constant DOM node count:

   ```typescript
   // Using @tanstack/react-virtual
   import { useVirtualizer } from '@tanstack/react-virtual';

   function VirtualList({ items }: { items: Item[] }) {
     const parentRef = useRef<HTMLDivElement>(null);
     const virtualizer = useVirtualizer({
       count: items.length,
       getScrollElement: () => parentRef.current,
       estimateSize: () => 60,
       overscan: 5,
     });

     return (
       <div ref={parentRef} style={{ height: 600, overflow: 'auto' }}>
         <div style={{ height: virtualizer.getTotalSize() }}>
           {virtualizer.getVirtualItems().map((virtualItem) => (
             <div
               key={virtualItem.key}
               style={{
                 position: 'absolute',
                 top: virtualItem.start,
                 height: virtualItem.size,
                 width: '100%',
               }}
             >
               <ListItem item={items[virtualItem.index]} />
             </div>
           ))}
         </div>
       </div>
     );
   }
   ```

5. **Defer non-critical third-party scripts.** Chat widgets, analytics dashboards, and social embeds should load after the critical path:

   ```typescript
   // Load third-party script after page is interactive
   function loadWhenIdle(src: string) {
     if ('requestIdleCallback' in window) {
       requestIdleCallback(() => {
         const script = document.createElement('script');
         script.src = src;
         document.body.appendChild(script);
       });
     } else {
       setTimeout(() => {
         const script = document.createElement('script');
         script.src = src;
         document.body.appendChild(script);
       }, 2000);
     }
   }

   // Usage after page load
   loadWhenIdle('https://widget.intercom.io/widget/abc123');
   ```

6. **Implement progressive hydration for SSR.** Hydrate above-the-fold components immediately, defer below-the-fold hydration until visible:

   ```typescript
   // Progressive hydration wrapper
   function LazyHydrate({ children, whenVisible = true }) {
     const { ref, isVisible } = useLazyLoad('100px');
     const [hydrated, setHydrated] = useState(!whenVisible);

     useEffect(() => {
       if (isVisible) setHydrated(true);
     }, [isVisible]);

     return (
       <div ref={ref} suppressHydrationWarning>
         {hydrated ? children : <div dangerouslySetInnerHTML={{
           __html: ''  // preserve server HTML until hydration
         }} />}
       </div>
     );
   }
   ```

7. **Set explicit dimensions on lazy-loaded containers.** Prevent Cumulative Layout Shift by reserving space for content before it loads:

   ```css
   .lazy-chart-container {
     min-height: 400px;
     aspect-ratio: 16 / 9;
     contain: layout size;
   }
   ```

## Details

### Intersection Observer Configuration

The `rootMargin` parameter controls when loading begins relative to the viewport. A value of `200px` means loading starts when the element is 200px from becoming visible. For fast-loading content (text, small images), `100px` is sufficient. For heavy components requiring code splitting and data fetching, `300-500px` provides buffer time. The `threshold` parameter (0 to 1) controls what fraction of the element must be visible to trigger — `0` (default) triggers as soon as any pixel enters the root margin.

### Worked Example: Pinterest Infinite Feed

Pinterest renders an initial batch of 25 pins, then uses Intersection Observer on a sentinel element near the bottom of the feed to trigger the next batch. Each pin image uses native lazy loading (`loading="lazy"`). The pin detail modal (which includes a heavy recommendation engine) is code-split and loaded only on click. Combined with virtual scrolling that unmounts off-screen pins, this keeps DOM node count under 500 even after scrolling through thousands of pins. Memory usage stays flat at ~120MB regardless of scroll depth.

### Worked Example: Airbnb Search Results Map

Airbnb's search results page lazy-loads the Google Maps component until the map container approaches the viewport on mobile (where the map is below results). On desktop, where the map is visible immediately, it loads eagerly. The map tiles themselves load progressively as the user pans. Search result cards use virtual scrolling with a 3-card overscan buffer. This approach reduced mobile TTI by 1.8 seconds compared to eagerly loading the map.

### Anti-Patterns

**Lazy loading above-the-fold content.** Content visible on initial render (hero images, headlines, primary CTA) must load eagerly. Lazy loading LCP elements directly harms Core Web Vitals — the browser cannot start loading until JavaScript executes.

**Missing placeholder dimensions.** Lazy-loaded containers without explicit height cause layout shift when content appears. Always set min-height, aspect-ratio, or use skeleton placeholders that match final dimensions.

**Intersection Observer without cleanup.** Failing to disconnect the observer when the component unmounts causes memory leaks in SPAs. Always call `observer.disconnect()` in the useEffect cleanup function.

**Lazy loading everything.** Excessive lazy loading adds JavaScript overhead (observer setup, promise resolution, re-renders) that exceeds the savings. Only lazy load content that is genuinely deferred — if 90% of users see it within 2 seconds, load it eagerly.

## Source

- MDN: Intersection Observer API — https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
- web.dev: Lazy loading — https://web.dev/articles/lazy-loading
- TanStack Virtual — https://tanstack.com/virtual/latest
- Chrome: Browser-level lazy loading — https://web.dev/articles/browser-level-image-lazy-loading

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Below-the-fold components load only when approaching the viewport.
- Long lists use virtual scrolling with constant DOM node count.
- Lazy-loaded containers have explicit dimensions preventing layout shift.
- Third-party scripts are deferred until after critical content is interactive.
- Initial JavaScript payload is reduced by at least 30% compared to eager loading.
