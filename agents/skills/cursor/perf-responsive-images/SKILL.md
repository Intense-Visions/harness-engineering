# Responsive Images

> Master responsive image delivery — srcset for resolution switching, sizes for viewport-aware selection, the picture element for art direction, automated responsive image generation, and strategies to serve the smallest image that looks sharp on every device.

## When to Use

- Desktop-sized images are served to mobile devices, wasting bandwidth
- Retina displays show blurry images because only 1x variants are served
- Lighthouse flags "Properly size images" with significant savings potential
- A 2000px hero image is served to a 375px mobile viewport
- Images cause layout shift because width and height attributes are missing
- Art direction is needed (different crops for different viewports)
- An image CDN is available but srcset is not configured
- CMS-uploaded images are served at original resolution regardless of display context
- Page weight on mobile is double or more compared to what is necessary
- LCP element is an image that could be served in a smaller size

## Instructions

1. **Implement srcset for resolution switching.** Provide multiple image widths and let the browser choose the optimal one:

   ```html
   <img
     src="product-800.jpg"
     srcset="
       product-400.jpg   400w,
       product-800.jpg   800w,
       product-1200.jpg 1200w,
       product-1600.jpg 1600w
     "
     sizes="(max-width: 600px) 100vw,
            (max-width: 1200px) 50vw,
            33vw"
     alt="Product photo"
     width="800"
     height="600"
     loading="lazy"
   />
   ```

   The `sizes` attribute tells the browser how wide the image will be displayed at each viewport width. The browser combines this with the device pixel ratio to select the best srcset candidate.

2. **Calculate correct sizes values.** The sizes attribute must reflect actual CSS layout. Incorrect sizes cause the browser to select the wrong image:

   ```
   Layout                              | sizes value
   ------------------------------------|----------------------------------
   Full-width image                    | 100vw
   Two-column grid, full-width mobile  | (max-width: 768px) 100vw, 50vw
   Three-column grid with padding      | (max-width: 768px) 100vw,
                                       |  (max-width: 1200px) calc(50vw - 32px),
                                       |  calc(33.3vw - 48px)
   Fixed-width sidebar image           | 300px
   ```

3. **Use the picture element for art direction.** When different viewports need different image crops (not just resolutions):

   ```html
   <picture>
     <!-- Mobile: tight crop, portrait orientation -->
     <source
       media="(max-width: 600px)"
       srcset="hero-mobile-400.avif 400w, hero-mobile-800.avif 800w"
       sizes="100vw"
       type="image/avif"
     />
     <source
       media="(max-width: 600px)"
       srcset="hero-mobile-400.webp 400w, hero-mobile-800.webp 800w"
       sizes="100vw"
       type="image/webp"
     />
     <!-- Desktop: wide crop, landscape orientation -->
     <source
       srcset="hero-desktop-1200.avif 1200w, hero-desktop-1800.avif 1800w"
       sizes="100vw"
       type="image/avif"
     />
     <source
       srcset="hero-desktop-1200.webp 1200w, hero-desktop-1800.webp 1800w"
       sizes="100vw"
       type="image/webp"
     />
     <img
       src="hero-desktop-1200.jpg"
       alt="Hero banner"
       width="1800"
       height="600"
       fetchpriority="high"
     />
   </picture>
   ```

4. **Generate responsive variants in the build pipeline.**

   ```javascript
   const sharp = require('sharp');

   const WIDTHS = [400, 800, 1200, 1600, 2000];

   async function generateResponsive(inputPath) {
     const base = inputPath.replace(/\.[^.]+$/, '');
     const image = sharp(inputPath);
     const metadata = await image.metadata();

     const tasks = WIDTHS.filter((w) => w <= metadata.width) // don't upscale
       .flatMap((width) => [
         sharp(inputPath).resize(width).avif({ quality: 50 }).toFile(`${base}-${width}.avif`),
         sharp(inputPath).resize(width).webp({ quality: 75 }).toFile(`${base}-${width}.webp`),
         sharp(inputPath)
           .resize(width)
           .jpeg({ quality: 80, mozjpeg: true })
           .toFile(`${base}-${width}.jpg`),
       ]);

     await Promise.all(tasks);
   }
   ```

5. **Always include width and height attributes.** These prevent layout shift by allowing the browser to calculate aspect ratio before the image loads:

   ```html
   <!-- Browser calculates aspect ratio: 800/600 = 1.333 -->
   <img src="photo.jpg" width="800" height="600" alt="Photo" />

   <!-- CSS makes it responsive while maintaining aspect ratio -->
   <style>
     img {
       max-width: 100%;
       height: auto;
     }
   </style>
   ```

