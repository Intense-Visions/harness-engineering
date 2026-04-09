# Responsive Strategy

> Responsive as a design decision — content-first breakpoints, progressive disclosure, and treating every viewport as a first-class design target

## When to Use

- Planning a new layout that must work from 320px mobile to 2560px ultrawide
- Deciding where to set breakpoints and what changes at each one
- Evaluating whether a responsive implementation degrades gracefully or just shrinks
- Building a design system that needs consistent responsive behavior across components
- Deciding what content to show, hide, or reorganize at different viewport sizes

## Instructions

1. **Set breakpoints where the content breaks, not at device widths.** Device-based breakpoints (320px for iPhone, 768px for iPad, 1024px for laptop) create designs that work on today's devices and break on tomorrow's. Content-first breakpoints are future-proof:
   - **Procedure:** Start with your content at the narrowest viewport (320px). Slowly widen the browser. The moment the layout looks awkward — too much whitespace, lines too long, elements too spread out — that is a breakpoint. Set it at that width.
   - **Typical results:** Most designs naturally break at 3-5 points, usually around 480-560px (single column exhausted), 720-840px (two-column becomes viable), and 1080-1280px (full desktop layout possible).
   - **Material Design 3 breakpoints:** Compact (0-599dp), Medium (600-839dp), Expanded (840-1199dp), Large (1200-1599dp), Extra-large (1600dp+). These are content-driven ranges, not device names.
   - **Stripe's documentation:** Sidebar appears at 768px — not because "that is tablet width" but because below 768px the content area would be too narrow for code examples alongside a sidebar.

2. **Design mobile-first as a constraint exercise.** Mobile-first is not about mobile users — it is about forcing prioritization:
   - **At 320px, you can fit one idea.** This forces you to decide: what is the single most important thing on this screen? That answer should inform the desktop layout too — the most important thing on mobile should be the most prominent thing on desktop.
   - **Content priority list:** Before designing any viewport, write a ranked list of every content element on the page. This list is your source of truth for all viewport sizes. Mobile shows items 1-5 prominently. Tablet adds items 6-10. Desktop shows all 15 items but still prioritizes 1-5.
   - **Airbnb's search results:** Mobile shows listing photo, price, rating, and title (the 4 most important data points). Tablet adds the map view as a side panel. Desktop adds filters, expanded reviews, and host information. The core 4 data points are prominent at every size.

3. **Apply the five responsive patterns.** Every responsive layout change falls into one of these patterns:
   - **Reflow:** Multi-column becomes single-column. The most common pattern. A 3-card row becomes a single-card stack. Airbnb's listing grid: 4 columns at 1128px+, 3 at 950px, 2 at 550px, 1 below 550px.
   - **Stack:** Side-by-side elements become vertically stacked. Text + image becomes image on top, text below. Stripe's feature sections: image-left/text-right at desktop becomes image-top/text-bottom on mobile.
   - **Reveal/Hide:** Content appears or disappears at breakpoints. Navigation: full horizontal nav at desktop, hamburger menu at mobile. Filters: sidebar filters at desktop, modal/drawer at mobile. Vercel's dashboard: deployment details visible at desktop, tap-to-expand on mobile.
   - **Off-canvas:** Content slides in from the edge on demand. Sidebars, navigation drawers, filter panels. Material Design: navigation rail (visible icon bar) at medium, full drawer (off-canvas) at compact.
   - **Resize:** Elements scale proportionally. Hero images, videos, embedded content. Percentage widths, max-width constraints, and aspect-ratio preservation.

4. **Define what changes and what stays constant across breakpoints.** Not everything should respond:

   **Changes across breakpoints:**
   - Column count (4 → 8 → 12)
   - Navigation pattern (bottom tab bar → side rail → expanded sidebar)
   - Content visibility (progressive disclosure — more detail at larger sizes)
   - Macro whitespace (section padding scales: 48px mobile → 64px tablet → 96px desktop)
   - Component layout (horizontal → vertical stacking)

   **Stays constant across breakpoints:**
   - Brand identity (colors, typography family, logo)
   - Content hierarchy (the most important element stays most important)
   - Core functionality (a mobile user can do everything a desktop user can)
   - Micro whitespace (button padding, icon gaps, input height)
   - Touch targets (minimum 44x44px/48x48dp on all devices — this is not just a mobile concern; tablet and touch-laptop users exist at every viewport width)

