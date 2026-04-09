# Web Fonts

> Font loading strategy — performance vs. FOUT/FOIT, variable fonts, subsetting, system font stacks, and font-display options

## When to Use

- Adding custom fonts to a web project for brand differentiation
- Optimizing font loading to reduce Largest Contentful Paint (LCP) and Cumulative Layout Shift (CLS)
- Deciding between self-hosting fonts and using a CDN (Google Fonts, Adobe Fonts)
- Evaluating whether to adopt variable fonts for an existing design system
- Building a system font stack as a zero-cost baseline or permanent solution
- Debugging invisible text (FOIT) or text reflow (FOUT) during page load

## Instructions

1. **Choose a font-display strategy.** The `font-display` CSS descriptor controls what happens while a web font is loading. This is the single most impactful decision for font-related performance:

   | Value      | Behavior                                            | Block Period      | Swap Period       | Best For                                     |
   | ---------- | --------------------------------------------------- | ----------------- | ----------------- | -------------------------------------------- |
   | `swap`     | Shows fallback immediately, swaps when loaded       | ~100ms            | Infinite          | Body text — user sees content instantly      |
   | `optional` | Shows fallback; may never swap if load is slow      | ~100ms            | None              | Performance-critical sites — no layout shift |
   | `fallback` | Brief invisible, then fallback, limited swap window | ~100ms            | ~3s               | Balance between swap and optional            |
   | `block`    | Invisible text for up to 3 seconds                  | ~3s               | Infinite          | Icon fonts only (never for text)             |
   | `auto`     | Browser decides (usually `block`)                   | Browser-dependent | Browser-dependent | Never use — behavior is unpredictable        |

   **Decision procedure:**
   - For body text: use `swap` (guarantees content is always visible)
   - For headings on performance-critical pages: use `optional` (prevents layout shift; font loads from cache on subsequent visits)
   - For icon fonts: use `block` (invisible squares are better than showing raw ligature text)
   - Never use `auto` or omit `font-display` — the browser default is effectively `block`, creating 3 seconds of invisible text

2. **Understand FOUT and FOIT.** These are the two failure modes of web font loading:
   - **FOIT (Flash of Invisible Text)**: text is invisible until the web font loads. Caused by `font-display: block` or browser default. Users see a blank page or missing content for up to 3 seconds. This is the worse failure mode — it hides content.
   - **FOUT (Flash of Unstyled Text)**: text appears in the fallback font, then swaps to the web font when loaded. Caused by `font-display: swap`. Users see a brief reflow. This is the better failure mode — content is always visible.
   - **Modern best practice**: accept FOUT (use `swap`) and minimize its visual impact by choosing a fallback font with similar metrics to your web font.

3. **Use WOFF2 exclusively for modern browsers.** Font file formats in order of preference:
   - **WOFF2**: compressed (Brotli), smallest file size, supported by all modern browsers (97%+ global support). Use this.
   - **WOFF**: compressed (zlib), ~20% larger than WOFF2. Only needed for IE11 (effectively dead).
   - **TTF/OTF**: uncompressed, 2-3x larger than WOFF2. Never serve these to browsers.
   - **EOT**: Internet Explorer only. Dead format.

   ```css
   @font-face {
     font-family: 'Inter';
     src: url('/fonts/inter-var.woff2') format('woff2');
     font-weight: 100 900;
     font-display: swap;
   }
   ```

4. **Subset fonts aggressively.** Most projects use only Latin characters. Loading a full Unicode font wastes bandwidth:
   - **Inter full**: ~300KB (all Unicode blocks)
   - **Inter Latin-only subset**: ~20KB (Latin, Latin Extended)
   - **Inter Latin Basic**: ~12KB (ASCII + common accented characters)
   - Use `unicode-range` in `@font-face` to load character sets on demand:

   ```css
   /* Latin characters only */
   @font-face {
     font-family: 'Inter';
     src: url('/fonts/inter-latin.woff2') format('woff2');
     unicode-range:
       U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308,
       U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
     font-display: swap;
   }
   ```

   Tools: `glyphhanger` (npm) analyzes which characters your site actually uses. `pyftsubset` (Python fonttools) creates subsets from any font file.

