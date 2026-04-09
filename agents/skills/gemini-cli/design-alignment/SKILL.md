# Alignment

> Visual order through edge alignment, center alignment, optical alignment, and the invisible structure that consistent alignment creates across a page

## When to Use

- Laying out any page or component where multiple elements must relate to each other spatially
- Evaluating why a layout feels "sloppy" or "off" despite having correct content and hierarchy
- Deciding between left-aligned, center-aligned, or right-aligned text and elements
- Aligning elements that are different shapes or sizes (icons with text, images with headings)
- Building design systems where components must align consistently across contexts

## Instructions

1. **Prefer left-edge alignment as the default.** Left-edge alignment (in LTR languages) creates the strongest visual structure because it establishes a single vertical line that the eye can follow down the page:
   - **Why it works:** The eye returns to the same x-coordinate after each line, creating a predictable rhythm. Nielsen Norman Group eye-tracking studies show that the left edge receives 69% of viewing time on text-heavy pages.
   - **Stripe's entire dashboard** is left-edge aligned: navigation labels, section headings, table columns, form labels — all share a common left edge. This creates a strong vertical axis that organizes the entire interface.
   - **Apple's developer documentation** uses left-edge alignment for all body text, code blocks, and headings. The left edge is the single most consistent visual element on the page.
   - **Rule:** When in doubt, left-align. Center alignment and right alignment are special-purpose tools (see below).

2. **Use center alignment only for short, isolated content.** Center alignment creates no strong edge — the left and right sides of each line are ragged. This makes it unsuitable for body text but effective for:
   - **Hero headlines** — 1-3 lines, centered on the page. Vercel's homepage: "Develop. Preview. Ship." is centered, 3 words, maximum impact.
   - **Card titles** — Short labels centered within a contained card. Stripe's pricing cards center plan names ("Starter," "Scale," "Enterprise").
   - **Single-line captions** — Photo captions, attribution lines, copyright notices.
   - **Never center:** Body paragraphs (more than 2 lines), form labels, navigation items, table headers, list items. These require the strong left edge for scanning.

   **Specific threshold:** If the text exceeds 3 lines, switch from center to left alignment. Three centered lines are scannable; four begin to feel adrift.

3. **Minimize the number of distinct alignment axes.** Every unique alignment point adds visual complexity. Fewer axes = cleaner design:
   - **1-2 axes:** Clean, structured, professional. A single left edge with content at two indent levels (headings flush left, body indented 24px).
   - **3-4 axes:** Acceptable for complex layouts with distinct zones (sidebar left edge + content left edge + right-aligned metadata).
   - **5+ axes:** Almost certainly messy. Each axis is a line the eye must track. Audit by drawing vertical lines at every alignment point — if the lines look chaotic, reduce them.

   **Stripe's pricing page** uses exactly 3 alignment axes: left edge of card content, center of card headers, and right edge of the price amount. Three axes for an entire complex page.

4. **Understand optical vs. mathematical alignment.** Mathematical alignment (pixel-perfect coordinates) does not always look aligned to the human eye. Certain shapes require optical correction:
   - **Triangles and pointed shapes:** A play button (triangle) mathematically centered in a circle looks shifted left because the triangle's visual mass is concentrated on the left side. Shift it 1-3px right. Spotify's play button is offset ~2px right from mathematical center.
   - **Rounded shapes:** A circle mathematically aligned with a square's top edge looks too high because the curve starts tapering before the edge. Shift the circle down 1-2px. Material Design icon guidelines specify optical alignment rules for circular vs. rectangular icons.
   - **Text baseline vs. bounding box:** Aligning text by its bounding box (the CSS box) rather than its baseline creates misalignment — letters with descenders (g, p, y) push the visual center up. Always align text to baseline, not to the container edge.
   - **Overshooting:** Round letters (O, C, S) and pointed letters (A, V, W) must extend slightly beyond the baseline and cap-height to look the same size as flat letters (H, E, T). Professional typefaces build this in, but when setting custom sizes or creating logos, expect to adjust by 1-3%.

5. **Use cross-element alignment to create cohesion.** Elements in different sections that share an alignment axis feel related, even across significant vertical distance:
   - **Stripe's homepage:** The left edge of the hero headline aligns with the left edge of feature section headings 800px below. This invisible vertical line ties the entire page together.
   - **Apple's comparison pages:** Spec values in different product columns are baseline-aligned across rows. The eye can scan horizontally and compare values because they sit on the same line.
   - **Material Design's list items:** Leading icons (40px from left edge), primary text (72px from left edge), and trailing actions (16px from right edge) create three consistent rails that persist across every list in the app.

   **Implementation:** In CSS, this means using consistent margin-left/padding-left values across components, not per-component values. A design token like `--content-inset: 72px` applied to headings, paragraphs, and list items creates automatic cross-element alignment.

6. **Align related elements across cards and containers.** When displaying multiple cards, tiles, or panels side by side, their internal elements should align horizontally:
   - **Stripe's pricing cards:** Feature names at the same y-coordinate across all three cards. Prices at the same y-coordinate. CTA buttons at the same y-coordinate. This creates a visual grid within the cards that facilitates comparison.
   - **Airbnb listing cards:** Photo tops align, titles align, price lines align. Even though card content varies in length, the key comparison points (photo, title, price) are at consistent positions.
   - **When content varies:** Use a fixed-height zone for variable content (description text) and pin the comparison elements (price, CTA) to absolute positions within the card. This sacrifices some vertical space for alignment clarity.

## Details

### Alignment Strength Hierarchy

Not all alignment types create equal visual order:

1. **Left edge (strongest in LTR)** — Creates a hard vertical line. Used for body text, navigation, form layouts. The eye returns here after every line.
2. **Top edge** — Creates a horizontal line across elements. Critical for card grids, inline elements, and tab bars.
3. **Baseline (text)** — Aligns the invisible line that letters sit on. Stronger than bounding-box alignment for mixed-size text.
4. **Right edge** — Creates a vertical line on the right. Useful for numbers (right-align for easy comparison), metadata, timestamps.
5. **Center (weakest)** — Creates no edge at all. The alignment point is invisible. Use sparingly and only for isolated, short content.

### Alignment Audit Procedure

To evaluate alignment in an existing design:

1. **Draw vertical lines** at every left edge, right edge, and center point. In Figma, use layout grids or guide lines.
2. **Count unique x-coordinates.** A well-aligned page has 2-4 distinct vertical axes. More than 6 indicates alignment chaos.
3. **Check for near-misses.** Elements that are 2-4px off from a shared alignment axis look worse than elements that are intentionally offset by 24px+. Near-misses read as errors. Either snap to the axis or move far enough away to look intentional.
4. **Verify text baseline alignment.** Mixed-size text on the same line (e.g., a 24px heading next to a 14px badge) should share a baseline, not a top edge.
5. **Test cross-section alignment.** Scroll through the page — do section headings share a left edge? Do content blocks maintain consistent indentation?

### Anti-Patterns

1. **Centered everything.** Centering all text and elements because it "looks balanced." In practice, center alignment creates no strong edge, making the layout feel floating and unanchored. Center-aligned body text is particularly harmful — the ragged left edge forces the eye to search for the start of each line. Apple centers hero headlines (2-3 words) but left-aligns all body text, feature descriptions, and navigation. Follow the same rule.

2. **Approximate alignment.** Elements that are 2-5px off from true alignment. This is worse than no alignment at all — the near-miss tells the viewer's subconscious that the designer was trying for alignment and failed. At 20px+ offset, it reads as an intentional design choice. At 3px offset, it reads as a bug. Snap to the grid or offset by a full grid unit (24px, 32px).

3. **Mixing alignment systems.** A left-aligned heading, center-aligned body paragraph, and right-aligned caption on the same page with no structural justification. Each alignment system creates different visual lines — mixing them randomly creates visual noise. Stripe uses left-edge alignment for 95% of its interface and reserves center alignment exclusively for pricing plan names and hero text.

4. **Bounding-box text alignment.** Aligning mixed-size text by the top of its CSS bounding box rather than by its baseline. A 32px heading and a 14px label aligned to their top edges will have misaligned baselines — the smaller text appears to float above the line. CSS `align-items: baseline` fixes this in flex containers. Verify visually with a horizontal guide line.

### Real-World Examples

**Apple Product Comparison Tables:**

- Every spec row is baseline-aligned across product columns
- Product names top-aligned at the same y-coordinate
- Prices right-aligned within their column (right alignment makes numerical comparison easy)
- The entire table uses exactly 4 alignment axes: row label left edge, and one center axis per product column
- Result: complex data feels organized and scannable

**Stripe's Pricing Page:**

- 3 cards side-by-side with cross-card alignment:
  - Plan name: centered within each card, y-aligned across cards
  - Price: centered, y-aligned across cards, right-aligned for numerical comparison
  - Feature list: left-aligned within each card, y-aligned per row across cards
  - CTA button: centered within card, y-aligned across cards
- Internal structure: all feature text shares a single left edge within each card (16px from card edge)
- The alignment creates an implicit grid that makes plan comparison effortless

**Material Design List Items (Spec):**

- Leading element: 16px from left edge
- Primary text: 56px from left edge (when leading is icon), 72px (when leading is avatar)
- Supporting text: same left edge as primary text
- Trailing element: 24px from right edge
- These 3-4 alignment rails are consistent across every list type (single-line, two-line, three-line)
- Result: lists feel uniform even when content varies dramatically

**Vercel Dashboard Navigation:**

- Sidebar items left-aligned at 16px from sidebar edge
- Active item highlighted with a 2px left border — visually reinforcing the alignment axis
- Nested items indented 16px (one grid unit), creating a secondary alignment axis
- Content area headings align to the content left edge, which is independent of the sidebar — two clean alignment systems

## Source

- Robin Williams, "The Non-Designer's Design Book" — alignment as one of the four fundamental design principles
- Josef Muller-Brockmann, "Grid Systems in Graphic Design" — systematic alignment through grid structures
- Apple Human Interface Guidelines — alignment specifications for iOS and macOS layouts
- Material Design 3 layout documentation — alignment rails and spacing specifications

## Process

1. **Choose** a primary alignment axis (left-edge for most layouts) and commit to it for all main content
2. **Limit** total alignment axes to 2-4 per page; audit by drawing vertical lines at every unique x-coordinate
3. **Verify** optical alignment for non-rectangular shapes and mixed-size text; adjust 1-3px as needed for visual correctness

## Harness Integration

This is a knowledge skill. When activated, its content is injected into the system prompt to guide element placement decisions. It does not execute code or modify files. Use alongside `design-grid-systems` for structural grid definition and `design-consistency` for system-wide alignment patterns.

## Success Criteria

- All body text and form elements share a common left-edge alignment axis
- Center alignment is used only for isolated, short content (3 lines or fewer)
- Total unique alignment axes per page is 4 or fewer
- No near-miss alignments (elements within 1-4px of an axis are snapped to it)
- Cross-card and cross-section elements share alignment axes for comparison
- Optical corrections are applied to non-rectangular shapes and mixed-size text
- Mixed-size text on the same line uses baseline alignment, not top-edge alignment
- Related cards or panels have their key comparison elements (titles, prices, CTAs) y-aligned
