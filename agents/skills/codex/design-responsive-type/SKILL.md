# Responsive Type

> Type across viewports — fluid typography with CSS clamp(), viewport-relative scaling, minimum readable sizes, and maintaining hierarchy across breakpoints

## When to Use

- Building a site that must look correct from 320px mobile to 2560px ultrawide monitors
- Replacing a brittle system of 4+ media query breakpoints for font sizes
- Implementing fluid typography that scales smoothly between minimum and maximum sizes
- Ensuring body text never drops below readable minimums on small screens
- Maintaining consistent typographic hierarchy ratios across all viewport widths

## Instructions

1. **Understand the core problem.** Fixed font sizes create two failure modes:
   - **Too small on mobile**: 14px body text on a 320px screen with 16px padding leaves only 288px of content width — text is cramped and lines wrap excessively
   - **Too small on desktop**: that same 14px body text on a 2560px ultrawide monitor is proportionally tiny, creating excessive line lengths and visual insignificance
   - **The solution**: font sizes that scale proportionally with viewport width, bounded by minimum and maximum values

2. **Use CSS `clamp()` for fluid typography.** The `clamp()` function accepts three values: minimum, preferred (fluid), and maximum:

   ```css
   /* Font scales from 16px (mobile) to 20px (desktop) */
   font-size: clamp(1rem, 0.8rem + 0.5vw, 1.25rem);
   ```

   The preferred value (`0.8rem + 0.5vw`) creates a smooth scaling curve. The `rem` component provides a stable base; the `vw` component adds viewport-proportional growth. The clamp bounds prevent the font from going below 16px or above 20px.

3. **Calculate the preferred value using the fluid type formula.** Given:
   - `min-size`: the smallest font size (in px)
   - `max-size`: the largest font size (in px)
   - `min-vw`: the viewport width where min-size applies (typically 320px)
   - `max-vw`: the viewport width where max-size applies (typically 1240px or 1440px)

   The formula:

   ```
   preferred = min-size + (max-size - min-size) * ((100vw - min-vw) / (max-vw - min-vw))
   ```

   In CSS-friendly form (converting to rem + vw):

   ```
   slope = (max-size - min-size) / (max-vw - min-vw)
   intercept = min-size - (slope * min-vw)
   preferred = intercept(rem) + slope(vw)
   ```

   **Worked example — 16px to 20px between 320px and 1240px viewports:**

   ```
   slope = (20 - 16) / (1240 - 320) = 4 / 920 = 0.00435 = 0.435vw
   intercept = 16 - (0.00435 * 320) = 16 - 1.391 = 14.609px = 0.913rem
   Result: clamp(1rem, 0.913rem + 0.435vw, 1.25rem)
   ```

   You do not need to calculate this by hand — use Utopia.fyi or similar calculators. But understanding the math prevents blind copy-pasting of values you cannot debug.

4. **Apply fluid scaling to your entire type scale.** Each step in your type scale gets its own clamp() with proportional min/max values:

   | Token     | Mobile (320px) | Desktop (1240px) | CSS                                             |
   | --------- | -------------- | ---------------- | ----------------------------------------------- |
   | text-sm   | 14px           | 14px             | `0.875rem` (no scaling needed)                  |
   | text-base | 16px           | 18px             | `clamp(1rem, 0.957rem + 0.217vw, 1.125rem)`     |
   | text-lg   | 18px           | 22px             | `clamp(1.125rem, 1.038rem + 0.435vw, 1.375rem)` |
   | text-xl   | 22px           | 28px             | `clamp(1.375rem, 1.245rem + 0.652vw, 1.75rem)`  |
   | text-2xl  | 28px           | 40px             | `clamp(1.75rem, 1.489rem + 1.304vw, 2.5rem)`    |
   | text-3xl  | 36px           | 56px             | `clamp(2.25rem, 1.815rem + 2.174vw, 3.5rem)`    |

   **Key principle**: larger type scales more aggressively. Body text grows by 2px (16->18), but display text grows by 20px (36->56). This maintains the hierarchy ratio — if everything grew by the same absolute amount, headings would lose prominence on desktop.

5. **Enforce minimum readable sizes.** These are non-negotiable floors:
   - **Body text**: 16px minimum on all viewports (WCAG 1.4.4 requires 200% zoom support; starting below 16px makes zoomed text unwieldy)
   - **Secondary text** (captions, labels): 12px minimum on desktop, 14px minimum on mobile (touch targets need larger text)
   - **Interactive text** (buttons, links): 16px minimum on mobile (Apple HIG recommends 17px for iOS)
   - **Code blocks**: 13px minimum (developers accept smaller code text, but below 13px monospace becomes illegible on standard DPI screens)
   - If your fluid calculation produces a size below these minimums at any viewport, raise the minimum in the clamp()

