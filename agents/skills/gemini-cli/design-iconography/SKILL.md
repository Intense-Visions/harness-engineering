# Iconography

> Icon design principles — optical sizing, stroke consistency, pixel grid alignment, metaphor clarity, icon families, filled vs outlined states, and icon as a systematic visual language

## When to Use

- Building or selecting an icon set for a product or design system
- Evaluating whether icons are optically consistent across sizes and weights
- Choosing between filled, outlined, or two-tone icon variants for different contexts
- Aligning icons to a pixel grid to prevent subpixel rendering blur
- Designing custom icons that need to feel native to an existing icon family
- Selecting icon metaphors that communicate function without ambiguity
- Implementing icon size scales that maintain legibility from 12px to 48px
- Auditing an icon set for visual weight consistency across different shapes

## Instructions

1. **Design to the pixel grid, not the mathematical center.** Every icon canvas has a pixel grid — typically 16x16, 20x20, or 24x24. Align all straight edges to full pixel boundaries. Diagonal and curved lines are exempt from grid snapping but should start and end on pixel intersections. Decision procedure: at your target render size, export the icon at 1x and zoom to 800%. If any horizontal or vertical edge falls between pixels, the renderer will anti-alias it — producing a blurry 2px line where you intended a crisp 1px line. Apple's SF Symbols enforce a 1px grid at each of 3 scales (small, medium, large) to guarantee sharpness on retina and non-retina displays alike.

2. **Establish a stroke weight system and never deviate.** Stroke weight is the single most visible consistency signal in an icon family. Material Symbols uses a stroke weight axis from 100 to 700 in 100-unit increments. For a typical product icon set at 24px canvas, common stroke weights are:
   - **1.5px** — light, editorial, minimal (Vercel, Linear)
   - **2px** — standard, balanced (Feather Icons, Lucide)
   - **2.5px** — medium, slightly bold (Heroicons outline)
   - **3px** — bold, high-contrast, touch-friendly (Material Symbols at weight 400)

   Decision procedure: pick ONE stroke weight for your entire icon set. If you need weight variation, define explicit weight tiers (light/regular/bold) with specific pixel values. Never approximate — a 1.75px stroke next to a 2px stroke is visibly inconsistent.

3. **Apply optical sizing, not linear scaling.** A 16px icon is not a scaled-down 24px icon. At smaller sizes, details collapse: 1px gaps disappear, thin strokes become invisible, interior detail becomes noise. Optical sizing means redesigning the icon for each size tier. Apple's SF Symbols provide 3 optical scales:
   - **Small (≤20pt):** Increased stroke weight, simplified interior detail, larger counters
   - **Medium (20-26pt):** Standard proportions
   - **Large (≥26pt):** Finer detail, thinner relative stroke weight, decorative elements preserved

   GitHub's Octicons ship two discrete sizes — 16px and 24px — with different path geometry for each. The 16px `repo` icon has 2 simplified elements; the 24px version has 4 detailed elements. Concrete rule: if your icon set supports sizes below 20px, you need a separate optical variant with at minimum 0.5px thicker strokes and 30-50% fewer interior details.

4. **Choose icon metaphors that survive the 5-second test.** Show the icon to someone unfamiliar with your product for 5 seconds. If they cannot identify the referent or action, the metaphor is too abstract. Proven metaphors:
   - **Gear** = settings (near-universal, used by iOS, Android, Windows, web)
   - **Magnifying glass** = search (universal)
   - **House** = home (universal)
   - **Pencil** = edit (universal, but "pen" variant can read as "draw")
   - **Trash can** = delete (universal in Western UI; less clear in some Asian markets)
   - **Hamburger (three lines)** = menu (learned convention, not intuitive — fails with older or non-tech-savvy users)
   - **Floppy disk** = save (skeuomorphic holdover — still recognized but increasingly opaque to younger users)

   When no established metaphor exists, prefer a concrete noun over an abstract concept. "Cloud with arrow" for upload is more scannable than an abstract upward-pointing triangle.

