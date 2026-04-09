# Typography Fundamentals

> Anatomy of type — x-height, ascenders, descenders, counters, serifs, stroke contrast, optical sizing, and how anatomy affects readability

## When to Use

- Selecting a typeface for a new project or design system
- Evaluating why a font "feels wrong" at a given size or context
- Comparing fonts that appear similar but behave differently in layout
- Debugging rendering issues caused by metric differences between typefaces
- Deciding between optical sizes (text vs display cuts) of the same family

## Instructions

1. **Learn the vertical metrics.** Every Latin typeface is defined by a vertical scaffold:
   - **Baseline** — the invisible line letters sit on; descenders drop below it
   - **X-height** — the height of lowercase `x`; the single most important metric for perceived size and readability
   - **Cap height** — the top of uppercase letters like `H`; typically 68-72% of the em square
   - **Ascender line** — the top of tall lowercase letters (`b`, `d`, `h`, `l`); usually exceeds cap height by 2-5%
   - **Descender line** — the bottom of `g`, `p`, `q`, `y`; typically 20-30% of the em square below baseline

2. **Evaluate x-height ratio before selecting any font.** The x-height-to-cap-height ratio determines perceived size at a given pixel value. Higher x-height = more readable at small sizes, less elegant at large sizes.
   - **Inter**: 0.756 ratio — designed for screen UI, maximizes legibility at 12-16px
   - **Helvetica Neue**: 0.714 ratio — slightly more traditional proportions
   - **Garamond**: 0.630 ratio — smaller x-height, elegant but requires larger sizes for body text
   - **Georgia**: 0.698 ratio — tall x-height for a serif, deliberately designed for screen reading
   - **Decision rule**: For UI text at 14-16px, choose fonts with x-height ratio >= 0.70. For editorial/display at 24px+, lower ratios (0.60-0.70) create more refined proportions.

3. **Understand counter and aperture openings.** Counters are the enclosed or partially enclosed spaces within letters (the hole in `o`, `e`, `d`). Apertures are the openings in letters like `c`, `e`, `s`.
   - **Open apertures** (Inter, SF Pro, Fira Sans) improve legibility at small sizes because letterforms remain distinguishable
   - **Closed apertures** (Helvetica, Futura) create tighter, more geometric forms but reduce legibility below 14px
   - **Decision rule**: If body text will be set below 16px on screen, prefer fonts with open apertures

4. **Classify typefaces by their structural attributes, not marketing labels.**
   - **Serif** — horizontal or angled strokes at letter terminals; subdivided into old-style (Garamond), transitional (Baskerville), modern/didone (Bodoni), slab (Rockwell)
   - **Sans-serif** — no terminal strokes; subdivided into grotesque (Helvetica), neo-grotesque (Inter), geometric (Futura), humanist (Gill Sans, Fira Sans)
   - **Monospace** — equal character widths; critical for code (SF Mono, JetBrains Mono, Source Code Pro)
   - **Display** — optimized for large sizes; thinner strokes, tighter spacing, higher contrast; never use at body sizes

5. **Assess stroke contrast for size-appropriate selection.** Stroke contrast is the ratio between the thickest and thinnest strokes in a letterform.
   - **High contrast** (Bodoni, Didot): thick/thin ratio of 5:1 or more. Elegant at 36px+, strokes disappear at 12px. Use only for display.
   - **Medium contrast** (Georgia, Baskerville): ratio of ~2:1 to 3:1. Functional at body sizes 16px+.
   - **Low contrast** (Inter, Roboto, SF Pro): ratio near 1:1. Optimized for screen rendering at all sizes.
   - **Decision rule**: Body text on screen requires low to medium contrast. High contrast is display-only.

6. **Use optical sizing when available.** The same letterforms need different treatments at different sizes — this is not merely scaling.
   - At **text sizes** (9-14px): thicker strokes, wider spacing, larger x-height, open counters
   - At **display sizes** (24px+): thinner strokes, tighter spacing, more contrast, refined details
   - **Apple SF Pro** implements this with distinct text and display optical sizes; the cut switches at 20pt
   - **Inter** uses automatic optical sizing via OpenType `opsz` axis (available in variable font)
   - **Roboto Flex** provides continuous optical sizing from 8pt to 144pt via its variable font axis
   - If your font lacks optical sizing, manually adjust letter-spacing: add +0.02em at 12px, remove -0.01em at 48px

## Details

### How Anatomy Affects UI Decisions

Font metrics directly impact layout calculations. Two fonts set at 16px can produce visually different results:

- **Inter at 16px**: x-height of 11.3px (0.756 \* 14.94 UPM-scaled cap height). Ascenders reach ~17.2px. Descenders reach ~-4.3px. Total vertical extent: ~21.5px.
- **Garamond at 16px**: x-height of 8.6px (0.630 \* 13.65 UPM-scaled cap height). Text appears significantly smaller despite identical font-size value.

This is why switching fonts without adjusting sizes produces layouts that "break" — the visual weight shifts even though the CSS value has not changed. When replacing one typeface with another, always compare x-height ratios and adjust font-size proportionally: `new_size = old_size * (old_x_ratio / new_x_ratio)`.

### Metrics That Matter for Design Systems

When building a design system, document these metrics for your chosen typeface:

| Metric                    | What It Controls               | Typical Range    |
| ------------------------- | ------------------------------ | ---------------- |
| x-height ratio            | Perceived size, readability    | 0.63-0.76        |
| Cap-to-ascender overshoot | Vertical rhythm predictability | 2-8% above cap   |
| Descender depth           | Line-height requirements       | 15-30% of em     |
| Average character width   | Characters per line (measure)  | 45-65% of em     |
| Tabular figure width      | Data table alignment           | Fixed across 0-9 |

