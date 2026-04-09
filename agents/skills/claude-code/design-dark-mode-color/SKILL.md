# Dark Mode Color

> Color adaptation for dark themes — inverted hierarchy, reduced saturation, elevation through lightness, surface layering, and maintaining brand identity in dark contexts

## When to Use

- Building a dark theme for an existing light-mode product
- Designing a product that launches in dark mode by default (media players, code editors, creative tools)
- Adapting a light-mode color palette to dark surfaces without losing brand recognition
- Creating elevated surface layers in dark UI (cards, modals, popovers, dropdowns)
- Choosing text colors and opacities for dark backgrounds
- Debugging dark mode issues: eye strain, halation, invisible borders, lost hierarchy
- Implementing `prefers-color-scheme` CSS media query with design-informed token mapping
- Building a design system that supports both themes with shared component architecture

## Instructions

1. **Dark mode is not "invert colors."** The fundamental error is thinking dark mode means swapping black and white. It means rebuilding the entire visual hierarchy for dark surfaces. Key inversions:
   - **Light mode:** Elevation = shadow (darker beneath). **Dark mode:** Elevation = lighter surface (higher = lighter).
   - **Light mode:** Background is lightest, text is darkest. **Dark mode:** Background is darkest, but text should NOT be pure white.
   - **Light mode:** Saturated colors pop against white. **Dark mode:** Same saturated colors cause halation (glow/bleed) against dark backgrounds and must be desaturated.

2. **Never use pure black (`#000000`) as the base surface.** Pure black creates maximum contrast (21:1) against white text, causing eye fatigue during extended reading. It also makes the screen look like a "hole" — the content floats in void rather than sitting on a surface. Use dark gray instead:
   - **Material Design 3:** `#1C1B1F` (slightly warm purple-tinted dark gray)
   - **GitHub:** `#0d1117` (blue-tinted near-black)
   - **Spotify:** `#121212` (near-neutral dark gray)
   - **Apple:** `#000000` for OLED true black mode (power saving exception), `#1C1C1E` for standard dark mode

   Decision procedure: use `#121212` or darker as your base surface. Tint it toward your brand hue at very low saturation (2-5%) for chromatic unity. Exception: OLED-specific modes may use `#000000` for power efficiency, but this should be an opt-in mode, not the default.

3. **Build surface elevation through lightness, not shadows.** In dark mode, shadows are invisible (dark on dark). Replace the shadow-based elevation system with a lightness-based one:

   | Elevation Level | Light Mode                 | Dark Mode (MD3)          | Purpose                               |
   | --------------- | -------------------------- | ------------------------ | ------------------------------------- |
   | Level 0 (base)  | `#FFFFFF`                  | `#1C1B1F`                | Page background                       |
   | Level 1         | `#FFFFFF` + shadow         | `#211F26` (+3% lighter)  | Cards, raised sections                |
   | Level 2         | `#FFFFFF` + deeper shadow  | `#2B2930` (+6% lighter)  | Navigation drawers, modal backgrounds |
   | Level 3         | `#FFFFFF` + heavy shadow   | `#322F37` (+8% lighter)  | Floating action buttons, search bars  |
   | Level 4         | `#FFFFFF` + maximum shadow | `#393542` (+11% lighter) | Popovers, dropdown menus, tooltips    |

   Material Design 3 adds a surface tint: overlay the primary color at low opacity (5-14%) on each surface level. This creates chromatic elevation — higher surfaces are not just lighter, they are slightly more tinted toward the brand color, reinforcing the connection between elevation and brand identity.

4. **Reduce saturation for chromatic colors on dark backgrounds.** Vivid colors on dark surfaces produce halation — a perceived glow around the color boundary caused by the eye's inability to focus all wavelengths at the same depth. The effect is strongest with warm, saturated colors (red, orange).

   **Desaturation guidelines:**
   - Primary brand colors: reduce saturation by 10-20% from light mode values, or increase lightness by 15-25%
   - Apple adapts system colors: `systemBlue` shifts from `#007AFF` (light) to `#0A84FF` (dark) — the dark variant is lighter (L+5%) and very slightly desaturated
   - Stripe's `#533afd` would need to lighten to approximately `#7B6BFF` for dark mode to maintain contrast while reducing halation
   - Semantic colors: error red shifts from `#EF4444` to `#FCA5A5` (lighter, less saturated); success green from `#22C55E` to `#86EFAC`

