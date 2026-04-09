# Color Accessibility

> Color independence — conveying information without relying on color alone, building colorblind-safe palettes, and ensuring perceptual uniformity across all vision types

## When to Use

- Designing status indicators, badges, or alerts that use color to communicate state
- Building data visualizations (charts, graphs, maps) with color-coded series
- Choosing a palette that must work for colorblind users (8% of males, 0.5% of females)
- Auditing an existing design for WCAG 2.1 SC 1.4.1 (Use of Color) compliance
- Selecting safe color pairs for UI elements that need to be distinguishable
- Creating form validation states that are perceivable by all users
- Designing interactive states (hover, focus, active, selected) that do not rely solely on color change
- Building accessible data tables, calendars, or scheduling interfaces with color-coded categories

## Instructions

1. **Understand the types and prevalence of color vision deficiency (CVD).** Do not design for "colorblindness" as a monolith — there are distinct types with different impact:

   | Type                           | Affected Cones  | Prevalence (Male/Female) | Colors Confused                     | Safe Alternatives          |
   | ------------------------------ | --------------- | ------------------------ | ----------------------------------- | -------------------------- |
   | **Deuteranopia** (green-blind) | M-cones (green) | 6% / 0.4%                | Red-green, brown-green, teal-gray   | Blue-orange, blue-yellow   |
   | **Protanopia** (red-blind)     | L-cones (red)   | 1% / 0.01%               | Red-green, red-brown, purple-blue   | Blue-orange, blue-yellow   |
   | **Tritanopia** (blue-blind)    | S-cones (blue)  | 0.003% / 0.003%          | Blue-yellow, purple-red, green-cyan | Red-blue, red-green        |
   | **Achromatopsia** (total)      | All cones       | 0.003% / 0.003%          | All hues — sees only lightness      | Lightness differences only |

   Key insight: red-green confusion affects approximately 8% of males. This means in a room of 25 people, 1-2 will not be able to distinguish your red error state from your green success state by color alone. This is not an edge case — it is a significant portion of your user base.

2. **Never use color as the sole means of conveying information.** This is WCAG 2.1 SC 1.4.1 — a Level A requirement (the most basic tier). Every piece of information conveyed by color must also be conveyed by at least one additional channel:

   | Color-Only (Fails)                         | Color + Redundant Encoding (Passes)                          |
   | ------------------------------------------ | ------------------------------------------------------------ |
   | Red/green dot for online/offline           | Dot + "Online"/"Offline" text label                          |
   | Colored bar chart series                   | Color + pattern (stripes, dots, crosshatch) + legend         |
   | Red border on invalid input                | Red border + error icon + error message text                 |
   | Green/red text for pass/fail               | Color + checkmark/X icon + "Pass"/"Fail" label               |
   | Calendar events coded by color             | Color + category letter/icon + tooltip                       |
   | Link text distinguished only by blue color | Blue color + underline (or 3:1 contrast vs surrounding text) |

3. **Choose colorblind-safe color pairs.** When two elements must be distinguishable by color (in addition to a redundant encoding), select pairs that survive all common CVD types:

   **Safe universal pairs (distinguishable under deuteranopia, protanopia, and tritanopia):**
   - Blue (`#2563EB`) and orange (`#EA580C`) — the most reliable safe pair
   - Blue (`#2563EB`) and red (`#DC2626`) — safe for red-green CVD (the most common)
   - Dark blue (`#1E3A5F`) and yellow (`#EAB308`) — high lightness contrast as backup
   - Purple (`#7C3AED`) and yellow-green (`#A3E635`) — different lightness + different hue region

   **Unsafe pairs (fail for common CVD types):**
   - Red (`#DC2626`) and green (`#16A34A`) — indistinguishable for deutan/protan (8% of males)
   - Green (`#16A34A`) and brown (`#92400E`) — merge for deutan
   - Red (`#DC2626`) and brown (`#92400E`) — merge for protan
   - Blue (`#2563EB`) and purple (`#7C3AED`) — merge for tritan
   - Pink (`#EC4899`) and gray (`#6B7280`) — insufficient lightness contrast for achromatopsia

4. **Design data visualizations for color independence.** Charts are the most common color accessibility failure. A line chart with 5 color-coded series is useless for colorblind users if color is the only differentiator.

   **Visualization accessibility checklist:**
   - Use distinct line patterns (solid, dashed, dotted, dash-dot) in addition to color
   - Add shape markers at data points (circle, square, triangle, diamond, star)
   - Provide direct labels on or adjacent to data series rather than relying on a color-keyed legend
   - If using area fills, combine color with pattern fills (diagonal stripes, dots, crosshatch)
   - Limit color-only categorical series to 3-4 maximum — beyond that, pattern and shape differentiation breaks down regardless of color choices

   **IBM's accessible palette for data visualization** provides 8 distinct colors all designed to remain distinguishable under deuteranopia and protanopia: `#6929C4`, `#1192E8`, `#005D5D`, `#9F1853`, `#FA4D56`, `#570408`, `#198038`, `#002D9C`. These were specifically tested under CVD simulation.

