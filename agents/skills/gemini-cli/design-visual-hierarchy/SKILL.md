# Visual Hierarchy

> Directing attention through size, color, contrast, position, isolation, and motion — the system that tells the eye where to go first, second, and third

## When to Use

- Designing any page or screen where multiple elements compete for attention
- Evaluating why a layout feels confusing, flat, or overwhelming
- Deciding relative sizes, colors, and positions for headings, body text, CTAs, and supporting elements
- Building a component that must communicate primary, secondary, and tertiary importance levels
- Reviewing a design to validate that the intended reading order matches the actual visual order

## Instructions

1. **Establish exactly one dominant element per viewport.** Every page needs a clear entry point — the single element the eye hits first. If two elements compete for dominance, the viewer hesitates and the layout feels chaotic:
   - **Stripe homepage:** The headline "Financial infrastructure for the internet" is the dominant element — ~56px font, bold weight, high contrast (dark on light), positioned in the upper-left quadrant. Everything else is subordinate.
   - **Apple product page:** The hero product image dominates — it occupies 50-60% of the viewport, is full-color against a neutral background, and is positioned center-screen.
   - **Test:** Squint at the page. The element that remains visible when everything else blurs is the dominant element. If nothing emerges — or two things emerge equally — the hierarchy is broken.

2. **Use the seven hierarchy tools in combination.** Each tool adds visual weight. The more tools you stack on an element, the more dominant it becomes:

   | Tool               | How It Adds Weight                                   | Example                                             |
   | ------------------ | ---------------------------------------------------- | --------------------------------------------------- |
   | **Size**           | Larger = heavier. The most powerful single tool.     | Stripe hero: 56px headline vs. 18px body text       |
   | **Color**          | Saturated, warm, or brand colors draw attention.     | Vercel: blue "Deploy" CTA against monochrome page   |
   | **Contrast**       | High contrast foreground/background draws the eye.   | Apple: white text on black hero, gray text for meta |
   | **Position**       | Top-left (LTR) and center draw first attention.      | Dashboards: key metrics in top-left quadrant        |
   | **Isolation**      | An element surrounded by whitespace draws attention. | Apple: single product floating in vast empty space  |
   | **Texture/Detail** | Complex, detailed elements attract over simple ones. | Airbnb: photo-rich listing vs. plain text sidebar   |
   | **Motion**         | Moving elements override all static hierarchy.       | Stripe: animated gradient draws eye before reading  |

   **Decision procedure:** For your primary element, apply 3-4 tools (large + high contrast + prime position + isolation). For secondary elements, apply 1-2 tools. For tertiary elements, apply none — they should be visually quiet.

3. **Design in three tiers: primary, secondary, tertiary.** Every element on the page belongs to exactly one tier:
   - **Primary (1-2 elements):** The headline, hero image, or primary CTA. Uses maximum visual weight. Should be identifiable in a 1-second scan.
   - **Secondary (3-5 elements):** Subheadings, feature descriptions, secondary CTAs, key images. Moderate visual weight. Discovered after the primary element establishes context.
   - **Tertiary (everything else):** Body text, metadata, navigation, footers, fine print. Minimal visual weight. Available when sought but never competing with primary or secondary.

   **Stripe's pricing page demonstrates this clearly:**
   - Primary: plan names and prices (large, bold, high contrast)
   - Secondary: feature lists and "Get started" buttons (medium weight, brand color for CTAs)
   - Tertiary: footnotes, comparison toggles, trust badges (small, gray, low contrast)

4. **Validate hierarchy with the squint test and blur test.** These are non-negotiable quality checks:
   - **Squint test:** Squint until the page blurs. The elements visible through the blur are your actual hierarchy. If they match your intended hierarchy, the design works. If metadata is more visible than the headline, something is wrong.
   - **Blur test (Gaussian blur):** Apply a 5-10px Gaussian blur to a screenshot. Same principle — only high-contrast, large elements survive the blur. In Figma, use a background blur layer at 8px to simulate this.
   - **5-second test:** Show the design to someone for 5 seconds, then hide it. Ask what they remember. What they recall is your effective primary tier. What they missed is your effective tertiary tier.

5. **Understand F-pattern and Z-pattern scanning.** Eye-tracking research shows consistent scanning patterns:
   - **F-pattern:** Used for text-heavy pages (articles, documentation, search results). The eye scans the top horizontal line, drops down, scans a shorter horizontal line, then skims down the left edge. Nielsen Norman Group eye-tracking studies confirmed this across 232 users. Implication: put the most important content in the first line and along the left edge.
   - **Z-pattern:** Used for pages with less text and more visual elements (landing pages, marketing). The eye moves: top-left → top-right → diagonal to bottom-left → bottom-right. Implication: place your logo/headline top-left, CTA top-right or bottom-right.
   - **Exception:** A strong dominant element overrides scanning patterns. If a centered hero image is large enough, the eye goes there first regardless of F or Z pattern.

