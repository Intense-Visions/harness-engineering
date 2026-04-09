# Content Density

> Information density as a deliberate design variable — compact, comfortable, and spacious modes, matching density to user context, and the tradeoff between showing more and showing clearly

## When to Use

- Deciding how much information to display per screen or viewport for a new page
- Balancing data richness against readability in dashboards, tables, and data-heavy UIs
- Choosing spacing, font size, and layout density for different page types within the same product
- Implementing user-selectable density modes (compact/comfortable/spacious)
- Evaluating whether a page feels overwhelming (too dense) or wasteful (too sparse)

## Instructions

1. **Treat density as a design variable, not a bug.** Density is not "how much content you crammed in" — it is a deliberate decision about information-per-viewport. Different contexts demand different densities:
   - **High density (compact):** Expert tools, data tables, trading platforms, code editors. Users are trained, task-oriented, and want maximum information without scrolling. Bloomberg Terminal displays ~200 data points per screen. VS Code shows 40-60 lines of code with minimal chrome.
   - **Medium density (comfortable):** Productivity apps, dashboards, email clients, project management tools. Users need overview and detail, switching between scanning and reading. Stripe Dashboard shows 8-12 data rows per table with 40px row height and 16px padding.
   - **Low density (spacious):** Marketing pages, product showcases, onboarding flows, portfolios. Users are exploring, evaluating, or being persuaded. Apple's product pages present one idea per viewport with 60%+ whitespace.

   **Decision procedure:** Ask two questions: (1) How expert is the user? (2) How many items must be compared simultaneously? Expert users comparing many items = high density. Novice users evaluating one thing = low density.

2. **Apply Tufte's data-ink ratio.** Edward Tufte's principle: maximize the share of ink (pixels) used to present data; minimize the share used for non-data decoration. This is a precision tool for density optimization:
   - **Data-ink ratio = data ink / total ink.** A ratio of 0.8+ means most pixels carry information. A ratio below 0.3 means most pixels are borders, backgrounds, decoration, or chrome.
   - **High data-ink ratio (0.7-0.9):** Bloomberg Terminal, Google Sheets, Grafana dashboards. Almost no decorative elements — every pixel carries a data point, label, or axis line.
   - **Medium data-ink ratio (0.4-0.6):** Stripe Dashboard, GitHub issues list, Notion pages. Balanced chrome (navigation, headers, spacing) with data content.
   - **Low data-ink ratio (0.2-0.3):** Apple product pages, Vercel homepage, Stripe marketing. Most pixels are whitespace, images, and brand elements — the data (product specs, pricing) occupies a small fraction.

   **Practical application:** For any component, count the pixels devoted to actual information vs. everything else (borders, shadows, padding, backgrounds, icons). If a data table has 300px rows with 12px of actual text content, the density is wrong — either show more data or reduce the row height.

3. **Define three density modes with specific values.** When building a system that serves multiple contexts, define concrete parameters for each mode:

   | Parameter        | Compact | Comfortable | Spacious   |
   | ---------------- | ------- | ----------- | ---------- |
   | Table row height | 32-36px | 40-48px     | 52-64px    |
   | Card padding     | 8-12px  | 16-24px     | 24-32px    |
   | List item height | 28-32px | 36-44px     | 48-56px    |
   | Body font size   | 13-14px | 14-16px     | 16-18px    |
   | Line-height      | 1.3-1.4 | 1.5-1.6     | 1.6-1.8    |
   | Section padding  | 24-32px | 40-64px     | 80-128px   |
   | Items visible    | 15-25   | 8-15        | 3-8        |
   | Scroll required  | Rarely  | Sometimes   | Frequently |

   Gmail implements all three: Compact (row height 28px, ~25 emails visible), Comfortable (row height 40px, ~15 emails visible), Spacious (row height 52px, ~10 emails visible). The user chooses based on their workflow.