5. **Avoid layout cliffs.** A layout cliff is a dramatic, jarring change at a single pixel boundary:
   - **Bad:** At 767px, full sidebar visible. At 768px, sidebar gone, content full-width. The user resizing their browser sees a sudden, disorienting jump.
   - **Better:** Sidebar progressively narrows from 280px to 200px between 900-768px, then collapses to icons-only at 768px, then moves off-canvas at 600px. Three gradual transitions instead of one cliff.
   - **Stripe's approach:** Between breakpoints, elements use fluid sizing (percentage widths, clamp(), flex-grow). The layout continuously adjusts, with breakpoints adding or removing elements rather than rearranging everything.
   - **CSS technique:** Use `clamp(min, preferred, max)` for fluid values. Example: `padding: clamp(48px, 8vw, 96px)` provides smooth spacing adaptation without breakpoint jumps.

6. **Test at the edges, not the centers.** Common mistake: designing for 375px (iPhone), 768px (iPad), 1440px (laptop). These are the centers of each range. Problems appear at the edges:
   - **Critical test widths:** 320px (smallest viable mobile), 480px (large phone / small tablet boundary), 600px (Material compact/medium boundary), 768px (common tablet), 1024px (tablet/desktop boundary), 1280px (common laptop), 1920px (common desktop), 2560px (ultrawide).
   - **The 1024px zone:** Many designs break here because it is too wide for a mobile layout but too narrow for a full desktop layout with sidebar. This is where a 2-column layout without sidebar or a collapsible sidebar earns its keep.
   - **The 320px constraint:** Samsung Galaxy Fold and older Android devices go as narrow as 280-320px. If your layout breaks below 360px, 5-8% of Android users have a degraded experience.

## Details

### Content Priority Matrix

Before responsive design decisions, fill out this matrix for every page:

| Element          | Priority | Mobile           | Tablet           | Desktop          |
| ---------------- | -------- | ---------------- | ---------------- | ---------------- |
| Hero headline    | 1        | Full-width, 32px | Full-width, 40px | Contained, 56px  |
| Primary CTA      | 2        | Sticky bottom    | Below hero       | Inline with hero |
| Feature overview | 3        | Stacked cards    | 2-column grid    | 3-column grid    |
| Social proof     | 4        | Hidden (tap)     | Below fold       | Sidebar or below |
| Secondary nav    | 5        | Hamburger        | Icon rail        | Full sidebar     |
| Footer links     | 6        | Accordion        | 2-column         | 4-column         |

This matrix replaces guesswork. Every responsive decision traces back to a prioritized content need.

### Responsive vs. Adaptive

- **Responsive:** Fluid layouts that continuously adapt. Uses percentages, flex, grid, clamp(). One codebase, infinite viewport sizes. The standard approach for most web projects.
- **Adaptive:** Distinct fixed layouts served at specific breakpoints. Uses media queries to swap between complete layout variants. Better for highly controlled experiences (email templates, app-like interfaces).
- **Hybrid (most common in practice):** Fluid within ranges, with structural changes at breakpoints. Stripe uses this: content width is fluid between 768px and 1200px, but the layout structure (sidebar vs. no sidebar) changes at 768px.

### Breakpoint Naming Convention

Avoid device names. Use size categories:

| Name     | Range       | Column Count | Use Case                            |
| -------- | ----------- | ------------ | ----------------------------------- |
| compact  | 0-599px     | 4            | Single-column, stacked layout       |
| medium   | 600-839px   | 8            | Two-column, side panels possible    |
| expanded | 840-1199px  | 12           | Full layout, sidebars, multi-column |
| large    | 1200-1599px | 12           | Generous spacing, wider content     |
| xlarge   | 1600px+     | 12           | Max-width container, ultrawide      |

Material Design 3 uses this exact naming. Tailwind uses sm/md/lg/xl/2xl at 640/768/1024/1280/1536px.

### Anti-Patterns

