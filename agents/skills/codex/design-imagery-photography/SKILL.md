# Imagery and Photography

> Image in design — art direction, aspect ratios, focal point composition, image treatments (duotone, overlay, blur), placeholder strategy, and the role of image as hero vs. supporting element

## When to Use

- Defining image art direction for a product, marketing site, or editorial platform
- Choosing aspect ratios for responsive image containers across breakpoints
- Selecting or commissioning photography that aligns with brand tone
- Applying image treatments (duotone, gradient overlays, blur) for visual consistency
- Designing placeholder and loading states for image-heavy interfaces
- Deciding when an image should dominate the layout (hero) vs. support text content
- Building an image style guide for a design system
- Evaluating whether product photography communicates the intended emotional tone

## Instructions

1. **Define art direction before sourcing images.** Art direction is the set of constraints that makes 100 different photographs feel like they belong to the same product. Without it, every image is an independent aesthetic decision. Define these attributes explicitly:
   - **Subject matter:** What is in the frame? People, products, landscapes, abstract textures?
   - **Color temperature:** Warm (golden hour, tungsten) or cool (overcast, blue hour, fluorescent)?
   - **Contrast level:** High contrast (dramatic shadows, punchy blacks) or low contrast (soft, flat, editorial)?
   - **Depth of field:** Shallow (blurred background, subject isolation) or deep (everything in focus, environmental)?
   - **Composition style:** Centered, rule-of-thirds, asymmetric, negative space dominant?
   - **Human presence:** Faces visible, silhouettes, hands only, no people?

   Airbnb's art direction specifies: warm color temperature, natural lighting, shallow-to-medium depth of field, human presence with faces visible, environments that feel lived-in (not staged). Every listing photo that matches these constraints reinforces the brand; every photo that violates them feels off-brand.

2. **Choose aspect ratios systematically, not per-image.** Aspect ratios are layout constraints, not creative decisions. Define a small set of ratios for your product and use them consistently:

   | Ratio | Decimal | Use Case                                                    |
   | ----- | ------- | ----------------------------------------------------------- |
   | 1:1   | 1.0     | Avatars, thumbnails, Instagram-style grids, product squares |
   | 4:3   | 1.33    | Traditional photography, cards, content thumbnails          |
   | 3:2   | 1.5     | 35mm photography standard, editorial, landscape cards       |
   | 16:9  | 1.78    | Video, hero banners, widescreen presentations               |
   | 21:9  | 2.33    | Ultrawide hero banners, cinematic crops                     |
   | 2:3   | 0.67    | Portrait cards, mobile-first hero images, book covers       |
   | 9:16  | 0.56    | Stories format, mobile full-screen, vertical video          |

   Decision procedure: pick 2-3 ratios for your product. Use the same ratio for all instances of a component type. A card grid should never mix 4:3 and 16:9 cards — the inconsistency disrupts the layout rhythm. Stripe uses 16:9 for product screenshots and 1:1 for team/avatar photos — two ratios, consistently applied.

3. **Compose images around a single focal point.** Every image needs one dominant subject that the eye locks onto first. Measure focal point effectiveness with the "squint test" — squint until the image blurs and see what remains prominent. If nothing stands out, the image lacks a focal point.
   - **Rule of thirds:** Place the focal point at one of the four intersection points of a 3x3 grid overlay. This creates dynamic tension and prevents the static feel of dead-center composition.
   - **Negative space direction:** The focal point should have breathing room in the direction it faces or moves. A person looking right needs more space on the right side of the frame.
   - **Text overlay consideration:** If text will be placed over the image, the focal point must not compete with the text zone. Apple's product hero images place the device in the lower 60% of the frame, leaving the upper 40% as a clean gradient zone for headline text.

