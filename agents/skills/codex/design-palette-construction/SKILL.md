# Palette Construction

> Building functional palettes — primary/secondary/accent selection, neutral scales, semantic colors, and tint/shade generation for production design systems

## When to Use

- Building a color system for a new product or design system from scratch
- Extending an existing brand color into a full functional palette
- Creating tint/shade scales for a component library
- Defining semantic color tokens (success, warning, error, info)
- Generating a neutral gray scale with intentional warm or cool undertone
- Auditing a palette for missing functional roles (no accent, no semantic, incomplete neutral scale)
- Migrating from ad-hoc color values to a systematic, tokenized palette
- Building a palette that must support both light and dark modes

## Instructions

1. **Understand palette anatomy.** Every production palette has five functional categories. Missing any category forces ad-hoc color decisions that erode consistency:

   | Category      | Role                                                                    | Typical Count           | Example (Stripe)                                                          |
   | ------------- | ----------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
   | **Primary**   | Brand identity, primary CTAs, key interactive elements                  | 1 color + 10-step scale | Purple `#533afd`                                                          |
   | **Secondary** | Supporting brand elements, secondary buttons, active states             | 0-1 color + scale       | (Stripe uses navy `#061b31` structurally, not as a secondary brand color) |
   | **Accent**    | Decorative highlights, illustrations, marketing flourishes              | 0-2 colors              | Ruby `#ea2261`, Magenta `#f96bee`                                         |
   | **Neutral**   | Text, backgrounds, borders, dividers, shadows — the structural backbone | 1 scale of 10-13 steps  | Slate gray scale from near-white to near-black                            |
   | **Semantic**  | Status communication (success, warning, error, info)                    | 4 colors + scales       | Green/amber/red/blue, each with 3-5 variants                              |

2. **Generate tint/shade scales using perceptually uniform steps.** A 10-step scale from 50 (lightest) to 950 (darkest) is the industry standard. Do not interpolate linearly in RGB — the results are perceptually uneven. Use HSL lightness interpolation at minimum, or OKLCH/CIELAB for perceptual uniformity.

   **Tailwind CSS's approach:** Tailwind generates its color scales (50, 100, 200, ... 900, 950) with perceptual uniformity as the goal. Each step represents an approximately equal perceived lightness shift. The 500 step is the "base" — the color as you would name it in conversation ("that's blue"). Steps below 500 are tints (mixed toward white), steps above are shades (mixed toward black).

   **Practical generation procedure:**
   - Start with your base color (e.g., Primary 500 = `#533afd`)
   - Generate lightness stops: 50 (L:97%), 100 (L:93%), 200 (L:86%), 300 (L:76%), 400 (L:64%), 500 (L:50%), 600 (L:40%), 700 (L:32%), 800 (L:24%), 900 (L:17%), 950 (L:10%)
   - Adjust saturation: tints (50-300) reduce saturation by 10-30% to avoid pastel fluorescence; shades (700-950) reduce saturation by 5-15% to avoid muddy darkness
   - Verify each step has sufficient contrast against both white and black backgrounds for its intended use

3. **Build the neutral scale with intentional undertone.** Pure gray (`hsl(0, 0%, X%)`) is emotionally sterile. Every respected design system tints its neutrals:
   - **Tailwind Slate:** Blue undertone (hue ~215, S:15-25%) — cool, technical, modern
   - **Tailwind Zinc:** Blue-violet undertone (hue ~240, S:3-8%) — nearly true neutral with slight cool bias
   - **Tailwind Stone:** Warm undertone (hue ~25, S:5-10%) — earthy, editorial, organic
   - **Stripe:** Slate-blue undertone matching their navy brand — creates chromatic unity between colored and "gray" elements

   Decision procedure: match neutral undertone to your primary color's hue family. If primary is blue, use cool neutrals (Slate). If primary is orange or red, use warm neutrals (Stone). This creates subliminal harmony between the structural gray and the chromatic brand.

4. **Define semantic colors independently from brand colors.** Semantic colors must be recognizable regardless of brand context. Never reuse your primary brand color as a semantic color — if your brand is green, your "success" green must be a different green (shifted in hue, saturation, or lightness) so users do not confuse brand elements with success states.

   **Standard semantic mapping:**
   - **Success:** Green (hue 120-160). Tailwind: `#22c55e` (green-500). Material: `#4caf50`.
   - **Warning:** Amber/yellow (hue 35-50). Tailwind: `#f59e0b` (amber-500). Material: `#ff9800`.
   - **Error/Destructive:** Red (hue 0-15). Tailwind: `#ef4444` (red-500). Material: `#f44336`.
   - **Info:** Blue (hue 200-220). Tailwind: `#3b82f6` (blue-500). Material: `#2196f3`.

   Each semantic color needs at least 3 variants: a strong variant (for filled backgrounds/badges), a subtle variant (for tinted backgrounds), and a text variant (for inline status text). Example for error: `error-500` for filled badges, `error-50` for background tints, `error-700` for text on light backgrounds.