5. **Define the filled vs. outlined decision systematically.** Do not mix arbitrarily. The two styles carry different visual weight and semantic implications:
   - **Outlined icons** — lighter visual weight, recede in the interface, better for navigation bars, toolbars, and inactive states. They read well at medium-to-large sizes (20px+). At small sizes (below 16px), outlines can become indistinct.
   - **Filled icons** — heavier visual weight, advance in the visual hierarchy, better for active/selected states, CTAs, and small sizes where outline detail would collapse. They carry more brand personality.

   Google's Material Symbols uses filled for selected/active states and outlined for unselected/inactive states — a toggle pattern. iOS Tab Bar follows the same convention: outlined icons for unselected tabs, filled for the active tab. Decision procedure: use outlined as the default state. Switch to filled for selected, active, or emphasized states. Never use filled and outlined versions of the same icon at the same hierarchy level — the weight difference creates unintended emphasis.

6. **Maintain consistent optical weight across shape families.** A circle, a square, and a triangle at the same bounding box size do not appear the same size. Circles and triangles look smaller than squares of identical dimensions — this is a well-documented optical illusion. Compensate:
   - **Circles** should extend ~2% beyond the square icon's safe zone
   - **Triangles** should extend ~4-6% beyond the safe zone vertically (apex extends past the grid)
   - **Tall, narrow shapes** should extend ~2% horizontally past the safe zone

   Material Design's icon grid includes a "trim area" (the full canvas) and a "live area" (where content sits, slightly inset). The live area is 20x20 inside a 24x24 canvas. But circular icons like the `info` circle occupy 22x22 — exceeding the live area — to optically match the weight of square icons that sit within 20x20.

7. **Build icon families, not icon collections.** A family shares DNA: consistent stroke weight, consistent corner radius, consistent level of detail, consistent metaphor style (outline realism vs. geometric abstraction). When adding a new icon to an existing family, match these attributes before matching the concept. A geometrically perfect new icon that has 1px rounded corners in a set using 2px rounded corners will feel foreign regardless of how well-drawn it is. Airbnb's icon system enforces: 2px stroke, 2px corner radius, 24px canvas, no fills, single-color rendering — every icon must pass all five constraints to enter the family.

## Details

### Keyline Shapes and Alignment Grids

Professional icon sets define keyline shapes — canonical bounding geometries that icons are designed around. Material Design defines four keylines for its 24px grid:

| Keyline Shape        | Dimensions | Use Case                                  |
| -------------------- | ---------- | ----------------------------------------- |
| Square               | 18x18      | Rectangular content (document, screen)    |
| Circle               | 20x20      | Circular content (avatar, globe, record)  |
| Vertical rectangle   | 16x20      | Portrait content (person, bottle, phone)  |
| Horizontal rectangle | 20x16      | Landscape content (laptop, car, envelope) |

All four keylines produce optically equivalent weight within the 24px canvas. When designing a new icon, first determine which keyline shape it falls into, then draw within that keyline. This prevents the common failure of icons that are technically the same canvas size but visually different weights.

### Icon as Interaction Affordance

Icons in interactive contexts need touch/click targets that exceed their visual bounds. WCAG 2.5.8 requires a minimum 24x24 CSS pixel target size. Apple's HIG recommends 44x44pt minimum. This means:

- A 16px visual icon needs at minimum 24px of tappable area (4px padding per side)
- A 24px visual icon should have 44px tappable area on mobile (10px padding per side)
- Interactive icon buttons should declare `min-width` and `min-height` on the button element, not on the icon SVG — the icon stays visually small while the hit target stays accessible

### Stroke Caps and Joins

Seemingly minor stroke attributes create visible inconsistency at scale:

- **Round caps** — strokes end with a semicircle. Adds ~1px visual length to each stroke terminus. Feels softer. Used by Feather Icons, Lucide, and most modern sets.
- **Square/butt caps** — strokes end flat. Feels more precise and technical. Used in some engineering and drafting-style icon sets.
- **Round joins** — corners are radiused. Feels friendly and organic. Matches round caps.
- **Miter joins** — corners are sharp. Feels precise and geometric. Can produce spiky artifacts at acute angles.

Decision procedure: round caps + round joins for consumer products (friendly, approachable). Square caps + miter joins for technical/professional products. Never mix cap styles within an icon family.

### Anti-Patterns

