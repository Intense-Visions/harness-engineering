# CSS Performance Patterns

> Optimize CSS performance with content-visibility, containment, efficient selectors, and Core Web Vitals-friendly patterns

## When to Use

- Long pages with many elements causing slow initial render
- Cumulative Layout Shift (CLS) issues from images, fonts, or dynamic content
- Large CSS bundles slowing down First Contentful Paint (FCP)
- Animations causing jank (dropped frames below 60fps)

## Instructions

1. Use `content-visibility: auto` on off-screen sections to skip rendering until they scroll into view.
2. Reserve space for images and embeds with explicit `width` and `height` or `aspect-ratio` to prevent CLS.
3. Use `will-change` sparingly and only on elements about to animate — it allocates GPU memory.
4. Prefer `transform` and `opacity` animations over properties that trigger layout (see animation skill).
5. Minimize Tailwind output by configuring `content` paths precisely to avoid scanning unnecessary files.
6. Use `font-display: swap` for web fonts to prevent invisible text during font loading.

```tsx
// content-visibility for long lists
function ProductList({ products }: { products: Product[] }) {
  return (
    <div>
      {products.map((product) => (
        <div
          key={product.id}
          className="contain-layout-style"
          style={{
            contentVisibility: 'auto',
            containIntrinsicSize: '0 200px', // Estimated height
          }}
        >
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}

// Prevent CLS with aspect ratio
function ResponsiveImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-gray-100">
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        width={1280}
        height={720}
      />
    </div>
  );
}

// Skeleton loader that matches final layout
function CardSkeleton() {
  return (
    <div className="rounded-lg border p-6 space-y-4">
      <div className="h-6 w-3/4 bg-gray-200 rounded animate-pulse" />
      <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
      <div className="h-4 w-5/6 bg-gray-200 rounded animate-pulse" />
      <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
    </div>
  );
}
```

```css
/* Font loading optimization */
@font-face {
  font-family: 'Inter';
  font-display: swap; /* Show fallback immediately, swap when loaded */
  src: url('/fonts/inter.woff2') format('woff2');
  font-weight: 100 900;
}
```

## Details

**content-visibility: auto:** The browser skips rendering for off-screen elements. On pages with 500+ elements, this can reduce initial render time by 50% or more. The `containIntrinsicSize` hint prevents layout shifts when elements come into view.

**CSS containment** (`contain` property):

- `layout` — element's layout does not affect siblings
- `paint` — element's content does not render outside its bounds
- `style` — counters and quotes are scoped
- `content` — shorthand for `layout paint style`
- `strict` — shorthand for `layout paint style size`

Tailwind utilities: `contain-none`, `contain-content`, `contain-strict`, `contain-layout`, `contain-paint`.

**Tailwind bundle optimization:**

- Precise `content` configuration: `['./src/app/**/*.tsx', './src/components/**/*.tsx']`
- Do not include `node_modules` in content paths (massive scan, no utility matches)
- Use `safelist` only for truly dynamic classes (from API data)
- Tailwind v3 purges unused utilities automatically in production

**Core Web Vitals impact:**

| Metric | CSS Impact                       | Solution                                  |
| ------ | -------------------------------- | ----------------------------------------- |
| LCP    | Large CSS blocks render          | Critical CSS inlining, font-display: swap |
| CLS    | Dynamic size changes             | aspect-ratio, explicit dimensions         |
| INP    | Layout thrashing from animations | transform/opacity only, containment       |

**will-change anti-pattern:**

```css
/* Bad — permanently allocates GPU memory for all cards */
.card {
  will-change: transform;
}

/* Good — only when animation is imminent */
.card:hover {
  will-change: transform;
}
.card.animating {
  will-change: transform, opacity;
}
```

**Lazy loading images:**

```tsx
// Native lazy loading
<img loading="lazy" decoding="async" src="..." />;

// Next.js Image component handles this automatically
import Image from 'next/image';
<Image src="..." width={800} height={400} alt="..." />;
```

**CSS performance debugging:** Use Chrome DevTools > Performance panel to identify:

- Long "Recalculate Style" events (too many or complex selectors)
- Layout thrashing (forced synchronous layouts)
- Paint storms (large areas repainted frequently)

## Source

https://web.dev/articles/content-visibility
