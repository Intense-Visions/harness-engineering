# Contrast Ratio

> Luminance contrast for readability and visual weight — WCAG ratios, contrast as a hierarchy tool, contrast beyond accessibility

## When to Use

- Setting text colors against backgrounds for any UI element
- Designing visual hierarchy through contrast tiers (primary, secondary, tertiary content)
- Evaluating whether interactive elements (buttons, links, form controls) are sufficiently visible
- Building or auditing a design system's contrast scale
- Choosing colors for data visualization labels, chart annotations, or overlay text
- Assessing dark mode palettes for adequate contrast without eye strain
- Reviewing designs for WCAG 2.1 AA or AAA compliance
- Verifying focus indicators and interactive state visibility
- Calibrating overlay opacity for text on images or gradients
- Defining a contrast scale for a design token system
- Ensuring disabled states are perceivable but visually de-emphasized

## Instructions

1. **Know the WCAG thresholds.** These are non-negotiable minimums, not targets:

   | Content Type                                                 | AA Minimum     | AAA Enhanced | Example                                        |
   | ------------------------------------------------------------ | -------------- | ------------ | ---------------------------------------------- |
   | Normal text (<18pt / <24px, or <14pt bold / <18.5px bold)    | 4.5:1          | 7:1          | Body copy, labels, captions                    |
   | Large text (>=18pt / >=24px, or >=14pt bold / >=18.5px bold) | 3:1            | 4.5:1        | Headings, hero text                            |
   | Non-text UI components (icons, borders, form outlines)       | 3:1            | —            | Checkbox borders, input outlines, icon buttons |
   | Inactive components and decorative elements                  | No requirement | —            | Disabled buttons, background patterns          |

2. **Understand relative luminance.** Contrast ratio is calculated from relative luminance, not perceived brightness. The formula: `(L1 + 0.05) / (L2 + 0.05)` where L1 is the lighter color's luminance. Pure white has luminance 1.0, pure black has luminance 0.0. This means `#767676` on `#ffffff` produces exactly 4.54:1 — the minimum AA threshold for normal text. This is the lightest gray you can use for body text on white.

3. **Design contrast tiers, not just minimum compliance.** Contrast is a hierarchy tool. Apple's approach demonstrates three distinct tiers:
   - **Primary content** (headings, primary labels): 15:1 to 21:1 — near-black on white (`#1D1D1F` on `#FFFFFF` = 17.4:1)
   - **Secondary content** (subheadings, secondary labels): 7:1 to 10:1 — dark gray (`#424245` on `#FFFFFF` = 9.6:1)
   - **Tertiary content** (timestamps, metadata, captions): 4.5:1 to 7:1 — medium gray (`#6E6E73` on `#FFFFFF` = 5.5:1)
   - **Decorative/disabled**: below 4.5:1 — light gray for non-essential elements

   This graduated system creates clear visual hierarchy through contrast alone, without relying on font size or weight changes.

4. **Apply the squint test.** Squint at your interface until details blur. The elements that remain visible have high contrast and will be read first. If your primary CTA disappears when squinting but a decorative element persists, your contrast hierarchy is inverted.

5. **Calculate, do not eyeball.** Human contrast perception is unreliable — we are biased by surrounding colors, screen brightness, and ambient light. Always use a tool:
   - Browser DevTools color picker (shows contrast ratio on hover)
   - WebAIM Contrast Checker (webaim.org/resources/contrastchecker)
   - Figma plugins: Stark, A11y - Color Contrast Checker
   - CLI: `npx wcag-contrast <fg> <bg>` for automation in CI

6. **Check all interactive states.** A button that passes contrast in its default state may fail in hover, focus, active, or disabled states. Audit every state:
   - Default: must meet 3:1 for the component boundary and 4.5:1 for text
   - Hover: contrast may shift — verify it does not drop below thresholds
   - Focus: focus indicator must have 3:1 against adjacent colors (WCAG 2.4.11)
   - Disabled: exempt from contrast requirements, but should still be perceivable as present (not invisible)

7. **Handle text on images and gradients.** Text placed over photography or gradients will have variable contrast across its length. Solutions:
   - Add a semi-transparent overlay: `rgba(0, 0, 0, 0.6)` behind white text guarantees 4.5:1+ against any background
   - Use a solid pill or banner behind the text
   - Stripe uses blue-tinted shadow overlays (`rgba(50, 50, 93, 0.25)`) that maintain chromatic depth while ensuring contrast for overlaid text

