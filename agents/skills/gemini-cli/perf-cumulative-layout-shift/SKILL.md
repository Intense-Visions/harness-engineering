# Cumulative Layout Shift (CLS)

> Measure and prevent unexpected layout shifts — elements visually moving after being rendered — by reserving space for dynamic content, handling font loading, setting explicit dimensions, and understanding the CLS scoring formula.

## When to Use

- CrUX or Lighthouse reports CLS exceeding 0.1 at the 75th percentile
- Users report "the page jumped" or complain about accidentally clicking the wrong element
- Images, ads, or embeds load and push surrounding content down
- Web fonts load and cause text to reflow (FOUT — Flash of Unstyled Text)
- Dynamically injected content (banners, notifications, cookie consent) pushes existing content
- You need to understand the CLS scoring formula (impact fraction \* distance fraction)
- A/B testing scripts inject content above the fold after initial render
- `content-visibility: auto` needs `contain-intrinsic-size` to avoid shifts
- Late-loading CSS changes element sizes after initial render
- Infinite scroll or lazy-loaded content sections cause shifts on insertion

## Instructions

1. **Understand what CLS measures.** CLS quantifies how much visible content shifts unexpectedly during the page lifespan. It uses a session window approach: shifts are grouped into sessions (max 5 seconds, with 1-second gaps between shifts), and the largest session's total score is the CLS value.

2. **Understand the scoring formula.** Each layout shift gets a score: `impact fraction * distance fraction`.
   - **Impact fraction** — the percentage of the viewport area affected by the shift. If an element occupies 25% of the viewport and shifts, pushing another 25% of content, the impact fraction is 0.5 (50% of viewport was affected).
   - **Distance fraction** — the greatest distance any element moved, as a fraction of the viewport dimension. If an element moved 100px in a 900px viewport, distance fraction is 0.11.
   - Example: impact 0.5 \* distance 0.11 = shift score 0.055.

3. **Always set explicit dimensions on images and videos:**

   ```html
   <!-- BAD — no dimensions, browser cannot reserve space -->
   <img src="/photo.jpg" alt="Photo" />

   <!-- GOOD — browser reserves exact space before image loads -->
   <img src="/photo.jpg" alt="Photo" width="800" height="600" />

   <!-- GOOD — CSS aspect-ratio for responsive images -->
   <img src="/photo.jpg" alt="Photo" style="width: 100%; aspect-ratio: 4/3;" />
   ```

4. **Reserve space for ad slots and embeds:**

   ```css
   .ad-container {
     min-height: 250px; /* IAB standard medium rectangle height */
     aspect-ratio: 300/250; /* Or use fixed dimensions if known */
     background: #f0f0f0; /* Visual placeholder while loading */
   }
   ```

5. **Handle web font loading to prevent text reflow:**

   ```css
   /* Option 1: font-display: optional — no swap, no shift */
   @font-face {
     font-family: 'CustomFont';
     src: url('/font.woff2') format('woff2');
     font-display: optional; /* Uses fallback permanently if font loads too slowly */
   }

   /* Option 2: Match fallback metrics to web font metrics */
   @font-face {
     font-family: 'CustomFont Fallback';
     src: local('Arial');
     ascent-override: 90%;
     descent-override: 22%;
     line-gap-override: 0%;
     size-adjust: 105%;
   }
   ```

6. **Use `contain-intrinsic-size` with `content-visibility: auto`:**

   ```css
   .section {
     content-visibility: auto;
     contain-intrinsic-size: 0 500px; /* Estimated height when hidden */
   }
   ```

7. **Inject dynamic content below the fold or in reserved space.** Never insert banners, notifications, or consent dialogs above existing visible content:

   ```javascript
   // BAD — inserts banner at top, pushes everything down
   document.body.prepend(bannerElement);

   // GOOD — uses a pre-reserved slot
   document.querySelector('.banner-slot').appendChild(bannerElement);
   // Where .banner-slot has min-height: 60px pre-set in CSS
   ```