1. **Device-width breakpoints.** Designing for "iPhone 14" (390px) and "iPad" (768px) instead of for content needs. New devices launch every year at new widths. Content-first breakpoints (set where the layout breaks, not where a device is) remain stable across device generations. Material Design has used the same breakpoint ranges since 2018 despite dozens of new Android devices.

2. **Hiding critical content on mobile.** Removing features, navigation items, or information on mobile because "the screen is too small." Mobile users have the same goals as desktop users — often with more urgency (on the go, one-handed). Airbnb does not hide any booking functionality on mobile; it reorganizes it. The map, filters, reviews, and host info are all accessible — just through different interaction patterns (bottom sheet, drawer, expandable sections).

3. **Responsive as afterthought.** Designing a complete desktop layout, then "making it responsive" by squeezing everything into a narrower column. This produces layouts where mobile feels like a broken desktop rather than a designed experience. Symptom: horizontal scrolling, text running off-screen, touch targets too small, images larger than the viewport. Fix: design mobile first, then enhance for desktop.

4. **Breakpoint cliffs.** A single media query that changes 5+ properties at once, creating a jarring visual jump. At 767px the page looks one way; at 768px it looks completely different. Users on resizable windows (split-screen, desktop browsers) experience this as broken behavior. Fix: distribute changes across multiple breakpoints, use fluid values between breakpoints, and animate transitions.

5. **Ignoring touch at non-mobile sizes.** Assuming that large viewports mean mouse input. iPad Pro is 1024px wide — a "desktop" width with touch input. Surface tablets, touch laptops, and Chromebooks exist at every viewport size. Minimum touch target (44x44px / 48x48dp) applies to ALL viewports, not just mobile.

### Real-World Examples

**Stripe Documentation:**

- Compact (<768px): Single-column, hamburger navigation, code examples full-width
- Medium (768-1199px): Sidebar appears (240px), content area takes remaining width
- Expanded (1200px+): Sidebar + content + right-side "on this page" navigation
- Breakpoint at 768px chosen because code examples need ~520px minimum to avoid horizontal scroll, and 768px - 240px sidebar = 528px content width

**Material Design 3 Responsive Scaffolding:**

- Compact: Bottom navigation bar (5 items max), no sidebar, single-column body
- Medium: Navigation rail (icons only, 80dp wide), body content fills remaining width
- Expanded: Navigation drawer (360dp wide, full labels), body with 2+ columns
- Each transition point is designed, not just reflowed — the navigation fundamentally changes interaction model

**Apple Product Pages:**

- Hero: Full-bleed image at all sizes, text overlay scales from 32px to 72px via clamp()
- Feature grid: 1 column at compact, 2 columns at medium, 3 columns at expanded
- Comparison table: Full table at desktop, swipeable card carousel on mobile
- The comparison table is not "hidden on mobile" — it is redesigned as a different component that serves the same purpose

## Source

- Ethan Marcotte, "Responsive Web Design" — the foundational text on responsive methodology
- Luke Wroblewski, "Mobile First" — content prioritization through mobile-first design
- Material Design 3 responsive layout guidelines (m3.material.io/foundations/layout)
- Brad Frost, "Atomic Design" — component-level responsive patterns

## Process

1. **Prioritize** content with a numbered list before opening any design tool — mobile forces the ranking
2. **Set** breakpoints by widening from 320px until the layout breaks, placing breakpoints at the break points
3. **Validate** by testing at range edges (320px, 480px, 768px, 1024px, 1920px) and on at least one touch device at a "desktop" width

## Harness Integration

This is a knowledge skill. When activated, its content is injected into the system prompt to guide responsive layout decisions. It does not execute code or modify files. Use alongside `design-grid-systems` for column count at each breakpoint, `design-responsive-type` for fluid typography, and `design-content-density` for density adjustments across viewports.

## Success Criteria

- Breakpoints are set where content breaks, not at device widths
- A content priority list exists and is reflected at all viewport sizes
- Every responsive change maps to one of the five patterns (reflow, stack, reveal/hide, off-canvas, resize)
- No content is hidden on mobile without an alternative access path
- Touch targets meet 44x44px minimum at all viewport sizes, not just mobile
- Layout transitions are gradual (no single breakpoint changes 5+ properties)
- The design is tested at edge widths (320px, 1024px, 2560px), not just center widths