8. **Use contrast to encode importance, not just ensure readability.** Higher contrast elements receive more visual attention. Stripe's dashboard hierarchy:
   - Transaction amounts: `#061b31` on white (18.5:1) — maximum emphasis
   - Status labels: `#425466` on white (7.3:1) — secondary emphasis
   - Timestamps: `#697386` on white (4.9:1) — tertiary, just above AA minimum
   - Decorative dividers: `#e3e8ee` on white (1.6:1) — structural, not meant to be "read"

## Details

### The Luminance Scale Is Not Linear

A common mistake is assuming that moving from `#000` to `#808080` (visual midpoint) is "half" the contrast range. It is not. `#808080` on white yields only 3.9:1, while `#808080` on black yields 5.3:1. The luminance formula applies gamma correction (sRGB transfer function), which compresses the dark end and expands the light end. This is why dark themes need different contrast calibration than light themes — the perceptual spacing between dark grays is narrower than between light grays.

### Contrast in Dark Mode

Dark mode does not mean "invert the contrast ratios." It means recalibrating the entire contrast scale against a dark base. Key differences:

- **Maximum contrast is harmful.** Pure white (`#FFFFFF`) on pure black (`#000000`) is 21:1 — technically perfect but physiologically exhausting for sustained reading. Material Design recommends capping dark mode text contrast at approximately 15.8:1 by using `#E3E3E3` (87% opacity white) on `#121212` instead of pure white on pure black.
- **Elevation through contrast.** In dark mode, higher surfaces are lighter. Material Design 3 uses: base surface `#1C1B1F`, elevated surfaces at `#211F26`, `#2B2930`, `#322F37`, `#393542` — each step increasing lightness by 1-3% to create depth through subtle contrast shifts.
- **Colored text needs extra care.** Saturated colors that pass on white may fail on dark backgrounds. Stripe's purple `#533afd` passes on white (5.6:1) but would need to lighten to approximately `#7B6BFF` to maintain 4.5:1 on `#121212`.

### Contrast Zones Framework

Organize your design system's contrast into explicit zones:

| Zone           | Ratio Range | Purpose                               | Examples                                  |
| -------------- | ----------- | ------------------------------------- | ----------------------------------------- |
| **Maximum**    | 12:1 - 21:1 | Primary content, critical information | Headings, prices, error messages          |
| **High**       | 7:1 - 12:1  | Important secondary content           | Subheadings, button labels, input text    |
| **Standard**   | 4.5:1 - 7:1 | Supporting content                    | Body text, descriptions, secondary labels |
| **Minimum**    | 3:1 - 4.5:1 | Non-critical UI, large text           | Placeholder text, icons, borders          |
| **Decorative** | Below 3:1   | Non-informational                     | Dividers, watermarks, background patterns |

Assign every text and UI element to a zone. If two elements in different zones look the same contrast, one of them is in the wrong zone.

### Anti-Patterns

1. **Gray-on-Gray Elegance.** Mistaking low contrast for sophistication. Symptoms: body text at 3.5:1, placeholder text at 2:1, borders invisible on their backgrounds. Many "minimalist" design portfolios fail AA entirely. Sophistication comes from contrast _hierarchy_ (having distinct tiers), not contrast _reduction_ (making everything low-contrast). Stripe is sophisticated AND high-contrast — headings at 18.5:1, body at 7.3:1.

2. **Contrast Overload.** Everything at maximum contrast (near 21:1) destroys hierarchy because nothing stands out more than anything else. If all text is pure black on pure white, you have lost your most powerful hierarchy tool. Fix: reserve maximum contrast for a single tier (headings or primary actions) and deliberately reduce contrast for secondary and tertiary content.

3. **Ignoring Non-Text Contrast.** WCAG 2.1 SC 1.4.11 requires 3:1 for UI components — but many implementations only check text. A light gray checkbox border (`#D0D0D0` on `#FFFFFF` = 1.5:1) is invisible to low-vision users even if the label text passes. Form input borders, toggle switches, slider tracks, and icon buttons all need 3:1 verification.

4. **Focus Indicator Failure.** The default browser focus outline is often overridden with `outline: none` for aesthetics, then replaced with a custom focus ring that fails contrast. A blue focus ring (`#5B9BD5`) on a white background is only 2.8:1. Apple uses a thick (3px) blue ring (`#007AFF` on white = 4.0:1) with an additional white inner offset to guarantee visibility against any adjacent color.

5. **Contrast Tunnel Vision.** Checking contrast only in isolation (swatch-to-swatch) instead of in context. A text color that passes against its immediate background may be imperceptible if the surrounding elements have higher contrast, drawing the eye away. Always verify contrast in a full-page context, not just in a color-picker tool.