1. **Stroke Weight Drift.** Mixing 1.5px, 2px, and 2.25px strokes within the same icon set because individual designers "eyeballed" the weight. At UI scale, even 0.25px differences are visible and make the set feel unpolished. Fix: define an exact stroke weight in the design system tokens, enforce it in the SVG export pipeline, and lint exported SVGs for stroke-width consistency. Lucide runs automated CI checks that reject contributions with non-conforming stroke weights.

2. **Detail Overload at Small Sizes.** Designing an icon at 48px with fine interior detail (hatching, small counters, thin negative space) and rendering it at 16px where the detail becomes muddy noise. Fix: follow Apple's optical sizing model — create separate path geometry for each size tier. At minimum, remove interior detail and increase stroke weight for any icon rendered below 20px.

3. **Metaphor Ambiguity.** Using a "star" icon for both "favorites" and "ratings" in the same product. Or using a "bell" for both "notifications" and "alarms." When the same visual metaphor maps to two different functions, users cannot build reliable mental models. Fix: one metaphor, one function per product. If you need both favorites and ratings, use a star for one and a heart or bookmark for the other. Document the metaphor map in your design system.

4. **Pixel Grid Misalignment.** Designing icons in Figma at 1x without checking the pixel grid, resulting in paths that fall on half-pixel boundaries. The icon looks crisp in Figma's vector preview but renders blurry in the browser at 1x resolution. Fix: in Figma, enable "Snap to pixel grid" and verify at 1x export. In SVG code, audit path coordinates — values like `x="3.5"` on horizontal edges indicate half-pixel alignment. Round to integers for horizontal/vertical edges.

5. **Filled/Outlined Inconsistency.** Using filled icons for some navigation items and outlined for others at the same hierarchy level, creating unintended visual weight differences that imply hierarchy where none exists. Fix: apply the Material Symbols convention — all icons at the same level use the same variant. Reserve the alternate variant for state changes (active/inactive).

### Real-World Examples

**Apple SF Symbols — The Gold Standard for Optical Sizing.** SF Symbols offers over 5,000 icons with 9 weights (ultralight through black) and 3 scales (small, medium, large), producing 27 variants per symbol. Each variant has unique path geometry — the small-scale, ultralight `gear` has thicker relative strokes and fewer teeth than the large-scale, bold `gear`. The system also supports variable color (progressive fill based on a 0-1 value) and automatic alignment with San Francisco text at any size. SF Symbols enforces a 1px stroke grid at each scale, ensuring pixel-perfect rendering on all Apple displays. Key lesson: optical sizing is not optional — it is the difference between a professional and an amateur icon system.

**GitHub Octicons — Two-Size Discrete System.** Octicons ships exactly two sizes: 16px and 24px. Each size has independent path geometry. The 16px `alert` triangle has 2px strokes and minimal interior detail (just the exclamation mark). The 24px `alert` has 1.5px relative strokes and additional interior structure. GitHub chose discrete sizes over continuous scaling because their UI uses only these two sizes — a pragmatic constraint that eliminates optical sizing edge cases. Key lesson: you do not need a continuous size spectrum. Identify your actual render sizes and optimize for those.

**Material Symbols — Weight and Fill as Axes.** Material Symbols treats stroke weight (100-700), fill (0 or 1), and optical size (20, 24, 40, 48) as independent variable font axes. A single icon file can render at any combination. At weight 400, optical size 24, fill 0: the icon shows 2px outlined strokes. At weight 700, optical size 48, fill 1: the same icon renders as a bold filled shape. This approach eliminates the need for separate icon files per variant — the browser interpolates the correct paths via variable font technology. Key lesson: if your icon system must support many contexts (navigation, content, headers, mobile, desktop), variable axes dramatically reduce maintenance cost.

**Vercel — Minimalist Monochrome.** Vercel's icon set uses 1.5px strokes, no fills, single color (foreground only), and a deliberately constrained vocabulary (~60 icons). Every icon is reducible to 2-3 strokes — the `deploy` icon is a single upward arrow with a horizontal base line. This extreme minimalism aligns with Vercel's brand: developer-focused, no-nonsense, maximally functional. Key lesson: icon family personality comes from constraints. Fewer strokes, fewer icons, tighter rules = stronger visual identity.