6. **Use contrast ratios as a hierarchy system.** Beyond accessibility, contrast is a precision tool for establishing reading priority:
   - **Primary text:** Maximum contrast. Black on white (#000 on #fff) = 21:1 ratio. Or near-black (#111 on #fff) = 18.6:1.
   - **Secondary text:** Reduced contrast. Dark gray on white (#555 on #fff) = 7.5:1. Still meets WCAG AA.
   - **Tertiary text:** Minimum usable contrast. Medium gray on white (#767676 on #fff) = 4.54:1. Just meets WCAG AA for normal text.
   - **Decorative/disabled:** Below reading threshold. Light gray on white (#aaa on #fff) = 2.32:1. Not meant to be read — signals "inactive" or "background."

   Apple uses this exact system: primary labels at ~17:1, secondary at ~7:1, tertiary at ~4.5:1, and disabled/placeholder at ~2.5:1.

## Details

### Visual Weight Formula

Visual weight is not a single property but a composite. An element's weight is roughly:

```
weight = size_factor + contrast_factor + saturation_factor + isolation_factor + position_factor
```

Where each factor is 0-3:

- **Size:** 0 = smallest on page, 3 = largest
- **Contrast:** 0 = low contrast with background, 3 = maximum contrast
- **Saturation:** 0 = grayscale, 3 = fully saturated brand/accent color
- **Isolation:** 0 = surrounded by other elements, 3 = floating in whitespace
- **Position:** 0 = bottom-right corner, 3 = top-left or dead center

A primary element should score 10-15. A secondary element should score 5-9. A tertiary element should score 0-4. If two elements score within 2 points of each other, they will compete for attention.

### Hierarchy Across Component States

Within a single component, hierarchy applies to states:

- **Default:** Medium weight — visible but not demanding attention
- **Hover:** Increased weight — color shift, subtle shadow, slight scale (1.02x)
- **Active/Selected:** High weight — brand color, bold border, filled background
- **Disabled:** Minimal weight — reduced opacity (0.4-0.5), desaturated, no hover response
- **Error:** High weight via color — red (#d32f2f) draws immediate attention. Errors should be primary-tier regardless of the element's normal tier.

Material Design's state layers demonstrate this: hover adds 8% opacity overlay, focus adds 12%, pressed adds 12%, dragged adds 16%.

### Anti-Patterns

1. **Competing focal points.** Two elements of equal visual weight fight for attention — a large image AND a large headline at the same size, color, and contrast. The viewer oscillates between them. Fix: make one clearly dominant. Stripe never lets an image compete with a headline — images are always muted, desaturated, or smaller than the text.

2. **Flat hierarchy.** Everything the same size, weight, and color. Common in engineering-driven layouts where every piece of data feels equally important. The result: nothing stands out, so the user must read everything sequentially. Fix: force-rank every element into primary/secondary/tertiary before placing it.

3. **Decoration over content.** Ornamental backgrounds, gradient borders, animated patterns, or decorative icons that carry more visual weight than the actual content. The eye goes to the decoration first. Fix: the squint test — if decorative elements are more visible than content elements, reduce their weight (lower opacity, desaturate, shrink).

4. **Motion abuse.** Animations and transitions that are so prominent they override all static hierarchy. A subtle entrance animation is secondary; a looping animation is primary. If a background animation draws more attention than the headline, it is competing with — not supporting — the hierarchy. Vercel uses motion sparingly: a gradient shift on hover, never a persistent loop.

### Real-World Examples

**Stripe Homepage (3-Tier Hierarchy):**

- Tier 1 (Primary): "Financial infrastructure for the internet" — 56px, bold, #0a2540, top-left. Score: ~14 (size 3, contrast 3, saturation 0, isolation 3, position 3, bold 2).
- Tier 2 (Secondary): Subheading paragraph — 20px, #425466, below headline. Score: ~7.
- Tier 3 (Tertiary): Navigation links — 15px, #425466, top bar. Score: ~3.
- The gradient illustration is visually rich but positioned right-side and uses muted colors — it does not compete with the headline.

**Apple Product Comparison Page:**

- Tier 1: Product images — large, full-color, centered
- Tier 2: Product names and prices — 21px bold, high contrast
- Tier 3: Feature specs — 14px, gray, tabular layout
- Hierarchy survives the blur test: products visible, names partially visible, specs disappear

**Vercel Dashboard:**

- Tier 1: Project name and status — left-aligned, 18px bold, status badge with color coding
- Tier 2: Deployment list — each entry has timestamp, commit hash, branch name at 14px
- Tier 3: Settings navigation — sidebar links at 14px, gray, no visual emphasis
- The active navigation item uses weight + blue accent color to establish "you are here" without competing with content

## Source

- Donis A. Dondis, "A Primer of Visual Literacy" — foundational theory of visual weight and composition
- Jakob Nielsen and Kara Pernice, "Eyetracking Web Usability" — F-pattern and Z-pattern research
- Susan Weinschenk, "100 Things Every Designer Needs to Know About People" — cognitive processing of visual hierarchy
- Material Design 3 documentation on emphasis and visual hierarchy

## Process

1. **Rank** every element on the page into primary (1-2), secondary (3-5), or tertiary (remaining) before touching any visual properties
2. **Assign** visual weight using the seven hierarchy tools: stack 3-4 tools on primary, 1-2 on secondary, none on tertiary
3. **Validate** with the squint test and blur test — verify that the intended hierarchy matches the perceived hierarchy

## Harness Integration

This is a knowledge skill. When activated, its content is injected into the system prompt to guide layout and emphasis decisions. It does not execute code or modify files. Use alongside `design-typographic-hierarchy` for text-specific hierarchy, `design-contrast-ratio` for contrast-based emphasis, and `design-whitespace` for isolation-based emphasis.

## Success Criteria

- Every viewport has exactly one dominant element identifiable in a 1-second scan
- All elements are assigned to primary, secondary, or tertiary tiers with no ambiguity
- The squint test confirms that intended hierarchy matches perceived hierarchy
- No two elements within the same viewport have competing visual weight
- Hierarchy is maintained across all viewport sizes — primary elements remain dominant on mobile
