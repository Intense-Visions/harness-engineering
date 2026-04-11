# Font Loading

> Master web font loading optimization — font-display strategies for FOIT/FOUT control, Unicode range subsetting, variable fonts for multi-weight reduction, WOFF2 compression, preloading critical fonts, self-hosting versus CDN delivery, and the Font Loading API for programmatic control.

## When to Use

- Text is invisible for 1-3 seconds while web fonts download (Flash of Invisible Text)
- Text shifts or reflows when web fonts replace system fonts (Flash of Unstyled Text)
- Lighthouse flags "Ensure text remains visible during webfont load"
- Multiple font weights/styles are loaded but only 2-3 are used on most pages
- Google Fonts or other third-party font CDNs add extra DNS lookups and connections
- Font files are large (>50KB per weight) because they include unused character ranges
- CLS is caused by font swap changing text dimensions after initial render
- A design system uses 6+ font weights that could be consolidated with a variable font
- Font loading blocks LCP because the LCP element contains custom-font text
- Users on slow connections see significant delay before text renders

## Instructions

1. **Set font-display for every @font-face rule.** This controls browser behavior while the font downloads:

   ```css
   @font-face {
     font-family: 'Inter';
     src: url('/fonts/inter-var.woff2') format('woff2');
     font-weight: 100 900;
     font-display: swap; /* show fallback immediately, swap when loaded */
   }
   ```

   ```
   font-display value | Behavior
   -------------------|--------------------------------------------------
   swap               | Show fallback immediately, swap to web font when ready
   optional           | Show fallback; use web font only if it loads very quickly (~100ms)
   fallback           | Brief invisible period (~100ms), then fallback, then swap
   block              | Invisible text for up to 3s, then fallback (DEFAULT — avoid this)
   auto               | Browser decides (usually same as block)
   ```

   Use `swap` for body text where readability matters most. Use `optional` for non-critical decorative fonts where layout stability matters more than exact typography.

2. **Preload critical fonts.** The browser does not discover font files until it parses CSS. Preloading eliminates this delay:

   ```html
   <head>
     <!-- Preload the primary font used for body text -->
     <link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin />
     <!-- crossorigin is REQUIRED even for same-origin fonts -->
   </head>
   ```

   Only preload 1-2 fonts that are used above the fold. Preloading too many fonts competes with other critical resources.

3. **Subset fonts to reduce file size.** Remove unused character ranges to dramatically reduce font size:

   ```bash
   # Using pyftsubset (from fonttools)
   pip install fonttools brotli

   # Latin subset only (covers English and most Western European languages)
   pyftsubset Inter-Regular.ttf \
     --output-file=inter-latin.woff2 \
     --flavor=woff2 \
     --layout-features='kern,liga,calt' \
     --unicodes='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
   ```

   ```css
   /* Declare Unicode ranges for subset loading */
   @font-face {
     font-family: 'Inter';
     src: url('/fonts/inter-latin.woff2') format('woff2');
     unicode-range:
       U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC;
     font-display: swap;
   }

   @font-face {
     font-family: 'Inter';
     src: url('/fonts/inter-cyrillic.woff2') format('woff2');
     unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
     font-display: swap;
   }
   /* Browser only downloads the subset(s) needed for the page content */
   ```

4. **Use variable fonts to eliminate multiple files.** A single variable font file replaces 6-12 static weight files:

   ```css
   /* One file covers all weights from 100 to 900 */
   @font-face {
     font-family: 'Inter';
     src: url('/fonts/Inter-Variable.woff2') format('woff2-variations');
     font-weight: 100 900;
     font-style: normal;
     font-display: swap;
   }

   /* Use any weight without additional file downloads */
   h1 {
     font-weight: 750;
   } /* not limited to 700 or 800 */
   body {
     font-weight: 400;
   }
   .bold {
     font-weight: 650;
   }
   ```

   ```
   Comparison for Inter with 4 weights (400, 500, 600, 700):
   Static files: 4 x ~25KB = ~100KB
   Variable font: 1 x ~50KB = ~50KB (50% smaller)
   ```

5. **Minimize layout shift from font swap.** Match the fallback font metrics to the web font:

   ```css
   /* Size-adjusted fallback to match Inter metrics */
   @font-face {
     font-family: 'Inter Fallback';
     src: local('Arial');
     size-adjust: 107.64%;
     ascent-override: 90.49%;
     descent-override: 22.56%;
     line-gap-override: 0%;
   }

   body {
     font-family: 'Inter', 'Inter Fallback', system-ui, sans-serif;
   }
   ```

   ```bash
   # Generate metric overrides automatically
   npx @capsizecss/metrics Inter
   # Or use: https://screenspan.net/fallback
   ```