5. **Set text opacity tiers, not fixed text colors.** Using opacity-based text creates a self-calibrating system — when the surface color changes across elevation levels, the text contrast adjusts automatically:

   | Text Role                          | Light Mode         | Dark Mode                | Contrast on #121212 |
   | ---------------------------------- | ------------------ | ------------------------ | ------------------- |
   | Primary (headings, body)           | `rgba(0,0,0,0.87)` | `rgba(255,255,255,0.87)` | ~15.8:1             |
   | Secondary (descriptions, metadata) | `rgba(0,0,0,0.60)` | `rgba(255,255,255,0.60)` | ~9.1:1              |
   | Disabled / Placeholder             | `rgba(0,0,0,0.38)` | `rgba(255,255,255,0.38)` | ~4.7:1              |

   Material Design established these tiers. The 87%/60%/38% ratios ensure that primary text exceeds 7:1 (AAA), secondary exceeds 4.5:1 (AA), and disabled hovers just above 4.5:1 — providing hierarchy through contrast while meeting accessibility requirements at each tier.

6. **Maintain brand recognition across themes.** The brand should be instantly recognizable in dark mode. Strategies:
   - **Preserve hue, adapt lightness:** Keep the same hue and similar saturation, but shift lightness up for readability. Stripe's purple shifts from 500-equivalent in light mode to 300-400 equivalent in dark mode.
   - **Preserve the logo/brand mark:** Use the light variant of the logo on dark backgrounds, not the dark variant.
   - **Preserve structural hierarchy:** If navy text was the primary structural color in light mode, the equivalent in dark mode is a light blue-gray that carries the same hue family.

7. **Handle images and media.** Full-brightness images on a dark surface create jarring contrast. Solutions:
   - Reduce image brightness by 10-15% in dark mode: `filter: brightness(0.85)`
   - Add a subtle dark overlay on hero images
   - Use image frames (subtle borders or rounded containers with dark surface backgrounds) to mediate the transition
   - GitHub uses `border: 1px solid rgba(255,255,255,0.1)` around images in dark mode to separate image content from the dark background

## Details

### The Halation Problem

Halation occurs when bright, saturated colors are displayed on very dark backgrounds. The eye's lens cannot focus all wavelengths at the same point (chromatic aberration), causing colored text or elements to appear to glow, bleed, or vibrate. The effect is worst for:

- **Red and orange text on black** — long wavelengths focus behind the retina on dark backgrounds
- **High-saturation blues** — short wavelengths focus in front of the retina
- **Any saturated color at small text sizes** — thin strokes make the glow more apparent relative to letter width

Fix: desaturate colors by 15-30% for dark mode use, or increase lightness to shift toward pastel territory. Apple's dark mode color adaptations demonstrate this: every system color shifts lighter and slightly less saturated in dark mode. `systemRed` goes from `#FF3B30` to `#FF453A` — subtle but measurable.

### Dark Mode Surface Token Architecture

A robust dark mode implementation uses semantic surface tokens, not hard-coded colors:

```
--surface-base:    #121212   /* Page background */
--surface-raised:  #1E1E1E   /* Cards, sections */
--surface-overlay: #2C2C2C   /* Modals, popovers */
--surface-highest: #383838   /* Tooltips, dropdowns */
--on-surface:      rgba(255,255,255,0.87)  /* Primary text */
--on-surface-secondary: rgba(255,255,255,0.60)  /* Secondary text */
--on-surface-disabled:  rgba(255,255,255,0.38)  /* Disabled text */
```

These tokens swap between themes while component code remains unchanged. The `on-surface` naming convention (from Material Design) makes the relationship explicit: `--on-surface` is always readable on `--surface-base`.

### Anti-Patterns

1. **Pure Black Background.** Using `#000000` as the default dark surface. Symptoms: the UI feels like a void, text creates harsh contrast that causes eye fatigue, elevated surfaces require enormous lightness jumps to be distinguishable. OLED power saving is not a sufficient justification for default pure black — even Samsung's One UI uses `#1A1A1A`, not `#000000`. Fix: use `#121212` to `#1C1B1F` as your dark surface base.

2. **Direct Palette Inversion.** Taking the light mode palette and mechanically inverting it (white becomes black, light gray becomes dark gray). Symptoms: brand colors look wrong, the hierarchy feels off, saturated elements glow uncomfortably. Fix: rebuild the dark palette from the same brand hue but with dark-mode-specific lightness, saturation, and contrast calibration. Light-300 does not become Dark-700 — the relationship is more nuanced than simple number inversion.

3. **Shadow Dependence.** Keeping `box-shadow` as the primary elevation mechanism in dark mode. Symptoms: cards are flat (shadows invisible against dark backgrounds), the UI loses all depth perception, modal overlays do not feel elevated. Fix: replace shadows with surface lightness tiers and/or subtle borders. Material Design 3 uses both surface tint and a 1px hairline border (`rgba(255,255,255,0.05)`) for dark mode elevation.

