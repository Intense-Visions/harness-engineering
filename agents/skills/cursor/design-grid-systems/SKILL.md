# Grid Systems

> Grid theory — column, modular, baseline, and compound grids, gutter rhythm, and breaking the grid intentionally for emphasis

## When to Use

- Laying out any page or screen with more than a single column of content
- Establishing consistent horizontal and vertical rhythm across a product
- Deciding column counts, gutter widths, and margin sizes for a new design system
- Evaluating whether an existing layout feels disorganized or inconsistent
- Planning responsive layouts that reflow predictably across breakpoints

## Instructions

1. **Choose a grid type based on content structure.** There are five fundamental grid types — each solves a different layout problem:
   - **Manuscript grid** — Single column, maximum reading width. Use for long-form articles, documentation, legal text. Apple's developer documentation uses a manuscript grid with a fixed sidebar: content column maxes out at ~680px to maintain a 60-75 character line length.
   - **Column grid** — 2-12 vertical columns with gutters. The workhorse of web layout. Use for dashboards, marketing pages, product listings. Material Design 3 specifies 4 columns on compact (<600dp), 8 on medium (600-839dp), and 12 on expanded (840dp+).
   - **Modular grid** — Column grid plus horizontal divisions creating a matrix of cells. Use for image galleries, card layouts, calendars. Pinterest's masonry layout is a modular grid variant where row heights flex.
   - **Baseline grid** — Invisible horizontal lines at regular intervals (typically 4px or 8px) that text and elements snap to. Ensures vertical rhythm. Stripe uses an 8px baseline: all padding, margin, and line-height values are multiples of 8 (8, 16, 24, 32, 48, 64).
   - **Compound grid** — Two or more grids overlaid. Use for complex editorial layouts where different content zones need different column counts. The New York Times web edition overlays a 4-column news grid on a 3-column sidebar grid.