8. **Measure CLS with the Performance API:**

   ```javascript
   let clsValue = 0;
   let sessionValue = 0;
   let sessionEntries = [];

   const observer = new PerformanceObserver((list) => {
     for (const entry of list.getEntries()) {
       if (!entry.hadRecentInput) {
         // Ignore user-initiated shifts
         sessionEntries.push(entry);
         sessionValue += entry.value;
         clsValue = Math.max(clsValue, sessionValue);
       }
     }
   });
   observer.observe({ type: 'layout-shift', buffered: true });
   ```

## Details

### CLS Thresholds

| Rating            | CLS (p75) | User experience              |
| ----------------- | --------- | ---------------------------- |
| Good              | <= 0.1    | Content is stable            |
| Needs improvement | <= 0.25   | Occasional noticeable shifts |
| Poor              | > 0.25    | Frequent, disruptive shifts  |

### What Counts as "Expected"

A layout shift is excluded from CLS if it occurs within 500ms of a discrete user input (click, tap, keypress). Scroll is not a discrete input — shifts during scroll still count. Hover is not a discrete input. This means:

- Clicking a button that reveals a dropdown: expected (not counted)
- An image loading during scroll that pushes text: unexpected (counted)
- A font swap causing text reflow during page load: unexpected (counted)

### Worked Example: Yahoo! Japan News CLS Elimination

Yahoo! Japan News reduced CLS from 0.3 to 0.02. The primary source was ad containers with no reserved height. When ads loaded (100-500ms after page render), the 250px-tall ad pushed the article content 200px down the viewport. With the article visible in ~50% of the viewport and shifting 200px in a 900px viewport:

- Impact fraction: 0.75 (ad area + shifted article area)
- Distance fraction: 0.22 (200px / 900px)
- Shift score: 0.165 per ad load

Fix: Added `min-height: 250px` and `aspect-ratio: 300/250` to all ad containers. Combined with `aspect-ratio` on all editorial images (`width` and `height` attributes), CLS dropped to 0.02.

### Worked Example: Smashing Magazine Font CLS

Smashing Magazine eliminated font-swap CLS by using `font-display: optional` combined with font metric overrides. Their web font had significantly different metrics than the system fallback (Arial): the web font was 8% wider with different ascent and descent values. On swap, every line of text reflowed, shifting content throughout the page.

Fix: Used CSS `@font-face` metric overrides (`ascent-override: 92%`, `descent-override: 24%`, `line-gap-override: 0%`, `size-adjust: 107%`) to match the fallback font metrics to within 2% of the web font. Text reflow on font swap became imperceptible, and CLS from font loading dropped from 0.08 to 0.001.

### Anti-Patterns

**Images and videos without `width`/`height` attributes.** Without explicit dimensions, the browser reserves 0px height for the image. When the image loads, it pushes all content below it. Modern browsers use `width`/`height` to calculate `aspect-ratio` automatically.

**Injecting banners or notifications above existing content.** Cookie consent banners, promotional banners, or error notifications inserted at the top of the page push the entire viewport down. Use overlay/modal patterns, or reserve space in advance.

**Web fonts with `font-display: swap` and large metric differences.** `font-display: swap` shows fallback text immediately, then swaps to the web font. If the web font has different metrics (width, height, spacing), text reflows on swap. Use `font-display: optional` (no swap if font loads slowly) or metric overrides to minimize the difference.

**Dynamically loading content that changes height of above-the-fold sections.** A/B testing scripts that modify above-the-fold content after initial render cause shifts. Load A/B test decisions server-side or inline the decision in the HTML to avoid post-render modifications.

**CSS that loads late and changes element sizes.** Non-critical CSS loaded asynchronously may contain rules that change element dimensions from their default values. This causes shifts when the stylesheet arrives and styles are recalculated. Ensure all above-the-fold element dimensions are defined in critical CSS.

## Source

- web.dev CLS documentation — https://web.dev/articles/cls
- Layout Instability API specification — https://wicg.github.io/layout-instability/
- Chrome CrUX methodology — https://developers.google.com/web/tools/chrome-user-experience-report
- "Optimize Cumulative Layout Shift" — https://web.dev/articles/optimize-cls

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
- CLS is measured using the Layout Instability API and stays below 0.1 at p75.
- All images, videos, and dynamic content containers have explicit dimensions or reserved space.