6. **Decide between fluid scaling and breakpoint scaling.** Both approaches are valid:

   **Fluid scaling (clamp):**
   - Pros: smooth transitions, no jarring size jumps, fewer values to maintain
   - Cons: harder to debug (what size am I at 834px?), requires understanding the math
   - Best for: marketing sites, editorial content, any page where smooth scaling enhances the experience

   **Breakpoint scaling (media queries):**
   - Pros: predictable — you know exactly what size at each breakpoint, easy to debug
   - Cons: abrupt changes at breakpoints, more CSS to maintain, gaps between breakpoints
   - Best for: complex applications with fixed layout breakpoints, design systems with strict size tokens

   **Hybrid approach (recommended for most projects):**
   - Use breakpoints for layout changes (grid columns, sidebar visibility)
   - Use fluid scaling for typography within each layout
   - This gives you smooth type scaling without the complexity of fully fluid layouts

## Details

### The Utopia Approach

Utopia (utopia.fyi) is the most rigorous fluid type system in production use. Its methodology:

1. Define a minimum viewport (320px) and maximum viewport (1240px)
2. Define a base size at each extreme: 16px (mobile) and 20px (desktop)
3. Define a scale ratio at each extreme: 1.2 (mobile) and 1.25 (desktop)
4. Generate every type scale step as a fluid value between its mobile and desktop sizes

**Utopia's key insight**: the type scale ratio itself can change between viewports. A tighter ratio on mobile (1.2 minor third) prevents headings from overwhelming small screens, while a wider ratio on desktop (1.25 major third) creates more dramatic hierarchy on large screens. This means the hierarchy does not just scale — it adapts.

Example output from Utopia for a 5-step scale:

```css
:root {
  --step--1: clamp(0.8333rem, 0.7981rem + 0.1757vw, 1rem); /* 13-16px */
  --step-0: clamp(1rem, 0.9348rem + 0.3261vw, 1.25rem); /* 16-20px */
  --step-1: clamp(1.2rem, 1.0893rem + 0.5536vw, 1.5625rem); /* 19-25px */
  --step-2: clamp(1.44rem, 1.2631rem + 0.8844vw, 1.9531rem); /* 23-31px */
  --step-3: clamp(1.728rem, 1.4583rem + 1.3484vw, 2.4414rem); /* 28-39px */
  --step-4: clamp(2.0736rem, 1.6766rem + 1.985vw, 3.0518rem); /* 33-49px */
}
```

### Material Design's Breakpoint Approach

Material Design 3 uses discrete breakpoints rather than fluid scaling:

| Window Class | Width Range | Body | Headline Large | Display Large |
| ------------ | ----------- | ---- | -------------- | ------------- |
| Compact      | 0-599px     | 14px | 28px           | 45px          |
| Medium       | 600-839px   | 14px | 32px           | 52px          |
| Expanded     | 840px+      | 16px | 32px           | 57px          |

Material's reasoning: their component system uses fixed-width layout patterns (cards, rails, drawers), so typography tied to those fixed patterns is more predictable than fluid values. This is a valid engineering trade-off — fluid is not always better.

### Tailwind CSS Responsive Typography

Tailwind provides responsive font sizes through breakpoint prefixes:

```html
<h1 class="text-2xl md:text-4xl lg:text-5xl">Responsive Heading</h1>
```

This maps to:

- Mobile (<768px): 24px
- Tablet (768px+): 36px
- Desktop (1024px+): 48px

Tailwind does not include fluid typography by default, but it integrates well with clamp:

```javascript
// tailwind.config.js
fontSize: {
  'fluid-base': 'clamp(1rem, 0.913rem + 0.435vw, 1.25rem)',
  'fluid-lg':   'clamp(1.25rem, 1.076rem + 0.87vw, 1.75rem)',
  'fluid-xl':   'clamp(1.75rem, 1.315rem + 2.174vw, 3.5rem)',
}
```

### Viewport Unit Limitations

Pure viewport units (`vw`) have critical problems:

- **On very small screens** (smartwatches, 200px viewports): `2vw` = 4px — microscopic and unreadable
- **On very large screens** (4K monitors, 3840px viewports): `2vw` = 76.8px — comically oversized
- **User zoom is defeated**: viewport units do not scale with browser zoom, violating WCAG 1.4.4 (Resize Text). Users who set their browser to 200% zoom get no benefit for vw-based text.
- **Solution**: always combine `vw` with `rem` in the preferred value (`0.5rem + 1vw`), and always wrap in `clamp()` with rem-based min/max. The `rem` component ensures zoom still works.

### Anti-Patterns

1. **Pure vw units without clamp bounds.** `font-size: 3vw` produces 9.6px on a 320px phone (illegible) and 57.6px on a 1920px desktop (absurd). This is the most common fluid typography mistake. Every viewport-relative size must have minimum and maximum bounds via `clamp()`.