2. **Set column count by content needs, not convention.** The 12-column grid is popular because 12 divides evenly by 2, 3, 4, and 6 — but it is not always correct:
   - **4 columns** — Mobile layouts, simple forms, single-focus pages
   - **6 columns** — Tablet layouts, medium-complexity dashboards
   - **8 columns** — Wide tablets, secondary desktop views
   - **12 columns** — Full desktop layouts with complex content arrangements
   - **16 columns** — Data-heavy enterprise applications (Bloomberg Terminal, Figma's property panels)

   Material Design's responsive grid uses 4/8/12 at breakpoints 600dp and 840dp. Stripe's marketing pages use 12 columns but constrain content to the inner 8, creating generous margins.

3. **Size gutters proportionally.** Gutters (the space between columns) control density and readability:
   - **16px gutters** — Compact layouts, data tables, dashboards (Material Design compact)
   - **20px gutters** — Standard density, most web applications
   - **24px gutters** — Comfortable layouts, content-rich pages (Airbnb uses 24px gutters in its card grid)
   - **32px gutters** — Spacious layouts, marketing pages, premium feel
   - **Rule of thumb:** Gutter width should be 1/3 to 1/2 of column width. If columns are 72px wide, gutters of 24-36px feel proportional.

4. **Set margins to frame the content.** Margins are the space between the grid and the viewport edge:
   - **Mobile:** 16-24px margins (Material Design uses 16px on compact)
   - **Tablet:** 24-32px margins
   - **Desktop:** 32-80px margins, or use a max-width container. Stripe caps content at ~1080px with auto margins, creating a centered content well on wide screens. Vercel uses ~1200px max-width.
   - **Proportional margins:** Some systems scale margins with viewport — 5% on mobile, 10% on desktop.

5. **Establish a baseline grid for vertical rhythm.** Every vertical measurement should be a multiple of a base unit:
   - **4px base** — Fine-grained control, good for dense UIs. Used by Spotify for tight spacing in playlist views.
   - **8px base** — The industry standard. Stripe, Material Design, and Shopify Polaris all use 8px. Spacing scale: 8, 16, 24, 32, 48, 64, 96, 128.
   - **Line-height alignment:** Body text line-height should be a multiple of the base unit. 16px text at 1.5 line-height = 24px = 3 x 8px base. This keeps text aligned to the grid.

6. **Break the grid intentionally for emphasis.** A grid break works because it violates an established pattern — the viewer notices the violation. This only works if the grid is otherwise consistent:
   - **Full-bleed images** — Extend past grid margins to the viewport edge. Vercel uses full-bleed dark sections to separate content zones on its homepage.
   - **Breakout elements** — Span more columns than surrounding content. A pull quote spanning 8 columns in a 6-column content area creates emphasis.
   - **Offset placement** — Shift an element off the grid by a deliberate amount. Apple's product pages offset hero images to create dynamic asymmetry.
   - **Rule:** Break one axis at a time. If an element breaks the column grid, it should still respect the baseline grid.

## Details

### Grid Anatomy Reference

| Component | Definition                       | Typical Values                |
| --------- | -------------------------------- | ----------------------------- |
| Column    | Vertical content container       | 60-120px width at desktop     |
| Gutter    | Space between columns            | 16-32px                       |
| Margin    | Space between grid and viewport  | 16-80px                       |
| Field     | Modular grid horizontal division | Height based on baseline unit |
| Flowline  | Horizontal alignment line        | Aligns to baseline grid       |

### Anti-Patterns

1. **Gutterless grids.** Columns with no space between them cause content collision. Text from one column bleeds visually into the next. Even a minimal 8px gutter provides enough separation. If you see content that feels "cramped," the first diagnosis is missing or insufficient gutters.

2. **Inconsistent margins.** Left margin at 20px, right at 32px — this is not a design system, it is a mistake. Margins must be symmetric (or intentionally asymmetric for a specific purpose like a fixed sidebar). Stripe's symmetric margins create a centered, balanced frame.

3. **The 12-column trap.** Defaulting to 12 columns for everything, even when the layout only needs 2-3 content zones. A simple landing page with a hero, features section, and footer needs at most a 3-4 column grid. Using 12 columns adds complexity with no benefit and makes responsive behavior harder to manage.

4. **Ignoring the baseline.** Vertical spacing that uses arbitrary values (13px, 27px, 41px) instead of baseline multiples. This destroys vertical rhythm — elements feel randomly placed even if they are technically aligned horizontally. Audit by checking: is every vertical spacing value a multiple of 4 or 8?

### Choosing a Grid: Decision Procedure

Use this flowchart to select the right grid type for any project:

1. Is the content primarily long-form text? **Manuscript grid** — single column, 60-75 characters wide.
2. Is the content a collection of similar items (cards, products, images)? **Modular grid** — equal cells with consistent aspect ratios.
3. Is the content mixed (text blocks, images, CTAs, data) with 2+ distinct zones? **Column grid** — assign different column spans to each zone.
4. Do you need multiple independent layout zones on the same page (e.g., editorial sidebar + news feed + ad rail)? **Compound grid** — overlay two column grids with different column counts.
5. In ALL cases, add a **baseline grid** underneath. The baseline grid is not an alternative to other types — it is a vertical rhythm layer that combines with any horizontal grid.

### Grid Math

For a 12-column grid inside a 1200px container with 24px gutters:

- Total gutter space: 11 gutters x 24px = 264px
- Remaining for columns: 1200px - 264px = 936px
- Column width: 936px / 12 = 78px
- A 4-column span: (4 x 78px) + (3 x 24px) = 384px
- A 6-column span: (6 x 78px) + (5 x 24px) = 588px

This math matters when setting max-widths, image sizes, and component widths. Hard-coding pixel values without understanding the underlying grid math leads to layouts that break at different container sizes.

### Real-World Examples

**Material Design 3 Responsive Grid:**

- Compact (0-599dp): 4 columns, 16px gutters, 16px margins
- Medium (600-839dp): 8 columns, 24px gutters, 24px margins
- Expanded (840dp+): 12 columns, 24px gutters, 24px margins
- Layout regions use column spans: navigation (3-4 cols), content (6-8 cols), supporting (2-3 cols)
- Body regions classified as: navigation, body (primary + secondary), supporting pane

**Stripe Marketing Pages:**

- 12-column grid at 1080px max-width with 20px gutters
- Content constrained to inner 8 columns (leaving 2 margin columns each side)
- Section padding: 96px (12 x 8px base unit) between major sections
- Full-bleed dark/light section alternation breaks the column grid while maintaining vertical rhythm
- Code examples use a 6-column span; descriptive text uses the adjacent 4-column span

**Airbnb Card Grid:**

- Responsive card count: 1 card (<550px), 2 cards (550-949px), 3 cards (950-1127px), 4 cards (1128px+)
- Consistent 24px gutters between cards at all breakpoints
- Cards maintain a fixed aspect ratio; only count changes across breakpoints
- Search results page: map occupies 5 columns of a 12-column grid; listings occupy 7

**Apple Developer Documentation:**

- Manuscript grid with 260px fixed sidebar on desktop
- Content column capped at ~680px for optimal line length
- Sidebar collapses to hamburger menu below 1024px — a responsive grid adaptation
- 4px baseline grid for tight vertical alignment of code blocks and body text

## Source

- Josef Muller-Brockmann, "Grid Systems in Graphic Design" — the foundational text on systematic grid use
- Massimo Vignelli, "The Vignelli Canon" — practical grid application in identity and editorial design
- Material Design 3 layout documentation (m3.material.io/foundations/layout)
- Karl Gerstner, "Designing Programmes" — compound grid theory and systematic design

## Process

1. **Identify** content types and their structural needs (text columns, card grids, data tables)
2. **Select** grid type and parameters (column count, gutter width, baseline unit, margins)
3. **Validate** by checking that all spacing values are multiples of the base unit and that the grid supports all required layout variations

## Harness Integration

This is a knowledge skill. When activated, its content is injected into the system prompt to guide layout decisions. It does not execute code or modify files. Use alongside `design-alignment` for element placement, `design-whitespace` for spacing decisions, and `design-responsive-strategy` for breakpoint behavior.

## Success Criteria

- Layout uses a named grid type (column, modular, baseline, compound) with explicit parameters
- All gutter and margin values are consistent and proportional to column width
- Vertical spacing uses multiples of a declared base unit (4px or 8px)
- Grid breaks are intentional and limited to 1-2 per page for emphasis
- Responsive behavior changes column count at defined breakpoints, not arbitrary widths
