# Media Lazy Loading

> Master media lazy loading strategies — native browser lazy loading for images and iframes, video poster optimization, low-quality image placeholders (LQIP), BlurHash encoding, progressive rendering techniques, and prioritization of above-the-fold media.

## When to Use

- A page contains many images but only 2-3 are visible on initial load
- Lighthouse flags "Defer offscreen images" with significant byte savings
- Page load downloads all images regardless of whether they are in the viewport
- Video embeds (YouTube, Vimeo) load heavy iframes before the user clicks play
- Image-heavy galleries or product listings transfer megabytes on initial load
- Placeholder images cause layout shift when the real image loads
- Users perceive the page as slow because all media loads simultaneously
- A content-heavy blog or news site loads images for the entire article at once
- Infinite scroll feeds download images for items far below the current scroll position
- Third-party image embeds (Instagram, Twitter) add hundreds of KB to page weight

## Instructions

1. **Use native lazy loading for below-fold images.** The `loading="lazy"` attribute defers image loading until the image approaches the viewport:

   ```html
   <!-- Below-fold images: lazy load -->
   <img
     src="product.jpg"
     alt="Product photo"
     width="400"
     height="300"
     loading="lazy"
     decoding="async"
   />

   <!-- Above-fold / LCP images: NEVER lazy load -->
   <img src="hero.jpg" alt="Hero banner" width="1200" height="600" fetchpriority="high" />
   ```

   The browser determines the loading threshold (typically 1250-2500px from viewport depending on connection speed). Do not add `loading="lazy"` to the LCP image or any image visible in the initial viewport.

2. **Lazy load iframes for video embeds.** YouTube and Vimeo iframes load 500KB+ of JavaScript. Defer until the user indicates intent:

   ```html
   <!-- Native iframe lazy loading -->
   <iframe
     src="https://www.youtube.com/embed/dQw4w9WgXcQ"
     loading="lazy"
     width="560"
     height="315"
     title="Video title"
     allow="accelerometer; autoplay; encrypted-media"
     allowfullscreen
   ></iframe>

   <!-- Better: facade pattern — show thumbnail, load iframe on click -->
   ```

   ```typescript
   function YouTubeFacade({ videoId, title }: { videoId: string; title: string }) {
     const [loaded, setLoaded] = useState(false);

     if (loaded) {
       return (
         <iframe
           src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
           width="560"
           height="315"
           title={title}
           allow="accelerometer; autoplay; encrypted-media"
           allowfullscreen
         />
       );
     }

     return (
       <button
         onClick={() => setLoaded(true)}
         style={{ position: 'relative', width: 560, height: 315 }}
         aria-label={`Play: ${title}`}
       >
         <img
           src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
           alt={title}
           width="560"
           height="315"
           loading="lazy"
         />
         <PlayIcon />
       </button>
     );
   }
   ```

3. **Implement LQIP (Low-Quality Image Placeholders).** Show a tiny blurred preview while the full image loads:

   ```javascript
   // Generate LQIP at build time with sharp
   const sharp = require('sharp');

   async function generateLQIP(inputPath) {
     const buffer = await sharp(inputPath)
       .resize(20) // 20px wide
       .blur(2)
       .jpeg({ quality: 20 })
       .toBuffer();

     return `data:image/jpeg;base64,${buffer.toString('base64')}`;
     // ~200-400 bytes, inlineable in HTML
   }
   ```

   ```html
   <!-- LQIP placeholder with fade-in transition -->
   <div class="image-container" style="aspect-ratio: 4/3;">
     <img
       src="data:image/jpeg;base64,/9j/4AAQSkZJ..."
       data-src="product-full.jpg"
       alt="Product"
       class="lqip-image"
       width="800"
       height="600"
     />
   </div>

   <style>
     .image-container {
       overflow: hidden;
     }
     .lqip-image {
       width: 100%;
       height: 100%;
       object-fit: cover;
       filter: blur(20px);
       transform: scale(1.1);
       transition:
         filter 0.3s,
         transform 0.3s;
     }
     .lqip-image.loaded {
       filter: blur(0);
       transform: scale(1);
     }
   </style>
   ```

4. **Use BlurHash for compact placeholders.** BlurHash encodes a placeholder in ~20-30 characters, decoded to a blurred preview on the client:

   ```typescript
   // Server: encode BlurHash at upload/build time
   import { encode } from 'blurhash';
   import sharp from 'sharp';

   async function generateBlurHash(imagePath: string): Promise<string> {
     const { data, info } = await sharp(imagePath)
       .raw()
       .ensureAlpha()
       .resize(32, 32, { fit: 'inside' })
       .toBuffer({ resolveWithObject: true });

     return encode(
       new Uint8ClampedArray(data),
       info.width,
       info.height,
       4, 3  // x and y components
     );
   }

   // Client: decode and render to canvas
   import { decode } from 'blurhash';

   function BlurHashCanvas({ hash, width, height }) {
     const canvasRef = useRef<HTMLCanvasElement>(null);

     useEffect(() => {
       const pixels = decode(hash, width, height);
       const ctx = canvasRef.current?.getContext('2d');
       if (!ctx) return;
       const imageData = ctx.createImageData(width, height);
       imageData.data.set(pixels);
       ctx.putImageData(imageData, 0, 0);
     }, [hash, width, height]);

     return <canvas ref={canvasRef} width={width} height={height} />;
   }
   ```