5. **Evaluate variable fonts for multi-weight systems.** A variable font contains all weights (and potentially widths, optical sizes) in a single file. The tradeoff:
   - **Single static weight** (e.g., Inter Regular 400): ~20KB WOFF2
   - **Two static weights** (400 + 700): ~40KB WOFF2
   - **Variable font** (100-900 weight axis): ~95KB WOFF2
   - **Breakeven point**: if you use 3+ weights from the same family, the variable font is smaller than individual static files (~60KB for 3 static weights vs ~95KB for one variable file)
   - **Bonus**: variable fonts enable intermediate weights (350, 550) for fine-tuned hierarchy without additional file requests
   - **Decision rule**: Using 1-2 weights? Static files. Using 3+ weights or need intermediate values? Variable font.

6. **Preload critical fonts.** Add `<link rel="preload">` for fonts that appear above the fold:

   ```html
   <link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossorigin />
   ```

   - Preload only 1-2 font files (the primary text font and possibly one heading font)
   - The `crossorigin` attribute is required even for same-origin fonts (browser specification requirement)
   - Excessive preloading (3+ fonts) competes with other critical resources and can slow LCP

7. **Build a system font stack as baseline or permanent solution.** System fonts load in 0ms — they are already on the user's device:

   ```css
   font-family:
     -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell,
     'Helvetica Neue', sans-serif;
   ```

   **Platform resolution:**
   - macOS/iOS: SF Pro (via `-apple-system`)
   - Windows: Segoe UI
   - Android: Roboto
   - Linux: Ubuntu or Cantarell (depending on distribution)

   System font stacks are not a compromise — GitHub uses system fonts for their entire application UI. The only drawback is loss of brand-specific typography.

## Details

### Self-Hosting vs. CDN

**Self-hosting** (recommended for most projects):

- Full control over caching headers, subsetting, and file optimization
- No third-party DNS lookup or connection overhead
- No privacy concerns (Google Fonts CDN was ruled a GDPR violation in some EU jurisdictions)
- Can be served from the same domain, eliminating cross-origin overhead

**Google Fonts CDN**:

- Easy setup (`<link href="https://fonts.googleapis.com/css2?...">`)
- Automatic format negotiation and subsetting
- Previously had a cache-sharing advantage (browser cached Google Fonts across sites) — this was eliminated when browsers partitioned third-party caches (Chrome 86+, 2020)
- **Current recommendation**: download from Google Fonts and self-host. The CDN's cache advantage no longer exists, and self-hosting is faster, more private, and more controllable.

### Next.js Font Optimization

Next.js provides automatic font optimization via `next/font`:

```typescript
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});
```

This automatically:

- Self-hosts the font (no Google Fonts CDN request)
- Subsets to the specified character ranges
- Generates CSS `@font-face` with `font-display: swap`
- Creates a CSS custom property for use in Tailwind or CSS
- Adjusts fallback font metrics to minimize CLS during swap
- Inlines the CSS to avoid render-blocking requests

### Font File Size Budget

A practical budget for font loading:

| Category              | Budget    | Example                                          |
| --------------------- | --------- | ------------------------------------------------ |
| Total font payload    | < 100KB   | 1 variable font (80KB) + 1 monospace (20KB)      |
| Per-font file         | < 50KB    | Single static weight: ~20KB; Variable: ~80-100KB |
| Critical (above fold) | < 50KB    | Preloaded primary font only                      |
| Fonts per page        | 1-3 files | Primary text + optional heading + optional mono  |

If your font payload exceeds 200KB, you are loading too many families, weights, or character sets. Audit with Chrome DevTools Network panel filtered to "Font."

### Matching Fallback Font Metrics

To minimize FOUT layout shift, configure the fallback font to match the web font's metrics:

```css
@font-face {
  font-family: 'Inter Fallback';
  src: local('Arial');
  ascent-override: 90.49%;
  descent-override: 22.56%;
  line-gap-override: 0%;
  size-adjust: 107.64%;
}

body {
  font-family: 'Inter', 'Inter Fallback', sans-serif;
}
```

The `size-adjust`, `ascent-override`, `descent-override`, and `line-gap-override` descriptors align the fallback font's metrics to the web font, reducing visual shift when the swap occurs. Tools like `fontaine` (npm) and `next/font` calculate these values automatically.

### Anti-Patterns