6. **Self-host fonts instead of using Google Fonts CDN.** Self-hosting eliminates third-party DNS lookups and connection overhead, enables HTTP cache partition benefits, and gives full control over caching:

   ```bash
   # Download Google Fonts for self-hosting
   npx google-fonts-helper download -f Inter -s latin -w 400,500,600,700

   # Or use: https://gwfh.mranftl.com/fonts (google-webfonts-helper)
   ```

7. **Use the Font Loading API for fine-grained control.** Programmatically manage font loading when CSS alone is insufficient:

   ```javascript
   // Load fonts programmatically with timeout
   async function loadFonts() {
     const font = new FontFace('Inter', 'url(/fonts/inter-var.woff2)', {
       weight: '100 900',
       display: 'swap',
     });

     try {
       const loaded = await Promise.race([
         font.load(),
         new Promise((_, reject) => setTimeout(() => reject(new Error('Font timeout')), 3000)),
       ]);
       document.fonts.add(loaded);
       document.documentElement.classList.add('fonts-loaded');
     } catch {
       document.documentElement.classList.add('fonts-failed');
     }
   }
   ```

## Details

### WOFF2 Compression

WOFF2 uses Brotli compression and achieves 30-50% smaller files than WOFF. All modern browsers support WOFF2. There is no reason to serve WOFF, TTF, or EOT to modern browsers. A typical font file: TTF ~150KB, WOFF ~90KB, WOFF2 ~50KB. Always convert to WOFF2 and provide only WOFF2 in @font-face src unless supporting IE11 (which requires WOFF).

### Worked Example: GitHub Font Optimization

GitHub uses a single variable weight Inter font file (WOFF2, ~50KB) self-hosted on their CDN. They preload it with `<link rel="preload" as="font" type="font/woff2" crossorigin>` and use `font-display: swap` with a size-adjusted system font fallback. The fallback uses `size-adjust` and `ascent-override` to match Inter's metrics within 1%, virtually eliminating visible reflow on font swap. Combined with Latin subsetting, their font loading adds zero render-blocking time and <5 CLS points from the swap.

### Worked Example: Stripe Documentation

Stripe's documentation site uses a two-stage font loading strategy. Stage 1 loads the regular weight (used for body text) with preload and `font-display: swap`. Stage 2 loads bold and italic variants on `requestIdleCallback` after the page is interactive. The CSS classes `fonts-stage-1` and `fonts-stage-2` are added to the document element, allowing the design system to progressively enhance typography. This ensures body text renders within 100ms while non-critical weights load in the background without competing for bandwidth.

### Anti-Patterns

**Preloading too many fonts.** Preloading 4+ font files competes with critical CSS, JavaScript, and LCP images for bandwidth. Preload only the 1-2 fonts used in above-the-fold body text.

**Using font-display: block on body text.** This causes up to 3 seconds of invisible text (FOIT) on slow connections. Use `swap` for body text so content is immediately readable. Reserve `block` only for icon fonts where showing the wrong character would be confusing.

**Loading all weights when only 2 are used.** If the page uses regular (400) and bold (700), loading light (300), medium (500), semi-bold (600), and extra-bold (800) wastes bandwidth. Audit which weights are actually used and load only those.

**Not specifying crossorigin on font preload.** Font requests are always CORS anonymous requests. Without the `crossorigin` attribute on `<link rel="preload">`, the preloaded font and the CSS-requested font are treated as different requests, causing a double download.

## Source

- web.dev: Best practices for fonts — https://web.dev/articles/font-best-practices
- MDN: font-display — https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display
- Variable Fonts guide — https://web.dev/articles/variable-fonts
- Font Loading API — https://developer.mozilla.org/en-US/docs/Web/API/CSS_Font_Loading_API

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- All @font-face rules include an explicit font-display value (swap or optional).
- Critical fonts (1-2 max) are preloaded with correct crossorigin attribute.
- Font files are WOFF2 format and subsetted to used Unicode ranges.
- Variable fonts replace multiple static weight files where applicable.
- Fallback fonts use metric overrides (size-adjust, ascent-override) to minimize CLS.