5. **Implement video poster optimization.** For video elements, use a poster image to avoid loading video data before play:

   ```html
   <video poster="video-poster.webp" preload="none" width="1280" height="720" playsinline>
     <source src="video.mp4" type="video/mp4" />
   </video>
   ```

   Set `preload="none"` to prevent the browser from downloading any video data. The poster image provides the visual preview. Combine with `loading="lazy"` on a facade image for below-fold videos.

6. **Implement progressive image loading with CSS transitions.** Smooth the transition from placeholder to full image:

   ```typescript
   function ProgressiveImage({ src, placeholder, alt, width, height }) {
     const [loaded, setLoaded] = useState(false);
     const [currentSrc, setCurrentSrc] = useState(placeholder);

     useEffect(() => {
       const img = new Image();
       img.onload = () => {
         setCurrentSrc(src);
         setLoaded(true);
       };
       img.src = src;
     }, [src]);

     return (
       <img
         src={currentSrc}
         alt={alt}
         width={width}
         height={height}
         style={{
           filter: loaded ? 'none' : 'blur(20px)',
           transition: 'filter 0.3s ease-out',
         }}
       />
     );
   }
   ```

7. **Configure the loading threshold.** Browsers load lazy images before they enter the viewport. Chrome uses a distance threshold that varies by connection speed (~1250px on 4G, ~2500px on slow 3G). For custom Intersection Observer implementations, set rootMargin based on image size and expected scroll speed:

   ```typescript
   // Small thumbnails (fast to load): trigger closer
   const observer = new IntersectionObserver(callback, { rootMargin: '200px' });

   // Large hero images (slow to load): trigger earlier
   const observer = new IntersectionObserver(callback, { rootMargin: '500px' });
   ```

## Details

### Native Lazy Loading Browser Behavior

When `loading="lazy"` is set, the browser defers the image fetch until the image is within a distance threshold of the viewport. This threshold is not configurable by developers — it varies by browser and connection speed. Chrome on a fast connection starts loading images ~1250px before they enter the viewport. On slow 3G, this increases to ~2500px to compensate for longer download times. Images with `loading="lazy"` that are in the initial viewport on page load are loaded immediately (no deferral).

### Worked Example: Medium Article Images

Medium uses LQIP with a progressive loading pattern for article images. On initial load, a ~200-byte blurred thumbnail is inlined as a base64 data URI in the HTML. When the image container approaches the viewport (via Intersection Observer with 300px rootMargin), the full image loads. Once loaded, a CSS transition fades from the blurred placeholder to the sharp image over 300ms. This approach eliminates layout shift (the placeholder has the same dimensions), provides immediate visual feedback (the blur gives spatial context), and defers ~95% of image bytes until needed.

### Worked Example: Instagram Feed

Instagram's feed uses a combination of BlurHash placeholders and progressive JPEG delivery. Each image in the API response includes a 28-character BlurHash string. The client renders this to a canvas element as an instant placeholder. The actual image loads progressively (headers first, then increasing resolution scans). The result: users see colored blurred previews within 50ms of scrolling, followed by a progressive reveal of detail. No layout shift occurs because dimensions are known from the API. The feed loads perceived-instantly despite containing dozens of high-resolution photos.

### Anti-Patterns

**Lazy loading the LCP image.** Adding `loading="lazy"` to the hero image or any image visible without scrolling delays LCP by the intersection observer threshold plus download time. The LCP image should be eagerly loaded with `fetchpriority="high"`.

**Using JavaScript lazy loading when native suffices.** Libraries like lazysizes add JavaScript overhead for functionality the browser provides natively. Use `loading="lazy"` for standard cases. Reserve JavaScript solutions for LQIP, BlurHash, or Intersection Observer patterns that native lazy loading cannot provide.

**Placeholders that cause layout shift.** A placeholder with different dimensions than the final image causes Cumulative Layout Shift when swapped. Always set width, height, and aspect-ratio on containers. Placeholders must match the final image's aspect ratio.

**Lazy loading all images indiscriminately.** Applying `loading="lazy"` to every image on the page, including above-the-fold images, delays rendering of critical content. Audit which images are in the initial viewport and exclude them from lazy loading.

## Source

- web.dev: Browser-level image lazy loading — https://web.dev/articles/browser-level-image-lazy-loading
- MDN: Lazy loading — https://developer.mozilla.org/en-US/docs/Web/Performance/Lazy_loading
- BlurHash — https://blurha.sh/
- lite-youtube-embed — https://github.com/niccoloborghesi/lite-youtube-embed

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- Below-fold images use `loading="lazy"` and above-fold images do not.
- Video embeds use a facade pattern that loads the iframe only on interaction.
- Image placeholders (LQIP or BlurHash) are implemented for key images.
- No media lazy loading causes layout shift (containers have explicit dimensions).
- Initial page load transfers only images visible in the viewport.