6. **Use fetchpriority for LCP images.** The LCP image should be eagerly loaded with high priority:

   ```html
   <!-- LCP hero image: eager load, high priority, no lazy -->
   <img
     src="hero-1200.jpg"
     srcset="hero-800.jpg 800w, hero-1200.jpg 1200w, hero-1600.jpg 1600w"
     sizes="100vw"
     alt="Hero"
     width="1600"
     height="900"
     fetchpriority="high"
   />

   <!-- Below-fold images: lazy load, default priority -->
   <img
     src="gallery-800.jpg"
     srcset="gallery-400.jpg 400w, gallery-800.jpg 800w"
     sizes="50vw"
     alt="Gallery item"
     width="800"
     height="600"
     loading="lazy"
   />
   ```

7. **Configure image CDN responsive delivery.** CDNs can generate responsive variants on the fly:

   ```html
   <!-- Cloudflare Image Resizing with srcset -->
   <img
     src="/cdn-cgi/image/width=800,format=auto/images/hero.jpg"
     srcset="
       /cdn-cgi/image/width=400,format=auto/images/hero.jpg   400w,
       /cdn-cgi/image/width=800,format=auto/images/hero.jpg   800w,
       /cdn-cgi/image/width=1200,format=auto/images/hero.jpg 1200w
     "
     sizes="100vw"
     alt="Hero"
   />
   ```

## Details

### How the Browser Selects a srcset Candidate

The browser multiplies the sizes value (CSS pixels the image will occupy) by the device pixel ratio. A 2x retina device displaying an image at 400 CSS pixels needs an 800-pixel-wide image. The browser picks the smallest srcset candidate that meets or exceeds this target. This is why srcset widths should be in roughly 1.5-2x increments: 400, 800, 1200, 1600 covers 1x through 4x devices at common layout sizes.

### Worked Example: The Guardian

The Guardian generates 7 srcset variants for article images (140, 500, 620, 700, 860, 940, 1020 pixels) tailored to their column layout breakpoints. Their sizes attribute precisely matches their CSS grid: `(max-width: 660px) 100vw, (max-width: 980px) 620px, 700px`. Combined with AVIF/WebP via the picture element, this reduced image bytes per article by 62% on mobile compared to serving a single 1020px JPEG. LCP improved by 400ms on median mobile connections.

### Worked Example: Etsy Product Images

Etsy generates responsive variants at upload time and stores them in their image service. Product listing pages use srcset with 5 width descriptors matched to their grid breakpoints. On mobile (1 column), images are 100vw; on tablet (2 columns), images are ~50vw minus gutters; on desktop (4 columns), images are ~25vw minus gutters. Their sizes attribute encodes this precisely, resulting in the browser selecting a 400px image on mobile instead of a 1600px image — saving 85% of image bytes per card.

### Anti-Patterns

**Incorrect sizes attribute.** If sizes says `100vw` but the image is actually displayed at 33% width, the browser selects an image 3x larger than needed. Always measure the actual CSS layout width at each breakpoint and encode it in sizes.

**Too few srcset variants.** Providing only 2 widths (400, 1600) means a 2x device at 500px layout width must download the 1600px image. Provide enough variants (4-6) to cover the range of viewport-width times device-pixel-ratio combinations.

**Upscaling in srcset.** Never include a srcset width larger than the source image. A 1000px source image upscaled to 2000px is larger and blurrier than serving the 1000px original.

**Missing width/height on responsive images.** Without dimensions, the browser cannot reserve space before the image loads, causing Cumulative Layout Shift. Always include width and height even on responsive images (CSS `height: auto` overrides the attribute for display).

## Source

- MDN: Responsive images — https://developer.mozilla.org/en-US/docs/Learn/HTML/Multimedia_and_embedding/Responsive_images
- web.dev: Serve responsive images — https://web.dev/articles/serve-responsive-images
- Cloudinary: Responsive images guide — https://cloudinary.com/guides/responsive-images
- RespImageLint — https://ausi.github.io/respimagelint/

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- All content images use srcset with at least 4 width descriptors.
- The sizes attribute accurately reflects CSS layout widths at each breakpoint.
- No image is served at more than 1.5x its display dimensions on any device.
- All images include width and height attributes to prevent layout shift.
- LCP images use fetchpriority="high" and are not lazy loaded.