2. **Too many breakpoint overrides.** A heading that changes size at 5 breakpoints (480px, 640px, 768px, 1024px, 1280px) is a maintenance burden and creates 5 jarring size transitions. Fluid typography with `clamp()` eliminates breakpoint overrides for font sizes entirely. If you must use breakpoints, limit to 2 (mobile and desktop).

3. **Shrinking body text below 14px on any viewport.** Some responsive systems scale body text to 12px or 13px on mobile "to fit more content." This sacrifices readability — the primary purpose of text. If content does not fit at 16px, the layout needs adjustment, not the font size. Minimum body text is 16px on all viewports.

4. **Non-proportional scaling that destroys hierarchy.** When headings scale from 48px to 24px (50% reduction) but body text stays fixed at 16px, the heading-to-body ratio drops from 3:1 to 1.5:1. At mobile sizes, the heading barely stands out. Fix: scale all text levels proportionally — if headings shrink 33%, body should shrink ~10-15% to maintain the ratio difference (just less aggressively).

5. **Forgetting line-height needs to scale too.** A heading at 48px with `line-height: 1.1` (52.8px leading) works beautifully. That same heading scaled to 24px on mobile still has `line-height: 1.1` (26.4px leading), which is too tight for a smaller size that now wraps to more lines. Use fluid line-height: `line-height: clamp(1.1, 1.0 + 0.25vw, 1.3)` or set line-height per breakpoint.

### Real-World Examples

**Implementing Utopia for a Marketing Site**
Requirements: hero headline 36-72px, subheadline 20-32px, body 16-20px, caption 14-16px.
Viewport range: 320px to 1440px.

```css
:root {
  --text-caption: clamp(0.875rem, 0.8315rem + 0.2174vw, 1rem);
  --text-body: clamp(1rem, 0.913rem + 0.4348vw, 1.25rem);
  --text-sub: clamp(1.25rem, 0.9891rem + 1.3043vw, 2rem);
  --text-hero: clamp(2.25rem, 1.4674rem + 3.913vw, 4.5rem);
}
```

Hierarchy ratios:

- At 320px: hero/body = 36/16 = 2.25:1
- At 1440px: hero/body = 72/20 = 3.6:1
- The ratio widens on desktop — correct behavior, because large screens can support more dramatic hierarchy.

**Converting a Breakpoint System to Fluid**
Before (5 breakpoints):

```css
h1 {
  font-size: 24px;
}
@media (min-width: 480px) {
  h1 {
    font-size: 28px;
  }
}
@media (min-width: 640px) {
  h1 {
    font-size: 32px;
  }
}
@media (min-width: 768px) {
  h1 {
    font-size: 36px;
  }
}
@media (min-width: 1024px) {
  h1 {
    font-size: 42px;
  }
}
@media (min-width: 1280px) {
  h1 {
    font-size: 48px;
  }
}
```

After (1 line):

```css
h1 {
  font-size: clamp(1.5rem, 0.978rem + 2.609vw, 3rem);
}
```

Same visual result (24px at 320px, 48px at 1280px), smooth transitions at every viewport in between, one declaration instead of six.

## Source

- Utopia — Fluid Type Scale Calculator (utopia.fyi)
- CSS-Tricks — "Simplified Fluid Typography" by Chris Coyier
- Modern Fluid Typography Using CSS Clamp — smashingmagazine.com
- WCAG 2.1 Success Criterion 1.4.4 — Resize Text
- Material Design 3 — Applying Typography (responsive type guidance)

## Process

1. **Evaluate** — Identify the current responsive type approach (fixed, breakpoint, or fluid). Check minimum sizes on the smallest target viewport. Calculate heading-to-body ratios at mobile and desktop to verify hierarchy is maintained.
2. **Apply** — Define fluid type values using clamp() with the min/preferred/max formula. Ensure body text minimum is 16px. Scale headings more aggressively than body to maintain hierarchy ratios. Use Utopia or manual calculation.
3. **Verify** — Test at 320px, 768px, 1024px, 1440px, and 2560px viewports. Confirm no text drops below minimum sizes. Verify hierarchy ratios are maintained across all widths. Check that browser zoom (200%) still increases text size (fails if using only vw units).

## Harness Integration

This is a knowledge skill. When activated, it provides responsive typography expertise to guide font-size declarations across viewports. Use these principles when implementing CSS `clamp()` values, configuring Tailwind `fontSize` with fluid values, or auditing responsive type behavior. Cross-reference with `design-type-scale` for base scale ratios and `design-readability` for line-length interaction at different viewport sizes.

## Success Criteria

- All type sizes use either fluid (clamp) or breakpoint scaling — no fixed px values that ignore viewport
- Body text is at least 16px at every viewport width including 320px
- Heading-to-body size ratio is maintained within 20% across mobile and desktop viewports
- No font size uses pure vw units without rem component and clamp bounds
- Browser zoom at 200% increases all text sizes (no viewport-unit-only text)
- Fluid type declarations use a consistent viewport range (e.g., 320px-1240px) across all tokens