5. **Use perceptually uniform color spaces for palette generation.** Standard RGB and HSL spaces are not perceptually uniform — equal numeric steps do not produce equal visual differences. This matters for accessibility because colorblind users may rely on lightness differences when hue is indistinguishable.

   **OKLCH** is the recommended perceptually uniform space:
   - **L** (Lightness): 0-1, perceptually linear
   - **C** (Chroma): 0-0.4, perceptually uniform colorfulness
   - **H** (Hue): 0-360 degrees

   When generating accessible palettes, ensure that each color in the palette has a distinct OKLCH Lightness value. If two colors must be distinguishable, they should differ by at least 0.15 in OKLCH Lightness (or ~15 units in CIELAB L\*). This guarantees that even under total color blindness (achromatopsia), the values remain separable.

6. **Test with CVD simulation tools.** Do not assume your palette is accessible — verify it:
   - **Chrome DevTools:** Rendering panel > Emulate vision deficiencies > Protanopia / Deuteranopia / Tritanopia / Achromatopsia
   - **Figma:** Stark plugin or built-in Vision Simulator
   - **Command line:** `colorblind-check` npm package for automated CI testing
   - **Manual verification:** Convert your palette to grayscale (desaturate to 0%). If two elements that carry different meaning become indistinguishable in grayscale, they need a non-color differentiator.

## Details

### WCAG 1.4.1 in Practice

WCAG SC 1.4.1 states: "Color is not used as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing a visual element." This is Level A — the absolute baseline. Failing this criterion means failing the most fundamental accessibility standard.

Common violations that pass unnoticed in design review:

- **Required field indicators:** A red asterisk (\*) uses color + shape, which passes. But a field label that turns red with no other change fails.
- **Link differentiation:** Links within body text that are only distinguishable by their blue color fail unless they have at least 3:1 contrast against the surrounding text AND a non-color indicator on hover/focus (typically underline).
- **Progress indicators:** A progress bar that shifts from red to yellow to green fails. Adding percentage text or milestone markers fixes it.
- **Toggle/switch states:** A toggle that is red when off and green when on fails unless the toggle also changes shape, position, or includes on/off text.

### Building a Colorblind-Safe Semantic System

The standard semantic colors (red=error, yellow=warning, green=success, blue=info) are problematic because red and green are the most commonly confused pair. Solutions:

1. **Always pair with icons:** Error = red + X icon, Success = green + checkmark, Warning = amber + triangle icon, Info = blue + (i) icon. The icon alone must be sufficient to communicate the state.

2. **Ensure lightness differentiation:** Even if hue is lost, the lightness should differ. Error red at L:45%, warning amber at L:65%, success green at L:55%, info blue at L:50%. Under achromatopsia, these become four distinct grays.

3. **Use distinct shapes for status badges:** Error = circle, Warning = triangle, Success = shield/checkmark, Info = square. Material Design uses shape as a primary differentiator for chip states — selected chips change both color AND shape (adding a checkmark).

### Perceptual Uniformity and the OKLCH Advantage

Traditional HSL is perceptually non-uniform: `hsl(60, 100%, 50%)` (yellow) appears far brighter than `hsl(240, 100%, 50%)` (blue) despite identical L values. This means a palette with "equal" HSL steps will have wildly different perceived lightness, causing colorblind users (who rely on lightness) to lose information.

OKLCH fixes this. In OKLCH, L:0.7 looks equally bright regardless of hue. A palette generated with equal OKLCH Lightness spacing guarantees that even under complete color blindness, the lightness progression is perceivable. Modern CSS supports OKLCH natively: `color: oklch(0.7 0.15 250)`.

### Anti-Patterns

1. **Traffic Light Reliance.** Using red/yellow/green as the primary semantic system without any redundant encoding. This is the single most common color accessibility failure. Approximately 1 in 12 males cannot reliably distinguish your red from your green. Fix: add icons (X, triangle, checkmark), add text labels, and ensure the three colors have distinct lightness values (not all at L:50%).