4. **Match density to page purpose.** Within a single product, different pages serve different purposes and should have different densities:
   - **Overview/dashboard pages:** Medium density. Show key metrics, summaries, and navigation to detail views. Stripe Dashboard: 4-6 metric cards at top (spacious), transaction table below (compact). This is progressive density — sparse overview leading to dense detail.
   - **Data/list pages:** High density. Tables, lists, search results. Users are scanning and comparing. GitHub issues list: 36px row height, 8px padding, no decorative elements.
   - **Detail/editing pages:** Medium density. Forms, settings, individual record views. Enough space for focus, enough density for context. Figma's properties panel: comfortable density with clear section grouping.
   - **Marketing/landing pages:** Low density. One idea per viewport, generous whitespace, large typography. Vercel homepage: each section is 400-600px tall with a single heading, subtext, and illustration.
   - **Onboarding flows:** Low density. Reduced cognitive load, focus on one action per step. Stripe's onboarding: one form per page, maximum 3-4 inputs, 64px+ spacing between fields.

5. **Implement progressive density.** Show less at first, reveal more on demand. This respects both the scanner (who needs overview) and the reader (who needs detail):
   - **Level 1 — Overview:** Show the minimum: title, status, key metric. 1-line per item. Airbnb search results: photo, title, price, rating visible in the card.
   - **Level 2 — Expanded:** Show supporting details on hover or click. Airbnb: clicking a listing reveals description, amenities, reviews, host info.
   - **Level 3 — Full detail:** Show everything, often on a dedicated page. Airbnb: the full listing page with photos, map, neighborhood guide, availability calendar.
   - **GitHub does this with issue lists:** List view shows title + labels + assignee (level 1). Clicking opens the full issue with description, comments, timeline (level 3). There is no level 2 — the jump is direct, appropriate for task-oriented expert users.

6. **Adjust density for responsive viewports.** Smaller screens require density recalibration:
   - **Mobile (compact viewport):** Increase item density slightly to compensate for reduced visible area. Show 6-8 items per screen instead of 4-5. But never reduce touch target size below 44x44px.
   - **Tablet:** Use comfortable density — the viewport is large enough for breathing room but small enough that spacious density wastes screen.
   - **Desktop:** Match the page purpose (see instruction 4). Large viewports can afford spacious density for marketing and comfortable density for tools.
   - **Stripe's approach:** Dashboard tables show 12 rows on desktop (comfortable 48px rows) and 8 rows on mobile (compact 40px rows with fewer columns visible). The density increases slightly on mobile to maximize the smaller viewport.

## Details

### The Density Spectrum in Practice

Real products mapped to the density spectrum:

| Product             | Density | Row/Item Height | Items per Screen | Data-Ink Ratio |
| ------------------- | ------- | --------------- | ---------------- | -------------- |
| Bloomberg Terminal  | Extreme | 18-22px         | 40-60            | 0.85+          |
| VS Code             | High    | 22px            | 40-55            | 0.75           |
| Gmail (compact)     | High    | 28px            | 20-25            | 0.60           |
| GitHub Issues       | Medium+ | 36px            | 12-18            | 0.55           |
| Stripe Dashboard    | Medium  | 48px            | 8-12             | 0.50           |
| Gmail (comfortable) | Medium  | 40px            | 12-15            | 0.50           |
| Notion              | Medium- | 44px            | 10-14            | 0.45           |
| Gmail (spacious)    | Low+    | 52px            | 8-10             | 0.40           |
| Vercel Homepage     | Low     | N/A (sections)  | 1-2 ideas        | 0.25           |
| Apple Product Page  | Minimal | N/A (sections)  | 1 idea           | 0.15           |

### Density Controls: Implementation Pattern

When offering user-selectable density, implement it as a single CSS custom property cascade:

- Define `--density-unit` as the base multiplier (compact: 4px, comfortable: 8px, spacious: 12px)
- All spacing derives from this unit: `padding: calc(var(--density-unit) * 2)`, `gap: var(--density-unit)`, `row-height: calc(var(--density-unit) * 5)`
- Switch density by changing one variable. Gmail, Google Drive, and Google Calendar all use this approach.
- Store the user's preference in localStorage or user settings — density preference is persistent and personal.

### Anti-Patterns