1. **Loading 6+ font files on initial page load.** Each font file is a network request that blocks text rendering. Loading Regular, Italic, Bold, Bold Italic, Light, and Medium variants separately produces 6 requests and 120-180KB of font data. Fix: use a single variable font file, or limit to 2 static weights maximum.

2. **No fallback font specified.** A `font-family: 'CustomBrandFont'` declaration with no fallback produces invisible text if the font fails to load, or defaults to the browser's serif (Times New Roman on most systems) which likely has completely different proportions. Always provide a complete fallback stack.

3. **Using font-display: block for body text.** This hides all body text for up to 3 seconds while the font loads. On slow connections (3G mobile), users see a blank content area. The font may never load if the connection drops. Fix: use `font-display: swap` for all text content.

4. **Loading full character sets for Latin-only content.** A full Unicode build of Inter includes Greek, Cyrillic, Vietnamese, and other scripts. If your content is English-only, 90% of the font file is unused data. Fix: subset to Latin Basic (U+0000-00FF) plus any accent characters your content uses.

5. **Google Fonts CDN without privacy audit.** Google Fonts transmits the user's IP address to Google servers. In the EU, this has been ruled a GDPR violation (Munich Regional Court, January 2022). Even outside the EU, the unnecessary data transmission is a liability. Fix: download fonts and self-host them.

### Real-World Examples

**GitHub's System Font Strategy**
GitHub uses system fonts exclusively for the application UI:

```css
font-family:
  -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif,
  'Apple Color Emoji', 'Segoe UI Emoji';
```

Result: zero font-loading overhead, zero FOUT/FOIT, instant text rendering. Font payload: 0KB. GitHub reserves custom fonts (Mona Sans, Hubot Sans) only for marketing pages where brand expression justifies the performance cost.

**Vercel's Geist Font Implementation**
Vercel self-hosts Geist as a variable font via `next/font`:

- Single WOFF2 variable file (~80KB) covering weights 100-900
- Subset to Latin characters
- Preloaded with `<link rel="preload">`
- `font-display: swap` for immediate text visibility
- Geist Mono loaded separately (~35KB) only on pages with code blocks
- Total font budget: 80-115KB depending on page type

**Stripe's Font Loading**
Stripe loads sohne-var (variable) self-hosted:

- Single variable font file covering weights 300-400 (the only weights they use)
- Custom subset: Latin + select currency symbols
- Preloaded on all pages
- Source Code Pro loaded only on API documentation pages
- `font-display: swap` with carefully tuned fallback metrics to minimize CLS

## Source

- web.dev — "Best practices for fonts" (Google Chrome team)
- MDN Web Docs — `font-display` descriptor, `@font-face` at-rule
- Zach Leatherman — "A Comprehensive Guide to Font Loading Strategies"
- Chrome DevTools — Network panel font analysis
- WCAG 2.1 SC 1.4.12 — Text Spacing (font rendering implications)

## Process

1. **Evaluate** — Audit the current font loading strategy. Measure total font payload, count font file requests, check `font-display` values, and identify whether subsetting is applied. Run Lighthouse to check CLS from font swap.
2. **Apply** — Implement the optimal loading strategy: WOFF2 format, aggressive subsetting, `font-display: swap` for text, preload critical fonts, self-host rather than CDN. Consider variable fonts if using 3+ weights.
3. **Verify** — Confirm total font payload is under 100KB, no FOIT occurs on throttled connections (Chrome DevTools slow 3G), CLS from font swap is under 0.01, and fallback fonts have matched metrics.

## Harness Integration

This is a knowledge skill. When activated, it provides font loading performance expertise to guide `@font-face` declarations, preload hints, and font file optimization. Use these principles when configuring `next/font`, adding custom fonts to any web framework, or auditing Core Web Vitals related to font loading. Cross-reference with `design-typography-fundamentals` for font selection and `design-responsive-type` for viewport-adaptive type.

## Success Criteria

- Total font payload is under 100KB for a typical page load
- All text fonts use `font-display: swap` or `font-display: optional`
- Fonts are served as WOFF2 only (no TTF, OTF, or WOFF fallbacks for modern browsers)
- Fonts are subsetted to only the character ranges the content requires
- No more than 3 font files are loaded on initial page render
- Fallback fonts have metric overrides to minimize CLS during swap
- Fonts are self-hosted (no third-party CDN for production)