2. **Hue-Only Chart Differentiation.** A pie chart with 5 slices distinguished only by hue. Under deuteranopia, 2-3 slices may become indistinguishable. Fix: add patterns, direct labels, or interactive tooltips. Limit to 3-4 color-only slices maximum, and ensure they span safe pairs (blue, orange, purple, yellow — not red, green, brown, olive).

3. **Red-Green as Primary Semantic Pair.** Using red and green as the two most important status colors without alternatives. Even when icons are added, if the icon is small and the color fill is dominant, colorblind users may struggle with rapid scanning. Fix: consider blue (safe) for the positive state and red (universal danger) for the negative state — blue and red are distinguishable under all common CVD types.

4. **Decorative Color Dependency.** Calendar apps that use color-coded categories without any text or icon label. When 8 calendar categories are distinguished only by color, a colorblind user sees perhaps 4 distinguishable groups. Fix: add category initials, icons, or pattern fills in addition to color.

5. **Ignoring Achromatopsia.** Designing for red-green colorblindness but forgetting total color blindness. If two elements differ in hue but have identical lightness, an achromatopsic user sees them as identical. Fix: ensure every meaningful color distinction also has a lightness distinction of at least 15 OKLCH L units (or ~20 CIELAB L\* units).

### Real-World Examples

**Material Design — Shape + Color for States.** Material Design 3 chips use both color and shape to indicate selection state. An unselected chip has an outlined border with transparent fill. A selected chip gains a tinted fill AND a leading checkmark icon. The checkmark alone communicates "selected" without any color perception. This dual-encoding approach is applied consistently across the entire component library: radio buttons (filled circle), checkboxes (checkmark), toggles (position + fill), and tabs (underline + fill).

**Stripe — Triple Encoding for Error States.** Stripe's form validation uses three simultaneous channels: (1) the input border turns red (`#DF1B41`), (2) an error icon appears to the left of the error message, (3) descriptive error text appears below the input. A colorblind user who cannot perceive the red border still receives the error through the icon and text. This triple-encoding is not defensive — it is better design for all users because it provides faster error recognition through multiple cognitive channels.

**IBM Carbon — Accessible Data Visualization.** IBM's Carbon design system includes an 8-color categorical palette specifically tested under all CVD types. Each color was selected to maintain distinctness under deuteranopia, protanopia, and tritanopia simulation. Additionally, Carbon's chart components default to pattern fills for area charts and shape markers for line charts — making color truly supplementary rather than primary.

## Source

- WCAG 2.1 Success Criterion 1.4.1 — Use of Color — https://www.w3.org/WAI/WCAG21/Understanding/use-of-color
- Colour Blind Awareness — Prevalence statistics — https://www.colourblindawareness.org/
- Machado, Oliveira & Fernandes (2009) — "A Physiologically-based Model for Simulation of Color Vision Deficiency" — IEEE TVCG
- OKLCH Color Space — https://oklch.com/
- IBM Carbon Accessible Palette — https://carbondesignsystem.com/data-visualization/color-palettes/

## Process

1. Audit all color-dependent information in the design. For each instance where color conveys meaning, identify the redundant encoding (icon, text, shape, pattern) that makes the information perceivable without color.
2. Select colorblind-safe color pairs for elements that must be distinguishable. Test pairs under deuteranopia and protanopia simulation (covers 7%+ of male users).
3. Verify perceptual uniformity: ensure all meaningful color distinctions have a lightness difference of at least 15 OKLCH L units. Run the grayscale test.
4. Test the complete UI under CVD simulation in Chrome DevTools or Figma. Fix any failures before finalizing.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **Pairs with:** design-contrast-ratio (contrast is necessary but not sufficient — a design can pass all contrast checks and still fail color independence), design-palette-construction (palette colors must be chosen with CVD in mind), a11y-color-contrast (implementation-level patterns for color and contrast in code).
- **Sequencing:** Apply after design-palette-construction has defined the color system. Color accessibility is a verification and augmentation step — it may require adding redundant encodings to existing designs.

## Success Criteria

- No information is conveyed by color alone — every color-based meaning has a redundant non-color encoding (icon, text, shape, pattern).
- All color pairs used for meaningful distinction are safe under deuteranopia and protanopia simulation.
- Semantic status colors (error, warning, success, info) are paired with distinct icons and text labels.
- Data visualizations use pattern fills, shape markers, or direct labels in addition to color.
- The grayscale test passes — all meaningful distinctions are visible when the design is fully desaturated.
- OKLCH Lightness differences between meaningful color pairs exceed 0.15 (or 15 CIELAB L\* units).
- The design has been tested under CVD simulation in browser DevTools or Figma for all four types.
- Form validation uses triple encoding: color change + icon + text message.
