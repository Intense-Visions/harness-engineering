# Typographic Hierarchy

> Establishing reading order through type — size, weight, color, spacing, case, and position as hierarchy signals

## When to Use

- Designing a page layout where users must scan and find information quickly
- Building a component library with heading, body, caption, and label styles
- Auditing a page that "feels flat" or where everything competes for attention equally
- Creating dashboard or data-heavy interfaces where information priority is critical
- Establishing the relationship between HTML heading levels and visual heading styles

## Instructions

1. **Use the 6 hierarchy levers in order of strength.** Each lever creates a different degree of visual separation. Stronger levers create more dramatic hierarchy:

   | Lever        | Strength   | Mechanism                                                 | Example                           |
   | ------------ | ---------- | --------------------------------------------------------- | --------------------------------- |
   | **Size**     | Strongest  | Larger text draws the eye first                           | 48px heading vs 16px body         |
   | **Weight**   | Strong     | Bolder text creates density that attracts attention       | 700 weight heading vs 400 body    |
   | **Color**    | Strong     | High-contrast text stands out from muted surroundings     | #000000 heading vs #6b7280 body   |
   | **Spacing**  | Moderate   | Whitespace above an element signals a new section         | 48px margin-top vs 16px           |
   | **Case**     | Moderate   | ALL CAPS or small-caps differentiates without size change | SECTION LABEL vs Body text        |
   | **Position** | Contextual | Top-left reads first in LTR; above reads before below     | Page title at top of content area |

   **Decision procedure**: Start with size as the primary differentiator. Add weight if size alone is insufficient. Use color for tertiary distinctions. Reserve case and spacing for labels and section breaks.

