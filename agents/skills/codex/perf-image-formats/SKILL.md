# Image Formats

> Master modern image format selection — WebP, AVIF, and JPEG XL encoding characteristics, quality-to-size trade-offs, automated conversion pipelines, content negotiation with the picture element, and format-specific optimization for photographic, illustrative, and UI image types.

## When to Use

- Images account for a significant portion of page weight (common: 40-60% of total bytes)
- Lighthouse flags "Serve images in next-gen formats" with substantial savings
- JPEG and PNG are served without considering WebP or AVIF alternatives
- Image-heavy pages (e-commerce, portfolios, news) have slow LCP due to hero image size
- A CDN or image service is available but format negotiation is not configured
- Users on mobile networks experience slow image loading
- You need to decide between lossy and lossless compression for different image types
- A build pipeline processes images but does not generate modern format variants
- Thumbnail generation produces unnecessarily large files
- Image quality is visibly degraded and you need to find the optimal quality setting

## Instructions

1. **Understand format capabilities and browser support.**

   ```
   Format    | Lossy | Lossless | Alpha | Animation | Browser Support
   ----------|-------|----------|-------|-----------|----------------
   JPEG      | Yes   | No       | No    | No        | Universal
   PNG       | No    | Yes      | Yes   | No        | Universal
   WebP      | Yes   | Yes      | Yes   | Yes       | 97%+ (all modern)
   AVIF      | Yes   | Yes      | Yes   | Yes       | 92%+ (Chrome, Firefox, Safari 16.4+)
   JPEG XL   | Yes   | Yes      | Yes   | Yes       | Safari 17+, limited elsewhere
   ```

2. **Select the right format by image type.** Different content benefits from different formats:

   ```
   Photographs (complex, many colors):
     Best: AVIF (30-50% smaller than JPEG at equivalent quality)
     Fallback: WebP (25-35% smaller than JPEG)
     Legacy: JPEG

   UI elements, logos, icons with transparency:
     Best: WebP lossless (26% smaller than PNG)
     Alternative: AVIF lossless
     Simple graphics: SVG (vector, infinitely scalable)

   Screenshots, text-heavy images:
     Best: WebP lossless or AVIF lossless
     Avoid: JPEG (text artifacts at any quality)

   Animated content:
     Best: AVIF animated (much smaller than GIF)
     Fallback: WebP animated
     Consider: MP4/WebM video for long animations
   ```

3. **Implement format negotiation with the picture element.**

   ```html
   <picture>
     <!-- AVIF: best compression, served to supporting browsers -->
     <source srcset="hero.avif" type="image/avif" />
     <!-- WebP: wide support, good compression -->
     <source srcset="hero.webp" type="image/webp" />
     <!-- JPEG: universal fallback -->
     <img src="hero.jpg" alt="Hero image" width="1200" height="600" />
   </picture>
   ```

4. **Automate format conversion in the build pipeline.** Use sharp for high-performance server-side conversion:

   ```javascript
   // build-images.js using sharp
   const sharp = require('sharp');
   const glob = require('glob');

   const QUALITY = { avif: 50, webp: 75, jpeg: 80 };

   async function convertImage(inputPath) {
     const base = inputPath.replace(/\.(jpg|jpeg|png)$/i, '');

     await Promise.all([
       sharp(inputPath).avif({ quality: QUALITY.avif, effort: 6 }).toFile(`${base}.avif`),
       sharp(inputPath).webp({ quality: QUALITY.webp, effort: 6 }).toFile(`${base}.webp`),
       sharp(inputPath).jpeg({ quality: QUALITY.jpeg, mozjpeg: true }).toFile(`${base}.opt.jpg`),
     ]);
   }

   glob.sync('src/images/**/*.{jpg,jpeg,png}').forEach(convertImage);
   ```

5. **Configure quality settings by content type.** AVIF and WebP quality scales are not equivalent to JPEG quality:

   ```
   Content Type          | AVIF Quality | WebP Quality | JPEG Quality
   ----------------------|-------------|-------------|-------------
   Hero/banner photos    | 50-60       | 75-80       | 80-85
   Thumbnails            | 40-50       | 65-75       | 70-80
   Product photos        | 55-65       | 78-82       | 82-88
   Background textures   | 35-45       | 60-70       | 65-75
   Lossless (UI/text)    | lossless    | lossless    | N/A (use PNG)
   ```

