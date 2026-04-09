# Whitespace

> Space as a design element — macro vs. micro whitespace, breathing room, density control, and whitespace as a signal of quality and luxury

## When to Use

- Deciding padding, margin, and spacing values for any UI component or page section
- Evaluating why a layout feels cramped, cluttered, or disorganized
- Setting up a spacing scale for a design system
- Balancing information density against readability and visual comfort
- Communicating brand positioning through spatial treatment (premium vs. utilitarian)

## Instructions

1. **Distinguish macro and micro whitespace.** These are fundamentally different design decisions:
   - **Macro whitespace** — The large spaces between major elements: page margins, section padding, space between content blocks. Controls the overall density and feel of a page. Apple's product pages use 80-120px between sections (10-15 x 8px base unit), creating a one-idea-per-viewport cadence that feels unhurried and premium.
   - **Micro whitespace** — The small spaces within and between elements: padding inside buttons, space between a label and its input, gap between list items, letter-spacing. Controls readability and component density. Stripe's buttons use 12px vertical / 24px horizontal padding — the horizontal padding is 2x the vertical, giving text room to breathe without making the button feel oversized.

   You can have generous macro whitespace with tight micro whitespace (Stripe's dashboard: spacious sections, dense data tables) or vice versa. They are independent variables.

2. **Use whitespace as a grouping mechanism (Gestalt proximity).** Elements with less space between them are perceived as related. Elements with more space are perceived as separate. This is the most powerful layout tool you have — no borders, lines, or boxes needed:
   - **Tight grouping (4-8px):** Label + input field, icon + text, avatar + username
   - **Medium grouping (12-24px):** Items within a card, form fields within a section, list items
   - **Loose grouping (32-64px):** Sections within a page, card groups, major content blocks
   - **Separation (64-128px):** Distinct page zones, hero-to-content transition, footer separation

   **Decision procedure:** If two elements are related, the space between them should be less than the space between either element and the next unrelated element. Airbnb's listing cards use 16px internal padding but 24px between cards — the tighter internal space signals "these items belong together."

3. **Build a spacing scale.** Never use arbitrary spacing values. Define a scale based on a base unit and use only values from that scale:
   - **4px base scale:** 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128
   - **8px base scale:** 8, 16, 24, 32, 48, 64, 96, 128, 192 (Stripe, Material Design, Shopify Polaris)
   - **Naming convention (Tailwind-style):** xs=4px, sm=8px, md=16px, lg=24px, xl=32px, 2xl=48px, 3xl=64px, 4xl=96px

   Stripe's entire marketing site uses an 8px scale. Section padding is 96px (12x base). Card padding is 32px (4x base). Inline element gaps are 8px (1x base). Every value is a multiple — no exceptions. This consistency is why Stripe's layouts feel effortless despite being complex.

4. **Understand whitespace as a luxury signal.** Space is the most expensive resource in design — it costs content area. Premium brands spend it generously:
   - **Apple:** Product hero images float in massive whitespace. A single product photo might occupy 40% of a viewport, with the remaining 60% as empty space. This communicates "we have nothing to prove — the product speaks for itself."
   - **Vercel:** Homepage sections use 120-160px vertical padding. A section that could be 200px tall is given 500px. The generosity signals confidence and sophistication.
   - **Bloomberg Terminal:** The opposite — extreme density communicates "every pixel carries information, we respect your expertise." Minimal padding, tight line-height, no decorative whitespace.

   **Decision procedure:** Where does your product sit on the utility-to-luxury spectrum? Dashboards and tools should use tighter spacing (high utility). Marketing and brand pages should use generous spacing (high luxury). The same product can use different densities for different pages.

5. **Differentiate active and passive whitespace.** Active whitespace is an intentional design decision. Passive whitespace is leftover space that nobody planned:
   - **Active:** Stripe's 96px section padding. It is deliberate — tested at 64px, 80px, 96px, 112px, and 96px was chosen because it creates exactly the right reading rhythm.
   - **Passive:** A sidebar that is 300px wide because the developer set `width: 300px`, leaving 47px of unexplained space at the bottom. Nobody designed that space — it just happened.
   - **Diagnosis:** If you cannot explain why a particular space is that size, it is passive whitespace. Either make it intentional (assign it a value from your spacing scale) or eliminate it.

6. **Apply the spacing paradox.** Adding whitespace often makes a layout feel more organized even though it contains less content per viewport. This is counterintuitive but consistently true:
   - A card with 16px padding and 12px gaps between elements feels cluttered. The same card with 24px padding and 16px gaps feels polished — even though it now requires more viewport space.
   - A page with 40px section padding feels like a Word document. The same page with 80px section padding feels like a designed experience.
   - **Test:** If a layout feels "off" but you cannot pinpoint why, increase all spacing by one step on your scale (e.g., 16px to 24px, 24px to 32px). In most cases, this resolves the issue.

## Details

### Spacing Scale Reference

| Context               | Tight (Dashboard) | Standard (App) | Generous (Marketing) |
| --------------------- | ----------------- | -------------- | -------------------- |
| Section padding       | 32-48px           | 48-80px        | 80-128px             |
| Card internal padding | 12-16px           | 16-24px        | 24-32px              |
| Between form fields   | 12-16px           | 16-24px        | 20-32px              |
| Between list items    | 4-8px             | 8-12px         | 12-16px              |
| Button padding (v/h)  | 6/12px            | 8/16px         | 12/24px              |
| Icon-to-label gap     | 4-6px             | 8px            | 8-12px               |
| Page margin (mobile)  | 12-16px           | 16-20px        | 20-24px              |
| Page margin (desktop) | 24-40px           | 40-80px        | 80-120px             |

### Whitespace Audit Procedure

To evaluate an existing design's whitespace:

1. **List every unique spacing value.** If there are more than 8-10 distinct values, the system lacks a scale.
2. **Check that each value is a multiple of the base unit.** Values like 13px, 17px, or 23px indicate ad-hoc spacing.
3. **Verify proximity grouping.** Related elements should have less space between them than unrelated elements. If a label is 16px from its input but also 16px from the next form group, the grouping signal is ambiguous.
4. **Check for passive whitespace.** Look for large empty areas that serve no grouping or rhythm purpose. These usually appear at the bottom of sidebars, between a short page and its footer, or inside oversized containers.
5. **Measure the luxury-utility ratio.** Compare total whitespace area to total content area. Marketing pages: 40-60% whitespace. Dashboards: 15-30% whitespace. If a dashboard is 50% whitespace, it is wasting screen real estate.

### Anti-Patterns

1. **Horror vacui (fear of empty space).** Filling every available pixel with content, decoration, borders, or background patterns. The result is overwhelming — the eye has no resting point and cannot establish hierarchy. Diagnosis: if removing an element would improve the design, horror vacui is present.

2. **Inconsistent spacing.** Using 8px here, 13px there, 20px somewhere else — values chosen per-element rather than from a scale. This creates a subliminal sense of disorder that users feel but cannot articulate. Even non-designers perceive inconsistent spacing as "unprofessional." Fix: audit all spacing values and round each to the nearest scale value.

3. **Equal spacing everywhere.** Uniform 16px gaps between all elements regardless of their relationship. This eliminates the grouping signal that whitespace provides — a label is the same distance from its input as it is from an unrelated heading. The fix is not more space, but differential space: tighter within groups, looser between groups.

4. **Decorative fillers.** Using background patterns, gradient dividers, ornamental lines, or clip-art to fill space that "feels too empty." These are symptoms of horror vacui. The space was doing its job — the filler undermines it. Stripe uses only two dividers on its entire homepage: a subtle border-top on the footer and a color-shift between sections.

### Real-World Examples

**Apple Product Pages:**

- Hero section: product image centered in ~600px of vertical whitespace
- Feature sections: 100-120px padding top and bottom, single idea per section
- Text blocks: max-width 680px centered, generous 40px+ margins on either side
- The spatial treatment communicates: "this product deserves contemplation, not scanning"

**Stripe Dashboard vs. Stripe Marketing:**

- Dashboard: 16px card padding, 8px gaps between data rows, 24px section spacing. Dense, efficient, utilitarian.
- Marketing: 32px card padding, 96px section padding, 48px between feature blocks. Generous, premium, persuasive.
- Same brand, same spacing scale (8px base), radically different density — because the contexts demand different approaches.

**Vercel Homepage:**

- Section vertical padding: 120-160px — among the most generous in SaaS
- Content max-width: ~1100px with auto margins, leaving significant horizontal whitespace on wide screens
- Code blocks float in 40-60px of surrounding space, making them feel like curated examples rather than documentation
- The extreme whitespace positions Vercel as a premium developer tool, not a commodity platform

**Spotify Desktop App:**

- Playlist view: 4px micro-spacing between track rows for scan density (expert users want to see many tracks)
- Album header: 32px between album art and metadata — clear grouping without waste
- Home page browse cards: 16px gap between cards, 48px between sections (genre rows)
- Sidebar navigation: 4px between items within a group, 16px between groups (Your Library vs. Playlists)
- Demonstrates that a single product can use 3-4 different density zones: dense in lists, moderate in navigation, generous in discovery

### Responsive Whitespace Adaptation

Whitespace must scale with viewport — but not linearly. A 96px section padding on desktop should not shrink proportionally to 24px on mobile. Instead:

- **Desktop (1200px+):** Full spacing scale. Section padding 80-120px. Page margins 40-80px.
- **Tablet (768-1199px):** Reduce macro whitespace by ~30%. Section padding 56-80px. Page margins 24-40px. Micro whitespace stays the same — button padding, icon gaps, and label spacing should not change.
- **Mobile (320-767px):** Reduce macro whitespace by ~50%. Section padding 40-64px. Page margins 16-20px. Micro whitespace unchanged.
- **Key principle:** Macro whitespace is compressible. Micro whitespace is not. Shrinking the padding inside a button from 12px to 6px makes it feel broken. Shrinking section padding from 96px to 48px feels like a natural adaptation.

## Source

- Josef Muller-Brockmann, "Grid Systems in Graphic Design" — spatial rhythm and proportion
- "Refactoring UI" by Adam Wathan and Steve Schoger — practical spacing guidelines for web interfaces
- Material Design spacing documentation (m3.material.io/foundations/layout/spacing)
- Edward Tufte, "Envisioning Information" — data-ink ratio and meaningful use of space

## Process

1. **Define** a spacing scale based on a 4px or 8px base unit before placing any elements
2. **Apply** spacing using the Gestalt proximity principle: tighter within groups, looser between groups
3. **Audit** by listing all unique spacing values and verifying each is from the defined scale

## Harness Integration

This is a knowledge skill. When activated, its content is injected into the system prompt to guide spacing and layout decisions. It does not execute code or modify files. Use alongside `design-grid-systems` for structural layout, `design-content-density` for density calibration, and `design-visual-hierarchy` for attention management.

## Success Criteria

- All spacing values derive from a declared scale with a consistent base unit
- Macro and micro whitespace are independently calibrated for the page context
- Related elements have tighter spacing than unrelated elements (proximity grouping)
- No passive whitespace — every significant space can be explained as a scale value
- Density matches the page purpose: generous for marketing, efficient for dashboards