4. **Apply image treatments for brand cohesion, not decoration.** Treatments are systematic filters that normalize disparate source imagery into a unified visual language:
   - **Duotone** — Maps the image's luminance range to two colors (shadow color and highlight color). Spotify uses duotone aggressively: editorial playlist covers map artist photos to brand-adjacent color pairs (e.g., deep purple shadows + electric green highlights). Duotone provides: strong brand reinforcement, visual unity across diverse source images, and automatic color palette compliance. Implementation: `mix-blend-mode: multiply` on a gradient overlay, or CSS `filter: grayscale(100%)` combined with a colored overlay.
   - **Color overlay** — A semi-transparent color layer over the image. Simpler than duotone, maintains some photographic realism. Use 40-70% opacity for text-over-image readability. Stripe applies blue-tinted overlays (`rgba(6, 27, 49, 0.6)`) on product screenshots to integrate them with the page's navy color scheme.
   - **Blur** — Background blur (`backdrop-filter: blur(20px)`) creates depth and hierarchy. Apple's iOS uses blur extensively for layered surfaces. Use blur to de-emphasize background images when foreground content needs focus. Avoid blur values below 8px — they look like rendering errors rather than intentional effects.
   - **Grain/noise** — Adds a subtle film-grain texture. Humanizes digital imagery, adds tactile quality. Use at 3-8% opacity for subtlety. Above 10%, grain dominates and degrades image quality.

5. **Design image placeholders as first-class UI states.** Users see placeholders during loading, on error, and when no image exists. Each state needs deliberate design:
   - **Loading placeholder:** Use a solid color matching the image's dominant color (extract via server-side color analysis), a low-resolution blurred preview (LQIP — 20x20px inline base64 scaled up with CSS blur), or a skeleton shimmer animation. Facebook pioneered the shimmer placeholder — a gradient animation that signals "content is coming" without committing to a shape.
   - **Error placeholder:** A branded fallback — not a broken image icon. Use a solid brand color with a subtle icon (camera with X, or brand logo at low opacity). Never show the browser's default broken-image icon.
   - **Empty state placeholder:** When no image has been uploaded, show an actionable prompt (dashed border with "Add photo" text and camera icon) rather than a blank space.

   Concrete implementation: use `<img>` with `loading="lazy"`, `decoding="async"`, a `background-color` matching the image's average color, and an `onerror` handler that swaps to the branded fallback. The CSS `aspect-ratio` property on the container prevents layout shift during loading.

6. **Distinguish hero images from supporting images in layout weight.** Hero images dominate the viewport and establish emotional tone. Supporting images illustrate specific content without commanding attention.

   | Attribute         | Hero Image                         | Supporting Image                           |
   | ----------------- | ---------------------------------- | ------------------------------------------ |
   | Viewport coverage | 60-100% of viewport width          | 25-50% of column width                     |
   | Aspect ratio      | Wide (16:9, 21:9) or full-bleed    | Standard (4:3, 3:2, 1:1)                   |
   | Text overlay      | Common — headline + CTA over image | Rare — text adjacent, not overlaid         |
   | Image quality     | Maximum resolution, art-directed   | Adequate resolution, may be user-generated |
   | Count per page    | 1 (at most 2 in long-scroll pages) | Multiple                                   |
   | Loading priority  | `fetchpriority="high"`, eager load | `loading="lazy"`, low priority             |

   Apple's product pages use exactly one hero image per section — the iPhone floating on a black background, full-bleed, no competing elements. Below it, supporting images show specific features at 50% viewport width with adjacent text blocks.

## Details

### Responsive Image Art Direction

Different viewport sizes may need different crops, not just scaled versions of the same image. The `<picture>` element with `<source>` tags enables art direction:

```html
<picture>
  <source media="(min-width: 1024px)" srcset="hero-wide.jpg" />
  <source media="(min-width: 640px)" srcset="hero-medium.jpg" />
  <img src="hero-mobile.jpg" alt="Product showcase" />
</picture>
```

The wide crop might show the full product in context (16:9). The medium crop centers on the product (4:3). The mobile crop is a tight vertical crop of just the product face (2:3). This is not responsive scaling — it is three different compositions optimized for three viewport contexts. Airbnb uses art direction for listing hero images: desktop shows the full room (16:9), mobile shows a tighter crop focused on the most compelling detail (4:3).

### Image Performance as Design Constraint

Image file size directly impacts perceived design quality because slow-loading images degrade the experience. Design constraints:

- **Hero images:** Target 200KB maximum for LCP (Largest Contentful Paint). Use WebP or AVIF format. AVIF achieves ~50% smaller files than JPEG at equivalent quality.
- **Thumbnails:** Target 15-30KB each. Generate server-side at exact display dimensions — never send a 2000px image for a 200px thumbnail.
- **LQIP previews:** 200-500 bytes inline base64. A 20x20px JPEG at quality 20 is ~300 bytes and, when scaled with CSS blur, creates an effective placeholder.
- **Cumulative Layout Shift:** Always declare `width` and `height` attributes on `<img>` tags, or use `aspect-ratio` CSS on containers. A hero image that causes 0.15 CLS (shifting the headline down by 400px on load) feels broken regardless of its artistic quality.

### Anti-Patterns

1. **Aspect Ratio Chaos.** A card grid where each card uses whatever aspect ratio the source image happens to be — some 4:3, some 16:9, some 1:1 — creating a ragged, uneven layout. Fix: enforce a single aspect ratio per component type using CSS `aspect-ratio` and `object-fit: cover`. Crop the image to fit the container, never stretch or letterbox.

2. **Unanchored Text Overlays.** Placing white text over a photograph without a scrim, gradient, or sufficient contrast zone. The text is legible over the dark tree but disappears over the bright sky. Fix: always apply a gradient scrim (`background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)`) from the text edge toward the image. Apple uses a bottom-to-top black gradient on every text-over-image hero, ensuring minimum 4.5:1 contrast ratio regardless of image content.

3. **Decorative Images Without Alt Text Strategy.** Marking all images as `alt=""` (decorative) or giving all images verbose literal descriptions. Neither is correct universally. Fix: hero images that convey emotional tone should have brief, contextual alt text ("Team collaborating in a sunlit office"). Decorative texture or pattern backgrounds should have `alt=""`. Product images should have descriptive alt text that adds information not available in adjacent text.

4. **Stock Photo Uncanny Valley.** Using obviously staged stock photography — perfectly diverse groups of smiling people in a pristine office — that reads as inauthentic. Users have developed strong pattern recognition for stock photography and subconsciously distrust it. Fix: commission custom photography with real employees/users, use candid rather than posed shots, or use abstract/illustrated imagery that does not pretend to be photographic.

5. **Loading State Neglect.** No placeholder during image load, resulting in layout shift and a flash of empty space. On slow connections, the page is broken for 2-5 seconds. Fix: implement LQIP (Low Quality Image Placeholder) with inline base64 blur-up, use CSS `aspect-ratio` to reserve space, and add skeleton shimmer animation for content-heavy grids.

### Real-World Examples

**Apple — Photography as Product.** Apple's product photography is the product page. The iPhone is the hero — shot on black or white backgrounds with controlled studio lighting, no environmental context, zero distractions. The device fills 60-80% of the viewport. Text is minimal and placed above or below, never competing with the product. Color accuracy is critical — the "Midnight" iPhone must look identical across apple.com, the Apple Store app, and physical retail displays. Apple achieves this with ICC color profiles embedded in every image and strict display calibration standards. Key lesson: when the product is the visual, image quality IS brand quality.

**Spotify — Duotone as Brand System.** Spotify's editorial playlists (RapCaviar, Today's Top Hits, Discover Weekly) apply duotone treatments to artist photography, mapping the image to two-color palettes that shift seasonally. The treatment transforms diverse source photography — candid concert shots, studio portraits, street photography — into a unified visual system. Each playlist has a signature color pair (RapCaviar: black + gold; Discover Weekly: greens). The duotone treatment is so strongly associated with Spotify that users recognize it outside the app. Key lesson: a strong image treatment can become a brand asset more recognizable than a logo.

**Airbnb — Warm Photography as Brand Promise.** Every listing photo on Airbnb is evaluated against art direction guidelines: warm color temperature, natural light, human-scale perspective (shot from eye level, not drone height), and environmental context (the room in use, not sterile and empty). Airbnb's photo quality directly correlates with booking rates — listings with professionally shot photos following these guidelines see 40% more bookings. The platform provides host photography guides that encode these art direction principles for non-professional photographers. Key lesson: art direction is not just for marketing — it is a product quality metric.