6. **Implement server-side content negotiation.** When the picture element is impractical (CMS content, email), use Accept header negotiation:

   ```nginx
   # Nginx: serve AVIF/WebP based on Accept header
   map $http_accept $img_suffix {
     "~image/avif"  ".avif";
     "~image/webp"  ".webp";
     default        "";
   }

   location ~* ^(/images/.+)\.(jpe?g|png)$ {
     set $base $1;
     set $ext $2;
     add_header Vary Accept;
     try_files $base$img_suffix.$ext $uri =404;
   }
   ```

7. **Use image CDN services for on-the-fly conversion.** Services like Cloudflare Images, Imgix, or Cloudinary handle format conversion, resizing, and optimization automatically:

   ```html
   <!-- Cloudflare Image Resizing -->
   <img src="/cdn-cgi/image/format=auto,width=800,quality=75/images/hero.jpg" />

   <!-- Imgix -->
   <img src="https://example.imgix.net/hero.jpg?auto=format&w=800&q=75" />
   ```

## Details

### AVIF Encoding Characteristics

AVIF is based on the AV1 video codec and achieves the highest compression ratios of any still image format. At equivalent perceptual quality, AVIF is typically 30-50% smaller than JPEG and 20% smaller than WebP. The trade-off is encoding speed: AVIF encoding is 10-100x slower than JPEG encoding at high effort levels. This makes AVIF ideal for pre-processed assets (build pipelines, CDN origin) but impractical for real-time encoding. Decoding is fast and hardware-accelerated on modern devices.

### Perceptual Quality Metrics

SSIM (Structural Similarity) and Butteraugli are used to compare formats at equivalent perceptual quality. An AVIF at quality 50 and a JPEG at quality 80 may have identical SSIM scores (e.g., 0.95) while the AVIF is 45% smaller. Always compare formats at equivalent perceptual quality, not at equivalent quality parameter values. The tools dssim and ssimulacra2 provide reliable perceptual comparisons.

### Worked Example: Netflix Promotional Images

Netflix generates AVIF, WebP, and JPEG variants of every promotional image (title cards, hero banners, episode stills). Their pipeline runs ssimulacra2 to find the minimum quality parameter for each format that meets their perceptual threshold (ssimulacra2 score < 1.0). Result: AVIF title cards average 12KB vs 28KB for equivalent JPEG, a 57% reduction. Across their catalog of millions of images, this saves petabytes of CDN bandwidth annually. They use the picture element with AVIF first, WebP second, JPEG fallback.

### Worked Example: Unsplash Photo Delivery

Unsplash serves 2+ billion image requests monthly. They generate multiple format variants at upload time using libvips (the library underlying sharp). Each photo exists in AVIF, WebP, and JPEG at multiple quality tiers. Their CDN (Imgix) handles format negotiation via the Accept header and Vary response header. The combination of modern formats and responsive sizing reduced their median image transfer size from 350KB to 85KB — a 76% reduction — while maintaining photographer-grade quality standards.

### Anti-Patterns

**Using the same quality parameter across formats.** AVIF quality 80 and JPEG quality 80 produce vastly different file sizes and visual quality. Always calibrate per-format quality settings using perceptual metrics, not matching numbers.

**Converting PNG screenshots to lossy WebP/AVIF.** Text-heavy screenshots and UI mockups should use lossless compression. Lossy encoding creates visible artifacts around text edges that are particularly noticeable at normal viewing distances.

**Serving AVIF without a fallback.** AVIF browser support is ~92% but not universal. Always provide WebP and JPEG fallbacks via the picture element or Accept header negotiation.

**Re-encoding already-compressed images.** Converting a low-quality JPEG to AVIF does not improve quality — it compounds compression artifacts. Always convert from the highest-quality source (original upload, RAW, or lossless PNG).

## Source

- web.dev: Serve images in modern formats — https://web.dev/articles/serve-images-webp
- AVIF specification — https://aomediacodec.github.io/av1-avif/
- sharp documentation — https://sharp.pixelplumbing.com/
- Squoosh — https://squoosh.app/
- Can I Use: AVIF — https://caniuse.com/avif

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- All photographic images are served in AVIF with WebP and JPEG fallbacks.
- Format selection uses the picture element or server-side content negotiation.
- Quality settings are calibrated per format and content type using perceptual metrics.
- Build pipeline automatically generates modern format variants from source images.
- Image-heavy pages show at least 30% byte reduction compared to JPEG-only serving.