4. **Maximum Contrast Text.** Using pure white `#FFFFFF` text on the dark surface. Symptoms: eye fatigue after extended reading, text appears to "shimmer" or strobe on high-DPI screens, the overall feel is clinical and harsh. Fix: use `rgba(255,255,255,0.87)` or `#E0E0E0` for primary text, reserving pure white only for the most critical, short-form content (page titles, modal headers).

5. **Forgetting Borders.** Relying on background contrast to separate adjacent components that were separated by shadows in light mode. In dark mode, two adjacent cards at the same surface level are indistinguishable. Fix: add 1px borders using `rgba(255,255,255,0.08-0.12)` between same-level surfaces. GitHub's dark mode uses this extensively — every card, comment box, and code block has a subtle light border.

### Real-World Examples

**Material Design 3 — Surface Tint System.** MD3's dark mode overlays the primary color at escalating opacities on each surface level: Level 1 = primary at 5%, Level 2 = 8%, Level 3 = 11%, Level 4 = 12%, Level 5 = 14%. On a base of `#1C1B1F` with primary `#D0BCFF`, Level 1 becomes a barely-perceptible warm purple tint. This creates a hierarchy that is both functional (elevated surfaces are lighter) and branded (the elevation is tinted with the product color).

**Apple — Semantic Color Adaptation.** Apple's system colors are not single values — they are dynamic. Each system color has four variants: light mode default, light mode accessible (higher contrast), dark mode default, and dark mode accessible. `systemBlue` in dark mode is `#0A84FF` — 7% lighter and 2% more saturated than light mode's `#007AFF`. This shift is calibrated per-color: red shifts more in lightness, green shifts less, because each hue has different perceptual behavior on dark backgrounds.

**GitHub — Primer Dark Palette.** GitHub's Primer design system defines a complete dark mode palette with 10 levels of gray from `#0d1117` (canvas default) through `#f0f6fc` (fg default). The palette maintains a cool blue undertone in dark mode (matching their brand), and every surface level has explicit named tokens: `canvas.default`, `canvas.overlay`, `canvas.inset`, `canvas.subtle`. Border tokens shift from shadow-based separation in light mode to 1px borders at `rgba(240,246,252,0.1)` in dark mode.

## Source

- Material Design 3 Dark Theme — https://m3.material.io/styles/color/dark-theme
- Apple Human Interface Guidelines — Dark Mode — https://developer.apple.com/design/human-interface-guidelines/dark-mode
- GitHub Primer Color System — https://primer.style/design/foundations/color
- WCAG 2.1 — Contrast requirements apply equally in dark mode

## Process

1. Start from your light-mode palette (from design-palette-construction). Identify the base surface color (use `#121212` to `#1C1B1F`, optionally tinted toward brand hue).
2. Build 4-5 surface elevation levels by incrementally lightening the base. Optionally apply primary color tint at 5-14% per Material Design 3.
3. Adapt all chromatic colors: reduce saturation 10-20%, increase lightness 15-25%. Set text opacity tiers at 87%/60%/38%.
4. Test the complete dark palette in a component matrix. Verify contrast at each elevation level. Check for halation with saturated colors at small text sizes.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **Pairs with:** design-palette-construction (dark mode is a derivative of the base palette), design-contrast-ratio (all contrast requirements apply equally in dark mode), design-elevation-shadow (dark mode replaces shadow-based elevation with lightness-based elevation), css-dark-mode (implementation patterns for `prefers-color-scheme`).
- **Sequencing:** Use after design-palette-construction. Dark mode adaptation is a separate step from palette construction, not an afterthought.

## Success Criteria

- The dark surface base is not pure black — it uses `#121212` or warmer with optional brand tint.
- At least 4 surface elevation levels are defined with progressive lightness increases.
- All chromatic colors have dark-mode-specific values with reduced saturation and increased lightness.
- Text uses opacity-based tiers (87%/60%/38%) that self-calibrate across surface levels.
- No halation is visible with saturated colors at body text sizes on the dark surface.
- Shadows are replaced with surface lightness and/or subtle borders for elevation.
- Brand identity is recognizable — hue is preserved even as lightness and saturation shift.
- All WCAG contrast requirements are met independently in dark mode (not inherited from light mode).
- Images and media are handled with brightness reduction or border framing to avoid jarring contrast.
- The dark palette is implemented through semantic tokens that swap between themes.