5. **Apply the 60-30-10 rule at the palette level.** This is a surface area budget, not a color count:
   - **60% — Neutrals.** Backgrounds, text, borders, dividers. This is your neutral scale doing the structural work.
   - **30% — Primary/Secondary.** Brand presence through headings, navigation, cards, section backgrounds.
   - **10% — Accent + Semantic.** Buttons, links, badges, status indicators. The scarcity makes them visually powerful.

   Stripe's implementation: approximately 60% white/light gray (neutral), 30% navy text and dark sections (primary structural), 10% purple for interactive elements and semantic colors for states. This distribution makes the purple CTAs unmissable precisely because they are rare.

6. **Test the complete palette in a component matrix.** Before finalizing, render your palette across these components: button (primary, secondary, ghost, destructive), input (default, focused, error, disabled), card (default, elevated, selected), badge (success, warning, error, info), text (heading, body, secondary, disabled). If any component looks wrong, the palette has a gap.

## Details

### Material Design 3's HCT Color Space

Material Design 3 introduced the HCT (Hue, Chroma, Tone) color space for palette generation. HCT separates three perceptually independent dimensions:

- **Hue** (0-360): the color family
- **Chroma** (0-~120): colorfulness (similar to saturation but perceptually uniform)
- **Tone** (0-100): lightness from black (0) to white (100)

From a single seed color, MD3 generates:

- **Primary palette:** Seed hue, full chroma, tones 0-100
- **Secondary palette:** Seed hue, chroma reduced by ~67%, same tones
- **Tertiary palette:** Hue shifted +60 degrees, moderate chroma, same tones
- **Neutral palette:** Seed hue, chroma reduced to ~4, same tones
- **Neutral variant:** Seed hue, chroma reduced to ~8, same tones

This algorithmic approach guarantees harmony because every palette shares a hue relationship with the seed. The tonal system maps directly to accessibility: Tone 40 on Tone 100 (white) guarantees 7:1+ contrast; Tone 80 on Tone 10 guarantees similar contrast in dark mode.

### Palette Sizing: How Many Colors Are Enough?

A common trap is building either too few colors (everything is a one-off) or too many (the palette is an unusable rainbow). Guidelines by product type:

- **Marketing site / landing page:** 1 primary + 1 neutral scale + semantics = ~30 total values. Minimal UI, maximum brand impact.
- **SaaS application / dashboard:** 1 primary + 1 secondary + 1 neutral scale + semantics = ~50-60 total values. Enough for complex UI without confusion.
- **Design system / component library:** 1-2 primary + 1 neutral scale + semantics + 2-3 extended accent scales = ~80-100 total values. Covers all possible component states.
- **Data visualization addition:** Add 6-8 categorical colors, each with 3 variants (strong, medium, subtle) = ~24 additional values.

Stripe's public-facing palette contains approximately 60 total color values. Tailwind CSS ships approximately 220 (22 hues x 10 steps + black/white). Material Design 3 generates approximately 130 from a single seed.

### Anti-Patterns

1. **Too Many Primaries.** Having 3+ "brand colors" that all compete for attention. Symptoms: every page section uses a different bold color, and no single color owns the "primary action" role. Fix: one color is primary (owns buttons and links), at most one is secondary (owns navigation or section backgrounds), everything else is accent (illustrations only) or neutral. Spotify has one primary (green). Stripe has one primary (purple). Apple has zero chromatic primaries (achromatic).

2. **Missing Neutral Scale.** Using only 2-3 grays (`#333`, `#666`, `#999`) instead of a full 10+ step scale. Symptoms: text hierarchy feels flat, borders blend into backgrounds, disabled states are indistinguishable from secondary text. Fix: generate a full 10-step neutral scale with intentional undertone. Even a simple project needs at least 7 neutral steps: background, surface, border, disabled, tertiary text, secondary text, primary text.

3. **Semantic Ambiguity.** Using the same green for both "success" and "go/proceed" — or worse, using the brand green as the success color. Symptoms: users cannot tell if a green badge means "success" or is just brand decoration. Fix: semantic colors must be visually distinct from brand colors. If your brand is green, shift your success green to a different hue (more teal or more lime) or use a different lightness level.