### Real-World Examples

**Apple — Three-Tier Hierarchy.** Apple's Human Interface Guidelines use a precise three-tier contrast system across all platforms. On a white background: primary labels use `#000000` (21:1), secondary labels use `rgba(60, 60, 67, 0.6)` (~7.2:1), and tertiary labels use `rgba(60, 60, 67, 0.3)` (~3.5:1, acceptable only for large or non-critical text). In dark mode, these invert to white at 100%/60%/30% opacity on the dark surface. The ratios shift but the relative hierarchy is preserved.

**Material Design — Opacity-Based Contrast.** Material Design maps contrast to opacity rather than fixed colors. On a light surface, high-emphasis text is `rgba(0,0,0,0.87)` (12.6:1), medium-emphasis is `rgba(0,0,0,0.60)` (7.1:1), and disabled text is `rgba(0,0,0,0.38)` (3.5:1). This approach ensures that contrast tiers automatically adjust when the surface color changes — the system is self-calibrating.

**Vercel — Numeric Contrast Scale.** Vercel's Geist design system defines a numeric gray scale (gray-100 through gray-1000) where each step is explicitly mapped to a contrast role. Gray-900 (`#171717`) is for headings (18.9:1 on white), gray-700 (`#404040`) for body text (9.7:1), gray-500 (`#737373`) for secondary text (4.6:1), and gray-300 (`#D4D4D4`) for borders (1.5:1, decorative only). The scale makes contrast auditing mechanical — check the gray number, know the contrast zone.

**Stripe — Chromatic Contrast.** Stripe extends contrast thinking beyond achromatic grays. Their shadows use `rgba(50, 50, 93, 0.25)` — a blue-tinted shadow that creates visual depth while maintaining chromatic coherence with the navy headings. The contrast between the shadow and the card surface is deliberately low (decorative zone), but the shadow's blue tint ensures it registers as intentional design rather than a rendering artifact.

### Contrast and Typography Interaction

Contrast requirements interact with font weight and size. A font rendered at weight 300 (light) appears lower-contrast than the same color at weight 700 (bold), even though the calculated ratio is identical — because thinner strokes occupy fewer pixels, reducing effective contrast. Stripe uses weight 300 for its display typography as a luxury signal, but compensates by using very high contrast colors (`#061b31` on white = 18.5:1). If you use light font weights, increase your target contrast ratio by at least one tier above the WCAG minimum.

## Source

- WCAG 2.1 Success Criterion 1.4.3 — Contrast (Minimum) — https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum
- WCAG 2.1 Success Criterion 1.4.6 — Contrast (Enhanced)
- WCAG 2.1 Success Criterion 1.4.11 — Non-text Contrast
- W3C Relative Luminance Definition — https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
- Material Design — Dark Theme Guidelines — https://m3.material.io/styles/color/dark-theme

## Process

1. Read the contrast zone framework and map your design system's elements to zones (maximum, high, standard, minimum, decorative).
2. Assign specific contrast ratios to each element by zone, using the WCAG thresholds as minimums and the tiered approach for hierarchy.
3. Verify every text element, UI component, and interactive state with a contrast checking tool. Confirm that the hierarchy is perceptible via the squint test.
4. Re-check contrast ratios after any color change — a single hex value shift can drop an element below threshold.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **Pairs with:** design-color-harmony (contrast must not undermine harmony choices), design-color-accessibility (contrast is necessary but not sufficient for accessibility), design-visual-hierarchy (contrast is the primary mechanism for visual hierarchy), a11y-color-contrast (implementation-level contrast patterns in code).
- **Sequencing:** Apply after design-color-harmony has established the palette. Contrast verification is a gate — no color choice is final until contrast is verified.

## Success Criteria

- Every text element meets its WCAG tier: 4.5:1 for normal text (AA), 3:1 for large text (AA), 7:1 for enhanced (AAA).
- Non-text UI components (borders, icons, form controls) meet 3:1 against adjacent colors.
- The design uses at least 3 distinct contrast tiers (not a flat single-tier approach).
- The squint test confirms that the visual hierarchy matches the intended information hierarchy.
- All interactive states (hover, focus, active, disabled) have been verified for contrast.
- Dark mode contrast ratios have been independently verified (not assumed from light mode).
- Contrast values are documented in the design system (not embedded as magic numbers in components).
- Focus indicators meet 3:1 against adjacent colors per WCAG 2.4.11.
- Light font weights (300-400) use contrast ratios at least one tier above the WCAG minimum to compensate for reduced stroke density.