1. **One density for all contexts.** Using marketing-page spacing on a data table (massive padding, spacious rows) wastes the screen — a table that should show 20 rows shows 5, forcing excessive scrolling. Conversely, using data-table density on a landing page creates information overload where the user expects a calm, guided experience. Stripe uses spacious density on its marketing site and compact-to-comfortable density on its dashboard — same brand, different contexts.

2. **Density without hierarchy.** Cramming content into a small space without establishing visual priority creates a wall of text. High density does not mean "everything the same size and weight" — it means more information with clear hierarchy. Bloomberg Terminal is extremely dense but uses color coding, bold text, borders, and spatial grouping to maintain scannability. Without these hierarchy tools, density becomes chaos.

3. **User-hostile density.** Defaulting to compact density with no option to increase spacing. Not all users are power users — new users, users with visual impairments, and users on touch devices need more space. Gmail defaults to "comfortable" and offers compact/spacious as options. Material Design 3 specifies that compact density should never be the default — it is an opt-in for experienced users.

4. **Ignoring the scroll cost.** Spacious density means more scrolling. For data comparison tasks, scrolling is expensive — the user loses context of items above the fold. A data table with 64px rows showing 5 items per screen forces constant scrolling to compare 20 items. For this context, 32px rows showing 15+ items reduces scroll cost by 60% and improves comparison efficiency.

5. **Responsive density mismatch.** Keeping desktop density on mobile. A comfortable-density dashboard (48px rows) on a 667px-tall mobile screen shows only 8-9 rows after accounting for navigation and header. Switching to compact (36px rows) shows 12-13 rows — a 40% increase in visible data that materially improves the mobile experience.

### Real-World Examples

**Bloomberg Terminal (Expert Density):**

- Row height: 18-22px with 2px padding
- Font: 11-13px monospace, tight line-height (1.2)
- No decorative whitespace — every pixel is data, label, or separator
- Color-coded: green for positive, red for negative, blue for interactive
- Appropriate because users spend 8+ hours daily and have months of training
- Would be catastrophic for a consumer-facing product

**Stripe Dashboard (Balanced Density):**

- Table rows: 48px height with 16px horizontal padding
- Metric cards: 32px padding, 24px gap between cards
- Charts: 200-240px tall with 16px padding, labeled axes
- Body text: 14px at 1.5 line-height — readable without being spacious
- Navigation: 40px item height, 8px gap between items
- Progressive: overview page is medium density; clicking into a payment shows comfortable detail density

**Apple Product Pages (Minimal Density):**

- One idea per viewport (400-700px section height for a single heading + image)
- Body text: 21px at 1.47 line-height — larger than most web body text
- Section padding: 100-120px top and bottom
- Product comparison: spacious on desktop, transforms to a swipeable card carousel on mobile to maintain density appropriate to the interaction model
- Whitespace-to-content ratio: approximately 3:1

## Source

- Edward Tufte, "The Visual Display of Quantitative Information" — data-ink ratio and information density theory
- Material Design 3 density guidelines (m3.material.io/foundations/layout/density)
- Nielsen Norman Group, "Information Density in Design" — research on scanning patterns and density thresholds
- Stephen Few, "Information Dashboard Design" — dashboard-specific density principles

## Process

1. **Classify** the page purpose (data, overview, detail, marketing, onboarding) to determine the target density zone
2. **Define** concrete density parameters (row height, padding, font size, items per screen) from the density table
3. **Validate** by counting visible items per screen and measuring the data-ink ratio — adjust if the numbers fall outside the target zone

## Harness Integration

This is a knowledge skill. When activated, its content is injected into the system prompt to guide density decisions. It does not execute code or modify files. Use alongside `design-whitespace` for spacing scale definition, `design-readability` for typography density interaction, and `design-responsive-strategy` for viewport-specific density adaptation.

## Success Criteria

- Every page has a declared density mode (compact, comfortable, or spacious) matched to its purpose
- Density parameters (row height, padding, font size) are explicitly defined, not accidental
- Data-heavy pages have a data-ink ratio above 0.5; marketing pages can be below 0.3
- Progressive density is implemented: overview is sparser, detail is denser
- If user-selectable density is offered, comfortable is the default with compact as opt-in
- Responsive viewports adjust density appropriately (slightly denser on mobile to maximize limited viewport)
