# Next.js Image Optimization

> Serve optimized, correctly sized images automatically with next/image

## When to Use

- Displaying images in any Next.js page or component
- Improving Core Web Vitals (LCP, CLS) by preventing layout shift and lazy loading images
- Serving modern formats (WebP, AVIF) without manual conversion
- Building responsive images that adapt to viewport and container size
- Loading above-the-fold images with priority to improve LCP score

## Instructions

1. Import `Image` from `next/image` instead of the HTML `<img>` tag for all content images.
2. Always provide `width` and `height` props for images with known dimensions to prevent layout shift (CLS).
3. Use `fill` prop with a positioned parent (`position: relative`) for images that should fill their container — omit `width` and `height` when using `fill`.
4. Add `priority` to the first image visible in the viewport (the LCP element) to disable lazy loading and preload it.
5. Use the `sizes` prop to tell the browser how wide the image will be at each breakpoint — this enables accurate `srcset` selection.
6. Add remote domains to `images.remotePatterns` in `next.config.ts` before using external image URLs.
7. Use `placeholder="blur"` with `blurDataURL` for a low-quality preview while the image loads.
8. For static imports, Next.js generates `blurDataURL` automatically — `import logo from './logo.png'` and pass the imported object.

```typescript
// next.config.ts
const config = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.example.com', pathname: '/images/**' },
    ],
  },
};

// app/products/[id]/page.tsx
import Image from 'next/image';
import heroImage from '@/public/hero.jpg'; // static import — dimensions known

export default function ProductPage() {
  return (
    <div>
      {/* Static import — auto blur placeholder, auto width/height */}
      <Image src={heroImage} alt="Hero" priority placeholder="blur" />

      {/* Remote image — fill mode for responsive container */}
      <div className="relative h-64 w-full">
        <Image
          src="https://cdn.example.com/images/product.jpg"
          alt="Product"
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />
      </div>
    </div>
  );
}
```

## Details

`next/image` wraps the HTML `<img>` element with automatic size optimization, format conversion, and lazy loading. The optimization pipeline runs server-side: Next.js resizes and converts images to WebP or AVIF on first request and caches the result.

**`sizes` attribute importance:** Without `sizes`, the browser assumes the image is `100vw` wide and downloads a larger source than necessary. Providing accurate `sizes` (e.g., `"(max-width: 640px) 100vw, 640px"`) reduces bandwidth significantly.

**fill mode:** Use `fill` when the image dimensions are unknown or when the image should fill a CSS-controlled container. The parent must have `position: relative` (or `absolute`/`fixed`). Use `className="object-cover"` or `className="object-contain"` on the Image to control aspect ratio.

**priority vs lazy:** All images are lazy-loaded by default (loaded when they enter the viewport). The `priority` prop disables lazy loading and adds a `<link rel="preload">` — use it for the LCP image only. Adding `priority` to multiple images defeats its purpose.

**Layout shift (CLS):** Providing `width` and `height` lets the browser reserve space before the image loads, preventing layout shift. The `fill` prop avoids this by letting CSS control the container dimensions.

**Remote patterns:** The `remotePatterns` config (replacing the deprecated `domains`) supports wildcards and pathnames. Misconfigured patterns cause 400 errors on image optimization requests.

## Source

https://nextjs.org/docs/app/api-reference/components/image

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