**Vercel — Monochrome Imagery as Developer Identity.** Vercel uses almost exclusively monochrome or desaturated imagery. Product screenshots are rendered in dark-mode with the Vercel color palette. Marketing photography, when used, is desaturated and cool-toned. The restraint signals developer seriousness — "we do not dress up our product with colorful imagery because the product speaks for itself." Key lesson: the absence of vibrant photography is itself an art direction decision.

### Image Accessibility Beyond Alt Text

Accessible imagery extends beyond alt text to include:

- **Color independence:** Images that encode information through color alone (a chart screenshot, a map with color-coded regions) must have supplementary text or non-color encodings. A product screenshot showing a red error banner should include alt text that describes the error state, not just "product screenshot."
- **Motion and autoplay:** Hero images implemented as video loops or animated GIFs must respect `prefers-reduced-motion`. Provide a static fallback: `<picture><source media="(prefers-reduced-motion: no-preference)" srcset="hero-animated.webm" type="video/webm" /><img src="hero-static.jpg" alt="..." /></picture>`.
- **Text in images:** Avoid baking text into images. Text rendered as part of a photograph or illustration cannot be resized, translated, or read by screen readers. If text must appear over an image, use HTML text with CSS positioning — never Photoshop the text into the image file.
- **Flashing content:** Images or videos with flashing content (strobe effects, rapid color changes) can trigger seizures. WCAG 2.3.1 requires no more than 3 flashes per second. This applies to animated hero images, parallax scroll effects, and autoplay video backgrounds.

### Image Governance at Scale

Products with user-generated or editorial imagery need governance to maintain art direction:

- **Automated quality gates:** Use server-side image analysis to enforce minimum resolution (reject uploads below 1200px on the long edge), aspect ratio compliance (auto-crop to the component's target ratio), and file size limits (reject uncompressed TIFFs).
- **Color analysis for consistency:** Extract the dominant color palette from uploaded images and flag those that deviate significantly from the brand's color temperature. Airbnb uses color analysis to surface listing photos that look artificially blue-shifted (common in real estate photography) for manual review.
- **Focal point metadata:** Allow editors to mark the focal point of each image (a click-to-set tool in the CMS). Use this metadata for responsive cropping — the crop algorithm keeps the focal point visible at every breakpoint. WordPress and Cloudinary both support focal-point-aware cropping.
- **Expiration and freshness:** Photography that shows dated technology (old phones, outdated UI), expired seasonal content (Christmas imagery in March), or former employees should be flagged for review. Set metadata expiration dates on time-sensitive imagery.

### Image Format Decision Matrix

| Format | Best For                           | Compression                              | Browser Support | Transparency           |
| ------ | ---------------------------------- | ---------------------------------------- | --------------- | ---------------------- |
| WebP   | General purpose, photos + graphics | Lossy + lossless, ~30% smaller than JPEG | 97%+ global     | Yes (lossy + lossless) |
| AVIF   | High-quality photos, hero images   | Lossy, ~50% smaller than JPEG            | 92%+ global     | Yes                    |
| JPEG   | Fallback for legacy browsers       | Lossy only                               | 100%            | No                     |
| PNG    | Screenshots with text, UI elements | Lossless only, large files               | 100%            | Yes                    |
| SVG    | Icons, logos, illustrations        | Vector, infinite scale                   | 100%            | Yes                    |

Decision procedure: serve AVIF with WebP fallback and JPEG as last resort using `<picture>` with multiple `<source>` elements. Use PNG only for screenshots containing text that must remain pixel-sharp. Use SVG for everything that is not photographic.

## Source

- Apple Human Interface Guidelines — Images and Icons (2024)
- Airbnb Design — Photography Style Guide
- Spotify Design — Visual Identity Guidelines
- Web.dev — Image Performance Best Practices (2024)
- WCAG 2.2 — Non-text Content (1.1.1), Images of Text (1.4.5), Three Flashes (2.3.1)

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