**Airbnb Icons — Hospitality Through Roundness.** Airbnb's icon system uses 2px strokes with 2px corner radius — every corner is rounded, every terminal is rounded. This produces icons that feel warm and approachable, matching the "belong anywhere" brand. The roundness is a deliberate departure from the sharp geometric style of tech-company icon sets. Even functional icons like "filter" and "map pin" carry the rounded DNA. Key lesson: corner radius is a brand signal. Sharp corners = precision, authority. Rounded corners = warmth, approachability. The choice must be consistent and intentional.

### Icon Accessibility

Icons carry interaction and meaning, making accessibility non-negotiable:

- **Always pair icons with text labels in navigation.** Unlabeled icon-only navigation (a common pattern in mobile tab bars and sidebar menus) fails for users who cannot map abstract symbols to functions. Nielsen Norman Group research shows that icon + text labels increase discoverability by 88% compared to icon-only interfaces. If space constraints force icon-only display, provide a tooltip on hover/long-press that matches the text label exactly.
- **Use `aria-label` or `aria-labelledby` on interactive icon buttons.** A button containing only an SVG icon has no accessible name unless explicitly provided. `<button aria-label="Close dialog"><svg>...</svg></button>` is the minimum. Never rely on the icon's visual metaphor for screen reader users.
- **Decorative icons get `aria-hidden="true"`.** An icon next to a text label that repeats the icon's meaning (a trash can icon next to "Delete") should be hidden from screen readers to avoid redundancy: `<svg aria-hidden="true">`.
- **Ensure 3:1 contrast ratio for non-text UI.** WCAG 2.2 Success Criterion 1.4.11 requires icons used as interactive affordances to meet 3:1 contrast against their background. A light gray icon (`#9CA3AF`, ~4.5 relative luminance) on a white background (`#FFFFFF`, 21 relative luminance) has a contrast ratio of 2.8:1 — failing the requirement. Use `#6B7280` (4.6:1) or darker.

### SVG Optimization and Delivery

Icon delivery affects both rendering quality and performance:

- **Use inline SVG for interactive icons** that need CSS styling (hover color changes, transitions). Inline SVG allows `currentColor` inheritance and CSS custom property theming. An icon that changes color on hover needs to be inline, not an `<img>` reference.
- **Use SVG sprite sheets for large icon sets.** A product using 60+ icons should bundle them into a single `<svg>` sprite with `<symbol>` elements, referenced via `<use href="#icon-name">`. This reduces HTTP requests to 1 and enables browser caching of the entire set.
- **Optimize path data.** Run all production SVGs through SVGO with `removeViewBox: false` (viewBox is needed for responsive scaling) and `removeDimensions: true` (use CSS for sizing). A typical icon SVG optimizes from 800 bytes to 200 bytes — a 75% reduction.
- **Standardize viewBox.** Every icon in a family must use the same `viewBox` — typically `"0 0 24 24"` for a 24px grid. Inconsistent viewBoxes cause icons to render at different effective sizes even when the CSS `width` and `height` are identical.

### Icon Naming Conventions

A systematic naming convention prevents icon confusion at scale:

- **Format:** `{category}-{object}-{variant}`. Example: `nav-home-filled`, `action-delete-outlined`, `status-check-circle`.
- **Categories:** `nav` (navigation), `action` (user actions), `status` (state indicators), `content` (content type indicators), `social` (social platform logos).
- **Variants:** `filled`, `outlined`, `two-tone`, `sharp`. Never use ambiguous suffixes like `v2` or `alt`.
- **Avoid synonym collision:** If the set has both `close` (X mark) and `cancel` (circle X), the names must clearly distinguish them: `action-close` vs. `action-cancel-circle`.

## Source

- Apple Human Interface Guidelines — SF Symbols (2024)
- Material Design 3 — Icon Design Principles (2024)
- GitHub Octicons — Design Guidelines
- Feather Icons — Design Principles
- Airbnb Design — Iconography Standards
- WCAG 2.2 — Non-text Contrast (1.4.11), Name, Role, Value (4.1.2)

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