4. **Tint/Shade Scale Gaps.** Having a base color and a light variant but nothing in between. Symptoms: hover states use opacity hacks (`rgba(primary, 0.1)`) instead of real palette steps, dark mode has no intermediate surface colors. Fix: generate the full 10-step scale for every primary and semantic color. The intermediate steps (200-400, 600-800) are what make a palette feel production-ready.

5. **RGB Interpolation.** Generating tints and shades by linearly interpolating in RGB color space. Symptoms: midpoint colors look muddy or desaturated (the "brown muddle" when mixing blue and orange). Fix: interpolate in HSL at minimum, OKLCH or CIELAB for best perceptual results. Modern tools (Figma, the `oklch()` CSS function) support perceptually uniform interpolation natively.

### Real-World Examples

**Tailwind CSS — The Reference Scale.** Tailwind's color system provides 22 named color families, each with 11 stops (50-950). The scales are designed for perceptual uniformity: stepping from gray-200 to gray-300 looks like the same lightness jump as gray-600 to gray-700. Each 100-step represents approximately 7-10% lightness change in OKLCH space. The 500 stop is always the "name-worthy" shade — the color you would call "blue" or "red" in conversation. This makes the system predictable: if you need a lighter version, go down the scale; darker, go up.

**Stripe — Functional Minimalism.** Stripe's palette demonstrates that a world-class design system does not need many colors. The functional palette: purple `#533afd` (primary), navy `#061b31` (structural text), a slate-blue neutral scale (backgrounds, borders, secondary text), and standard semantics (red error, green success, amber warning, blue info). Decorative colors (ruby `#ea2261`, magenta `#f96bee`, cyan, green gradients) exist only in marketing illustrations and the homepage gradient — they never appear in the product dashboard. This discipline keeps the product interface clean while the marketing surface feels vibrant.

**Material Design 3 — Algorithmic Generation.** MD3 proves that a full production palette can be generated algorithmically from a single color. Input: one hex value (e.g., `#6750A4`). Output: 5 tonal palettes (primary, secondary, tertiary, neutral, neutral-variant) x 13 tones each = 65 color values, plus semantic colors. Every generated color is guaranteed to meet contrast requirements when used at its designated tone pairing (e.g., "on-primary" text at Tone 100 on primary container at Tone 90). This eliminates manual contrast checking for standard component combinations.

## Source

- Material Design 3 Color System — https://m3.material.io/styles/color/the-color-system
- Tailwind CSS Color Palette — https://tailwindcss.com/docs/colors
- RefactoringUI — "Building Your Color Palette" chapter
- OKLCH Color Space — https://oklch.com/ — perceptually uniform space for palette generation

## Process

1. Select your primary brand color and determine the harmony type (from design-color-harmony). Generate the full 10-step tint/shade scale.
2. Build the neutral scale with undertone matching the primary hue. Add semantic colors (success, warning, error, info) with 3+ variants each.
3. Test the complete palette in a component matrix (button, input, card, badge, text). Verify 60-30-10 distribution in a representative layout.
4. Document every color value with its functional role, contrast relationships, and usage guidelines.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **Pairs with:** design-color-harmony (harmony type determines how many chromatic scales to generate), design-color-accessibility (palette must pass colorblind simulation), design-dark-mode-color (palette must have dark mode variants), design-token-architecture (palette values become design tokens).
- **Sequencing:** Use after design-color-harmony and design-color-psychology have established direction. This skill produces the concrete palette values that all other skills reference.

## Success Criteria

- The palette has all five functional categories: primary, secondary (optional), accent (optional), neutral, and semantic.
- Every chromatic color has a full 10-step tint/shade scale (50-950), not just a base value.
- The neutral scale has an intentional undertone matching the primary hue family.
- Semantic colors are visually distinct from brand colors — no ambiguity between "brand" and "status."
- The 60-30-10 distribution is observable in representative layouts.
- Every palette step has documented contrast ratios against white, black, and the palette's own background colors.
- The palette renders correctly across the component matrix (button, input, card, badge, text).
- Tint/shade generation uses perceptually uniform interpolation (HSL minimum, OKLCH preferred), not RGB.
- The palette supports both light and dark modes through tone-based mapping (not simple inversion).
- Total palette size is appropriate for the product type (30-60 for marketing sites, 50-80 for SaaS, 80-100 for design systems).
- No opacity hacks (rgba with alpha) are needed for standard states — the scale provides real values for hover, pressed, and disabled states.
- Palette documentation includes functional role for every color (not just hex values without context).
- The palette has been tested in a component matrix across all standard component types.
- Intermediate scale steps (200-400, 600-800) exist and serve distinct functional purposes.
