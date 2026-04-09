# Svelte Performance Patterns

> Minimize bundle size, reduce perceived latency, and handle large datasets efficiently in SvelteKit applications

## When to Use

- You are seeing slow initial page loads due to large JavaScript bundles
- Users experience navigation delay between pages in your SvelteKit app
- You are rendering large lists (100+ items) that cause janky scrolling
- You want to improve Core Web Vitals (LCP, FID/INP, CLS) scores

## Instructions

**Code splitting — automatic with SvelteKit:**

1. SvelteKit automatically code-splits at the route level. Each page's JavaScript is only loaded when the route is navigated to. Verify this is working by checking that bundle chunks are created per route:

```bash
npm run build
# Check .svelte-kit/output/client/_app/immutable/chunks/
```

2. Manually split heavy components using dynamic imports:

```svelte
<script lang="ts">
  let HeavyChart: typeof import('./HeavyChart.svelte').default | null = $state(null)

  async function loadChart() {
    const module = await import('./HeavyChart.svelte')
    HeavyChart = module.default
  }
</script>

<button onclick={loadChart}>Show Chart</button>
{#if HeavyChart}
  <svelte:component this={HeavyChart} {data} />
{/if}
```

**Link preloading — data-sveltekit-preload-data:**

3. Start loading page data before the user clicks by adding `data-sveltekit-preload-data` to links:

```svelte
<!-- Preload on hover (default behavior for most links) -->
<a href="/dashboard" data-sveltekit-preload-data="hover">Dashboard</a>

<!-- Preload immediately on page load (for critical next steps) -->
<a href="/getting-started" data-sveltekit-preload-data="eager">Get Started</a>

<!-- Disable preloading (for links with side effects) -->
<a href="/logout" data-sveltekit-preload-data="off">Logout</a>
```

4. Preload code (JS chunks) separately from data using `data-sveltekit-preload-code`:

```svelte
<!-- Load the JS bundle for this route on hover, without fetching data yet -->
<a href="/editor" data-sveltekit-preload-code="hover">Open Editor</a>
```

5. Set global preload behavior in `svelte.config.js`:

```javascript
export default {
  kit: {
    preloadStrategy: 'modulepreload', // 'modulepreload' (default) | 'preload-js' | 'preload-mjs'
  },
};
```

**Streaming slow data:**

6. Stream slow database queries or API calls so the initial HTML renders immediately with a loading state:

```typescript
// +page.server.ts
export const load: PageServerLoad = async ({ params }) => {
  const product = await getProduct(params.id); // fast — awaited
  const reviews = getReviews(params.id); // slow — NOT awaited, returns promise

  return { product, reviews };
};
```

```svelte
<!-- +page.svelte -->
{#await data.reviews}
  <ReviewsSkeleton />
{:then reviews}
  <ReviewsList {reviews} />
{:catch error}
  <p>Failed to load reviews.</p>
{/await}
```

**Virtualizing large lists:**

7. For lists with 500+ items, use a virtual scroller. Install `svelte-virtual-scroll-list` or implement a basic version:

```svelte
<script lang="ts">
  import { VirtualList } from 'svelte-virtual-scroll-list'
  let { items }: { items: Item[] } = $props()
</script>

<VirtualList {items} let:item height={400} itemHeight={50}>
  <div class="row">{item.name}</div>
</VirtualList>
```

**Image optimization:**

8. Use the `loading="lazy"` attribute for below-fold images to defer loading:

```svelte
<img src="/photo.jpg" alt="Description" loading="lazy" decoding="async" />
```

9. Use `srcset` and `sizes` for responsive images:

```svelte
<img
  src="/image-800.jpg"
  srcset="/image-400.jpg 400w, /image-800.jpg 800w, /image-1200.jpg 1200w"
  sizes="(max-width: 600px) 400px, (max-width: 1024px) 800px, 1200px"
  alt="Hero image"
/>
```

**Reducing reactive overhead:**

10. Avoid creating new objects in templates — they cause unnecessary re-renders:

```svelte
<!-- Bad: creates new object every render -->
<Component config={{ theme: 'dark', size: 'lg' }} />

<!-- Good: stable reference -->
<script>
  const config = { theme: 'dark', size: 'lg' }
</script>
<Component {config} />
```

11. Use `$state.raw` for large objects that only change by full replacement:

```typescript
// Avoids deep reactivity proxy overhead
let dataset = $state.raw<DataPoint[]>(initialData);
// Update only via full reassignment:
dataset = await fetchNewData();
```

## Details

**SvelteKit preloading strategy:**

SvelteKit's link preloading works in two steps:

1. `preload-code` — fetches the JavaScript chunk for the destination route
2. `preload-data` — runs the destination route's load function

Default behavior: on tap/click, SvelteKit preloads code. With `data-sveltekit-preload-data="hover"`, data preloading starts on hover — making navigation feel instant.

**Bundle analysis:**

Identify large dependencies causing bundle bloat:

```bash
npx vite-bundle-visualizer
# or
npm run build -- --report
```

Common culprits: `moment.js` (use `date-fns` instead), `lodash` (use individual imports), large chart libraries (load dynamically).

**SvelteKit performance vs. React:**

Svelte compiles to vanilla JavaScript with no virtual DOM — component updates are surgical DOM mutations. This eliminates reconciliation overhead for interactions but doesn't remove the need for virtualization on very large lists.

**Prerender for maximum performance:**

For content that doesn't change per-user, prerender pages at build time:

```typescript
// +page.ts
export const prerender = true;
```

Prerendered pages are served as static HTML with no server processing time — ideal for marketing pages, docs, and blog posts.

**Web Vitals checklist:**

- **LCP** — prerender or stream; optimize above-fold images; preload critical routes
- **INP** — avoid heavy synchronous work in event handlers; defer with `setTimeout` or `scheduler.yield()`
- **CLS** — reserve space for images with `width`/`height` attributes or CSS `aspect-ratio`; avoid injecting content above existing content

## Source

https://kit.svelte.dev/docs/link-options

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
