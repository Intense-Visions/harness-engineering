# Astro Image Optimization

> Use `astro:assets` and the `<Image />` component to automatically optimize images at build time — enforcing `alt` text, generating WebP/AVIF, and preventing layout shift.

## When to Use

- You are adding images to an Astro project and want automatic format conversion and size optimization
- You need responsive images with multiple source sets using `<Picture />`
- You are loading images from a remote URL (Cloudinary, Contentful, Unsplash) and need to configure the allowlist
- You want to use `getImage()` for programmatic image optimization in API endpoints or og:image generation
- You are experiencing layout shift (CLS) from images and need guaranteed `width`/`height` dimensions

## Instructions

1. Import local images from `src/` using a static import. Astro processes these at build time and infers dimensions automatically:

```astro
---
import { Image } from 'astro:assets';
import heroImage from '../assets/hero.jpg';
---

<!-- Astro infers width, height, and converts to WebP by default -->
<Image src={heroImage} alt="A mountain at sunrise" />
```

2. Use `<Image />` for single-format optimized images. Required props are `src` and `alt`. Optional props control the output:

```astro
<Image
  src={heroImage}
  alt="Hero"
  width={1200}          <!-- override inferred width -->
  height={630}          <!-- override inferred height -->
  format="avif"         <!-- webp (default), avif, png, jpg -->
  quality={80}          <!-- 1-100 or 'low' | 'mid' | 'high' | 'max' -->
  loading="eager"       <!-- lazy (default) or eager -->
  decoding="async"
  class="hero-img"
/>
```

3. Use `<Picture />` for responsive images that serve different formats and sizes based on browser support and viewport:

```astro
---
import { Picture } from 'astro:assets';
import photo from '../assets/photo.jpg';
---

<Picture
  src={photo}
  alt="Team photo"
  widths={[400, 800, 1200]}
  sizes="(max-width: 600px) 400px, (max-width: 900px) 800px, 1200px"
  formats={['avif', 'webp']}
  fallbackFormat="jpg"
/>
```

4. For remote images, add the hostname to `image.remotePatterns` in `astro.config.mjs`. Astro will refuse to process remote images from unlisted hostnames:

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';

export default defineConfig({
  image: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.cloudinary.com' },
    ],
  },
});
```

5. Use remote images in `<Image />` with explicit `width`, `height`, and `inferSize` (when dimensions cannot be known ahead of time):

```astro
<!-- Known dimensions — preferred -->
<Image src="https://images.unsplash.com/photo-abc" alt="..." width={800} height={600} />

<!-- Unknown dimensions — fetches headers to infer size (build-time cost) -->
<Image src={remoteUrl} alt="..." inferSize />
```

6. Use `getImage()` for programmatic optimization outside of templates — useful for og:image endpoints or generating image URLs for use in CSS:

```typescript
// src/pages/api/og.ts
import { getImage } from 'astro:assets';
import ogBackground from '../assets/og-bg.png';

export const GET = async () => {
  const optimized = await getImage({
    src: ogBackground,
    format: 'png',
    width: 1200,
    height: 630,
  });
  // optimized.src — the final URL path
  // optimized.attributes — width, height, etc.
  return new Response(`<img src="${optimized.src}" />`);
};
```

7. In content collections, use the `image()` schema helper to process frontmatter image paths through the optimizer:

```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      cover: image(), // validates path and enables optimization
    }),
});
```

```astro
---
// src/pages/blog/[slug].astro
import { Image } from 'astro:assets';
const { post } = Astro.props;
---
<Image src={post.data.cover} alt={post.data.title} width={1200} height={630} />
```

8. Configure the image service in `astro.config.mjs`. Astro uses Sharp by default in Node environments. For Cloudflare or edge deployments, switch to the no-op service and rely on the CDN:

```javascript
import { defineConfig, passthroughImageService } from 'astro/config';

export default defineConfig({
  image: {
    service: passthroughImageService(), // no optimization, pass through as-is
  },
});
```

## Details

Astro's image optimization pipeline is powered by Sharp (Node.js) or the browser's image decoding APIs (depending on deployment target). The `<Image />` component enforces several best practices at compile time: `alt` is required (missing it is a build error), and Astro always adds explicit `width` and `height` attributes to prevent layout shift (CLS).

**Format selection strategy:**

- `webp` — best default: ~30% smaller than JPEG, universal browser support
- `avif` — best compression (~50% smaller than JPEG) but slower to encode at build time
- `png` — use only for images that need transparency
- Use `<Picture />` with `formats={['avif', 'webp']}` and `fallbackFormat="jpg"` to serve the best format each browser supports

**Local vs. remote image processing:**

Local images (`import hero from './hero.jpg'`) are processed at build time — the optimized file is written to `dist/_astro/`. Remote images are fetched during the build (SSG) or on-demand (SSR) and cached. In SSR, remote image optimization happens per-request unless you configure a CDN or caching layer.

**`inferSize` trade-offs:**

When `inferSize` is used on a remote image, Astro makes an HTTP HEAD request during the build to read the `Content-Length` or decodes the image header to determine dimensions. This adds build time proportional to the number of `inferSize` images. Prefer explicit `width` and `height` when the dimensions are known.

**Image service configuration for edge deployments:**

Sharp is a native Node.js module — it does not work on Cloudflare Workers or Vercel Edge Runtime. For edge deployments use `passthroughImageService()` and offload optimization to Cloudflare Image Resizing, Vercel Image Optimization, or Imgix.

**Content Security Policy:**

When using remote images, your CSP `img-src` directive must allow the remote origin. The optimized image URL will be an Astro-proxied URL in SSR mode, so only `'self'` may be needed depending on configuration.

## Source

https://docs.astro.build/en/guides/images

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