2. **Establish exactly 3-4 active hierarchy levels per page.** More than 4 levels force the reader to constantly recalibrate importance. Fewer than 3 levels make the page feel flat.

   **Standard 4-level system:**
   - **Level 1 — Page title**: largest size, often lightest weight (e.g., Stripe's 300-weight headlines)
   - **Level 2 — Section heading**: medium-large size, medium weight
   - **Level 3 — Subsection/label**: body size or slightly larger, bold weight or distinct color
   - **Level 4 — Body text**: base size, regular weight, standard color

   **Compact 3-level system (for dashboards):**
   - **Level 1 — Section header**: moderately larger, bold
   - **Level 2 — Body/data**: base size, regular weight
   - **Level 3 — Caption/meta**: smaller size or muted color

3. **Apply the squint test.** Zoom your design to 25% or blur your vision. You should still be able to identify:
   - Which element is the page title
   - Where sections begin and end
   - What is primary content vs secondary content
     If everything blurs into a uniform gray mass, your hierarchy is too flat. If multiple elements compete at the same visual weight, you have hierarchy collision.

4. **Create hierarchy with a single font family.** You do not need multiple typefaces to establish hierarchy. A single variable font with weight and size variation is sufficient:

   ```
   Page title:     32px, weight 300, color #1a1a1a, letter-spacing -0.5px
   Section head:   24px, weight 600, color #1a1a1a
   Subsection:     16px, weight 600, color #374151
   Body:           16px, weight 400, color #374151
   Caption:        14px, weight 400, color #6b7280
   ```

   This 5-style system uses 3 levers (size, weight, color) to create 5 distinguishable levels from one font family.

5. **Separate semantic heading levels from visual hierarchy.** HTML heading levels (h1-h6) represent document structure. Visual hierarchy levels represent visual prominence. These can diverge:
   - A sidebar `h2` might be styled at visual level 3 (smaller, since sidebars are secondary)
   - A hero `h1` might be styled at display size (larger than any standard heading level)
   - Use CSS classes for visual treatment and HTML elements for semantics: `<h2 class="text-lg font-medium">` not `<h4>` to make it smaller

6. **Use whitespace to reinforce hierarchy.** The space above a heading signals its importance:
   - **Page title**: 48-64px space above (or at page top)
   - **Section heading**: 32-48px space above, 16-24px space below
   - **Subsection heading**: 24-32px space above, 8-16px space below
   - **Body paragraph**: 16px space between paragraphs
   - **Rule**: space above a heading should always be larger than space below it — this binds the heading to the content it introduces

## Details

### How Leading Design Systems Implement Hierarchy

**Vercel Documentation Hierarchy**
Vercel achieves crystal-clear hierarchy using only the Geist font family:

- **Level 1 — Page title**: 36px, weight 700, color #000, letter-spacing -0.04em
- **Level 2 — Section heading (h2)**: 24px, weight 600, color #000, letter-spacing -0.02em
- **Level 3 — Subsection heading (h3)**: 20px, weight 600, color #000
- **Level 4 — Body text**: 16px, weight 400, color #444
- **Level 5 — Caption/meta**: 14px, weight 400, color #666
- The progression: each level differs from the next by at least 2 properties (size + weight, or size + color)

**Stripe API Documentation Hierarchy**
Stripe's docs demonstrate role-based hierarchy separation:

- **Page title**: 28px, sohne weight 300, color #1a1a1a — light weight signals confidence
- **Section heading**: 20px, sohne weight 400, color #1a1a1a — heavier than the title but smaller
- **Parameter name**: 14px, Source Code Pro weight 600, color #3a3f47 — monospace distinguishes code from prose
- **Description**: 14px, sohne weight 400, color #697386 — muted color for supporting text
- **Key insight**: Stripe inverts the typical weight convention — lighter weight for primary headings, heavier for secondary. This works because size does the heavy lifting for hierarchy, freeing weight for tone.

**Apple Marketing Pages**
Apple's product pages demonstrate extreme hierarchy for scanning:

- **Hero headline**: 96px, SF Pro Display weight 700, color #1d1d1f, letter-spacing -0.015em
- **Subheadline**: 28px, SF Pro Display weight 600, color #1d1d1f
- **Body**: 21px, SF Pro Text weight 400, color #1d1d1f, line-height 1.47
- **Caption**: 17px, SF Pro Text weight 400, color #6e6e73
- Three tiers with dramatic size ratios: 96 -> 28 -> 21. The hero is 4.6x the body size. Each tier is unmistakable at any viewing distance.

### Weight as a Hierarchy Tool

Weight is the second-strongest hierarchy lever, but it has nuances:

**Conventional approach (bold = important):**

- Headings at 600-700, body at 400. Universal, expected, safe.
- Used by: Material Design, Tailwind defaults, most documentation sites.

**Inverted approach (light = primary):**

- Primary headings at 300 (thin/light), body at 400 (regular). Counterintuitive but effective — the light weight at large size reads as confident and premium.
- Used by: Stripe (weight 300 for display headlines), Apple (weight 200-300 for marketing heroes).
- **Prerequisite**: only works when size difference is dramatic (32px+ headlines). At small sizes, light weight reduces readability.

**Weight contrast minimum:** For two levels to be weight-distinguishable, they need at least a 200-unit difference on a variable font weight axis (e.g., 400 vs 600, or 300 vs 500). A 100-unit difference (400 vs 500) is often imperceptible at body sizes.

### Hierarchy in Data-Dense Interfaces

Dashboards and admin panels present a unique hierarchy challenge: many content blocks compete simultaneously. Solutions:

- **Card-level hierarchy**: each card has its own internal 2-level hierarchy (title + data), and the card container itself creates section separation through borders and spacing
- **Metric emphasis**: key numbers displayed at 32-48px while labels sit at 12-14px — a 3:1 size ratio within a single component
- **Muted chrome**: navigation, breadcrumbs, and metadata at low-contrast gray (#9ca3af on #ffffff = 2.7:1), reserving high contrast for primary data
- **Example**: Stripe Dashboard uses #697386 (muted gray) for labels and #1a1a1a for values — a two-tier color system that separates "what this is" from "what it says"

### Anti-Patterns

1. **Everything is bold.** When headings, labels, navigation items, buttons, and emphasized text are all font-weight 600-700, the weight lever stops functioning. Bold becomes the default, not a signal. Audit your styles: if more than 30% of visible text is bold, you have lost weight as a hierarchy tool. Reserve bold for headings and primary actions only.

2. **Too many hierarchy levels.** A page with 6+ visually distinct text styles (display, h1, h2, h3, h4, body, small, caption, overline, label) forces the reader to decode a complex visual language. Collapse to 3-4 levels. If you need 6 heading levels in HTML for document structure, you do not need 6 visual styles — multiple heading levels can share the same visual treatment.

3. **Size as the only differentiator.** A hierarchy built exclusively on size (48, 36, 28, 24, 20, 16, 14) without weight or color variation creates a monotonous "zoom effect" where text just gets smaller. Each level should differ by at least 2 properties. A 24px regular gray heading is more distinct from 16px regular gray body than a 24px regular black heading is from 16px regular black body.

4. **Heading levels that match visual hierarchy exactly.** Using `h1` for the biggest text, `h2` for the next biggest, all the way down is correct by coincidence, not by principle. A modal dialog's title might be an `h2` visually styled at 20px (smaller than the page h1 at 32px). Decouple semantic levels from visual levels using CSS classes.

### Real-World Examples

**Redesigning a Flat Dashboard**
Problem: A SaaS dashboard has all text at 14px, weight 400, color #333. Users report "I cannot find anything."
Solution applied:

- Page title: 24px, weight 600, color #111827 (level 1)
- Card titles: 16px, weight 600, color #111827 (level 2)
- Data values: 14px, weight 400, color #111827 (level 3)
- Labels and meta: 12px, weight 400, color #6b7280 (level 4)
- Result: 4 levels using 3 sizes, 2 weights, 2 colors. Users can now scan the page and identify sections in under 2 seconds.

**Creating a Blog Typography System**
Goal: Clear hierarchy for long-form content with minimal styles.
System:

- Article title: 40px, weight 800, color #0f172a, letter-spacing -0.025em
- Section heading (h2): 28px, weight 700, color #0f172a
- Subsection (h3): 22px, weight 600, color #1e293b
- Body: 18px, weight 400, color #334155, line-height 1.75
- Image caption: 14px, weight 400, color #64748b, italic
- Pull quote: 24px, weight 400, color #0f172a, italic, border-left 4px #e2e8f0
- Six roles, 4 visual levels (title and h2 are distinct; h3 and body share size tier but differ in weight).

## Source

- Lupton, Ellen. _Thinking with Type_, 2nd revised edition — hierarchy and contrast
- Butterick, Matthew. _Butterick's Practical Typography_ — headings chapter
- Material Design 3 Typography — https://m3.material.io/styles/typography
- Nielsen Norman Group — "F-Shaped Pattern for Reading Web Content"

## Process

1. **Evaluate** — Identify how many hierarchy levels the page requires. Audit existing text styles for redundancy and collision. Apply the squint test to check visual separation.
2. **Apply** — Define 3-4 hierarchy levels using size, weight, and color as primary levers. Assign each text role to a level. Use whitespace to reinforce level transitions.
3. **Verify** — Confirm each level is visually distinguishable at 25% zoom, no more than 4 active levels compete on any single viewport, and semantic heading levels are correctly separated from visual hierarchy.

## Harness Integration

This is a knowledge skill. When activated, it provides typographic hierarchy principles to guide heading styles, text tokens, and content layout decisions. Use these principles when defining heading component props, text utility classes, or design token hierarchies. Cross-reference with `design-type-scale` for size relationships and `design-visual-hierarchy` for non-typographic hierarchy signals.

## Success Criteria

- The page has exactly 3-4 active visual hierarchy levels
- Each level differs from adjacent levels by at least 2 properties (size, weight, color)
- The squint test at 25% zoom reveals clear hierarchy structure
- Semantic HTML heading levels are independent of visual heading styles
- No more than 30% of visible text uses bold weight
- Whitespace above headings is larger than whitespace below them