### Stripe's Typography Anatomy in Practice

Stripe uses `sohne-var` (a variable font by Klim Type Foundry) with these anatomical characteristics:

- **Weight 300** as the signature headline weight — lighter than convention, projecting confidence and sophistication
- **Moderate x-height** (~0.71 ratio) balancing elegance with screen readability
- **OpenType feature `ss01`** activated across all text for alternate character forms
- **Negative letter-spacing** at display sizes: -1.4px at 56px, progressively relaxing to 0 at body size — compensating for the optical illusion that large text appears more widely spaced
- **Two-weight simplicity**: 300 (body/headings) and 400 (UI elements/buttons), creating hierarchy through minimal means

### Apple's Optical Sizing System

Apple SF Pro demonstrates best-in-class optical sizing:

- **SF Pro Text** (below 20pt): wider letter spacing, heavier stroke weight, larger x-height proportion, open apertures
- **SF Pro Display** (20pt and above): tighter letter spacing, refined stroke weight, more contrast in thick/thin strokes
- **SF Mono** for code: matches SF Pro's x-height and vertical metrics so code and UI text align on the same baseline grid
- **New York** (serif companion): designed with matching metrics to SF Pro so the two can be mixed without vertical rhythm disruption

### Anti-Patterns

1. **Display fonts at body size.** Decorative or high-contrast typefaces (Playfair Display, Abril Fatface, Bodoni) have thin hairline strokes that become invisible below 18px on screen. The result is broken, unreadable body text that appeared fine in a mockup at 200% zoom. Rule: if the font has "Display" in its name, never use it below 24px.

2. **Ignoring x-height when comparing fonts.** Georgia at 16px reads larger than Futura at 16px because Georgia's x-height ratio is 0.698 vs Futura's 0.653. Designers who swap fonts without adjusting sizes get layouts that "shrink" or "grow" unpredictably. Always compare x-height ratios and compensate: if switching from Inter (0.756) to Garamond (0.630), increase font-size by ~20% to maintain visual equivalence.

3. **Treating all sans-serifs as interchangeable.** Helvetica, Inter, Roboto, and Futura are all "sans-serif" but have fundamentally different anatomies. Helvetica has closed apertures and uniform stroke widths (grotesque); Inter has open apertures and optical sizing (neo-grotesque); Futura has geometric construction based on circles (geometric); Fira Sans has calligraphic stroke variation (humanist). Substituting one for another changes readability, personality, and spacing.

4. **Ignoring variable font axes.** Modern variable fonts like Inter, Roboto Flex, and SF Pro expose `wght`, `opsz`, `wdth`, and `slnt` axes. Using a static 400-weight file when the variable font could provide precise weight tuning (e.g., 350 for a specific hierarchy level) wastes the typeface's capabilities. Check available axes at `fonts.google.com` before defaulting to static files.

### Real-World Examples

**Inter (Rasmus Andersson, 2017-present)**
Designed specifically for computer screens. Key anatomical decisions:

- X-height ratio of 0.756 — among the tallest in professional sans-serifs
- Open apertures on `c`, `e`, `s` for character differentiation at 11px+
- Tabular figures enabled by default for data alignment
- Variable font with `wght` (100-900) and `opsz` (14-32) axes
- Used by: GitHub, Figma, Mozilla, thousands of design systems

**Roboto Flex (Google, 2022)**
The most parametric variable font in production:

- 13 variation axes including `wght`, `wdth`, `opsz`, `GRAD` (grade), `XTRA` (x-axis tracking)
- Optical size range from 8pt to 144pt — automatically adjusts stroke weight, spacing, and proportions
- Material Design 3's type system is built entirely on Roboto Flex
- Demonstrates that one variable font file can replace an entire type specimen

**Vercel Geist (Vercel, 2023)**
A typeface engineered for developer tooling and dashboard interfaces:

- Geist Sans: neo-grotesque with tight tracking for information-dense UI
- Geist Mono: monospace companion with identical x-height for seamless code-to-prose mixing
- Both designed as variable fonts with weight axis 100-900
- Character set includes programming ligatures in the mono variant
- Demonstrates the modern trend of companies commissioning typefaces optimized for their specific UI density and context

## Source

- Bringhurst, Robert. _The Elements of Typographic Style_, version 4.0
- Andersson, Rasmus. Inter typeface design notes — https://rsms.me/inter/
- Apple Human Interface Guidelines — Typography
- Google Fonts Knowledge — https://fonts.google.com/knowledge
- Material Design 3 Type System — https://m3.material.io/styles/typography

## Process

1. **Evaluate** — Examine the typeface selection against the context: screen or print, body or display, data-dense or editorial. Check x-height ratio, aperture openness, stroke contrast, and optical sizing availability.
2. **Apply** — Set type using the anatomical knowledge: choose optical sizes correctly, compensate for x-height differences when switching fonts, use variable font axes where available.
3. **Verify** — Confirm readability at the target size on the target device. Check that counters remain open, strokes remain visible, and letterforms remain distinguishable at the smallest intended size.

## Harness Integration

This is a knowledge skill. When activated, it provides typographic anatomy expertise to guide font selection and configuration decisions. It does not modify files directly. Use the principles here when evaluating `font-family`, `font-size`, `font-variation-settings`, and `letter-spacing` values in any design system or component library.

## Success Criteria

- Font selection is justified by measurable anatomy: x-height ratio, aperture type, stroke contrast level
- Optical sizes are used correctly — text cuts for body, display cuts for headings
- Variable font axes are leveraged when available instead of loading multiple static files
- No display or decorative typeface is used at body text sizes (below 24px)
- Font size changes between typefaces account for x-height ratio differences
