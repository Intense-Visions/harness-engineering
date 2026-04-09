# Color Harmony

> Color wheel relationships — complementary, analogous, triadic, split-complementary, tetradic schemes with usage guidance for building cohesive palettes

## When to Use

- Selecting a color scheme for a new product, brand, or marketing page
- Evaluating whether an existing palette has structural coherence or is arbitrary
- Adding accent or secondary colors to an established brand palette
- Diagnosing why a color combination feels discordant or chaotic
- Building theme variations (seasonal campaigns, sub-brands) from a base hue
- Designing data visualizations that need multiple distinguishable series colors
- Creating dark mode or alternate theme palettes that maintain the same harmony relationships
- Reviewing a teammate's color choices for structural coherence

## Instructions

1. **Identify the dominant hue.** Every harmonious scheme starts from one anchor. Place it on a 360-degree HSL/HSB wheel. Stripe anchors on purple at approximately 262 degrees (`#533afd`, HSL 253/98%/61%). Vercel anchors on neutral black (achromatic), which means any chromatic accent automatically becomes the dominant hue.

2. **Select a harmony type based on communication goals.**

   | Scheme                   | Wheel Geometry                               | Tension                | Best For                                           |
   | ------------------------ | -------------------------------------------- | ---------------------- | -------------------------------------------------- |
   | **Complementary**        | 180 degrees apart                            | High contrast, vibrant | CTAs against backgrounds, hero sections            |
   | **Analogous**            | Within 30-60 degrees                         | Low tension, cohesive  | Editorial, dashboards, reading-heavy UI            |
   | **Triadic**              | 120 degrees apart                            | Balanced energy        | Playful brands, children's products, illustrations |
   | **Split-Complementary**  | Base + two colors adjacent to its complement | Moderate tension       | Most versatile for UI — contrast without clashing  |
   | **Tetradic (Rectangle)** | Two complementary pairs                      | Maximum variety        | Complex data visualization, multi-brand systems    |

3. **Coordinate value and saturation, not just hue.** Two colors can be harmonious on the wheel but clash violently if one is fully saturated (S:100%, L:50%) and the other is a muted pastel (S:30%, L:85%). Rule: keep saturation within a 20% range across scheme members, or deliberately use one saturated focal point with all others desaturated.

4. **Apply the 60-30-10 distribution.** Assign your scheme colors by visual weight:
   - **60%** — Dominant (backgrounds, large surfaces). Typically the least saturated.
   - **30%** — Secondary (cards, sections, supporting elements).
   - **10%** — Accent (buttons, links, badges, interactive highlights).

   Stripe applies this: ~60% white/light gray backgrounds, ~30% deep navy (`#061b31`) for text and headings, ~10% purple (`#533afd`) for CTAs and interactive elements.

5. **Test harmony under real conditions.** Place scheme colors in actual UI patterns (nav bar, card, button, form) before committing. A scheme that looks balanced as swatches can fail when one color dominates surface area.

6. **Use temperature to reinforce hierarchy.** Warm colors (red, orange, yellow — 0-60 degrees and 300-360 degrees) advance visually. Cool colors (blue, green, violet — 120-270 degrees) recede. Place warm accents on cool backgrounds for natural visual pop. Material Design 3 uses this: warm error reds on cool gray surfaces create immediate attention without competing for spatial dominance.

7. **Validate with a grayscale test.** Convert your palette to grayscale (desaturate completely). If your design still communicates hierarchy — if you can tell primary from secondary from background — your value structure is sound and the harmony will hold. If the grayscale version is an undifferentiated blob, your scheme relies on hue alone and will fail for colorblind users and in low-saturation contexts.

8. **Limit chromatic colors ruthlessly.** Most successful digital products use 1-2 chromatic hues plus a neutral scale plus semantic colors (success, warning, error). Stripe: 1 chromatic (purple) + neutrals. Vercel: 1 chromatic (blue) + neutrals. Linear: 1 chromatic (blue-violet) + neutrals. The pattern is clear — restraint is the hallmark of professional design.

## Details

### The Five Harmony Types in Practice

**Complementary (180 degrees).** The highest-contrast chromatic pairing. Spotify uses a near-complementary scheme: green (`#1DB954`, hue 141) against dark near-blacks with occasional warm coral accents. The green pops because it sits isolated against the achromatic background — a simplified complementary relationship where black serves as the "opposite pole." When using true complements (e.g., blue 220 degrees and orange 40 degrees), desaturate one side or the vibration at the boundary becomes physically uncomfortable (simultaneous contrast).

**Analogous (30-60 degrees).** The safest, most naturally cohesive scheme. Vercel's design system operates in an analogous-to-monochromatic range: pure white, cool grays (hue ~220, S:5-15%), and blue-tinted accents (`#0070F3`, hue 214). The entire system lives within a 30-degree arc of blue. This creates effortless harmony but requires careful contrast management — analogous schemes can become muddy if values are too similar.

**Triadic (120 degrees).** Three equidistant hues produce balanced but energetic schemes. Google's original brand identity uses a near-triadic base: blue (`#4285F4`, hue 217), red (`#EA4335`, hue 5), and yellow (`#FBBC04`, hue 45) — roughly 120 degrees apart with green (`#34A853`, hue 142) as a fourth accent. This works for Google because the brand identity is deliberately playful and multi-dimensional. For most product UIs, triadic schemes are too energetic for sustained use — reserve them for illustrations, empty states, or marketing.

**Split-Complementary.** Take your base hue, find its complement, then use the two hues 30 degrees on either side of that complement. This delivers contrast similar to complementary but with less visual tension. If your primary is blue (220 degrees), the complement is orange (40 degrees), and the split takes yellow-orange (25 degrees) and red-orange (55 degrees). Airbnb uses a split-complementary-adjacent approach: coral-pink primary (`#FF5A5F`, hue 358), with teal (`#00A699`, hue 174) and dark charcoal as supporting colors — the teal sits near the complement of coral.

**Tetradic / Rectangle.** Two complementary pairs forming a rectangle on the wheel. Material Design 3's dynamic color system generates tetradic-like palettes from a single seed: primary, secondary (analogous shift), tertiary (complementary region), and error (fixed red). This is the most complex scheme and requires strict hierarchy — one pair must dominate, the other must be subordinate, or the result is visual chaos.

**Monochromatic (single hue, varied value/saturation).** Technically the simplest harmony — one hue explored through its full tint/shade range. Linear uses this: their blue-violet primary generates all UI states through lightness variation alone (dark for text, medium for icons, light for backgrounds, saturated for buttons). Monochromatic schemes are failsafe for harmony but require strong contrast discipline to maintain hierarchy — since hue provides no differentiation, value must do all the work.

### Simultaneous Contrast and Vibration

When two saturated complements share a boundary at similar lightness, the edge appears to vibrate — a neurological artifact called simultaneous contrast. This is physically fatiguing and makes text unreadable. Solutions:

- **Insert a neutral separator.** A 1-2px white, black, or gray border between complements eliminates vibration. Stripe never places `#533afd` purple directly against a warm hue — there is always a white or dark neutral buffer.
- **Desaturate one side.** If blue is S:90%, make its orange complement S:40% or lower. The asymmetry removes the vibration while preserving the chromatic tension.
- **Shift lightness apart.** Complements at L:50% and L:50% vibrate. Shift one to L:30% and the other to L:70% — the lightness difference overrides the hue clash.

### Choosing a Scheme: Decision Procedure

Use this procedure when you are unsure which harmony type to apply:

1. **Count the distinct functional roles** needing color (primary action, secondary action, navigation, status, decorative). If 1-2, use analogous. If 3, use split-complementary. If 4+, use tetradic with strict hierarchy.
2. **Assess the brand personality.** Conservative/professional brands (finance, healthcare, legal) use analogous or monochromatic. Energetic/playful brands (gaming, social, children's) use triadic or complementary. Technology/premium brands use complementary with heavy neutral dominance.
3. **Evaluate the content density.** High-density interfaces (dashboards, data tables, IDEs) need analogous schemes — multiple chromatic hues create noise. Low-density interfaces (landing pages, portfolios) can support split-complementary or triadic schemes because there is white space to absorb the energy.

### Temperature and Perceived Weight

Warm colors feel heavier, closer, and more urgent. Cool colors feel lighter, more distant, and calmer. This is physiological — warm wavelengths cause slightly higher arousal. Use temperature strategically:

- **Navigation and structure:** Cool tones (recede, feel stable)
- **Actions and alerts:** Warm tones (advance, demand attention)
- **Stripe's approach:** Cool navy (`#061b31`) for structural text, warm purple (`#533afd`) for actions — the temperature shift reinforces the hierarchy without needing extreme lightness contrast.
- **Apple's approach:** Apple uses a near-achromatic interface (cool grays, white) so that any product photography or UI color becomes the thermal focal point. Their system blue (`#007AFF`) is cool but highly saturated — it acts as a warm-relative accent against the cooler, desaturated surroundings.

### Anti-Patterns

1. **Rainbow Effect.** Using 5+ unrelated hues with no wheel relationship. Symptoms: the interface looks like a carnival. Fix: reduce to a single harmony type with 2-3 chromatic colors maximum, plus neutrals. Every chromatic color must justify its presence through a wheel relationship.

2. **False Harmony.** Colors that are technically related on the wheel (e.g., triadic) but clash because saturation and lightness are uncoordinated. Example: pairing `hsl(0, 100%, 50%)` (pure red) with `hsl(120, 40%, 80%)` (pale sage green) — triadic on paper, discordant in practice. Fix: equalize saturation within 15-20% and align lightness to a shared range.

3. **Ignoring Value Structure.** Selecting hues from the wheel without considering lightness. Two hues at identical lightness (e.g., both at L:50%) create ambiguity — neither dominates, and the eye bounces between them. Fix: establish a clear light-dark hierarchy first, then map hues onto that value structure. Primary actions should be the darkest or most saturated element; backgrounds should be the lightest or most neutral.

4. **Accent Overload.** Using the accent color (10% allocation) across 30%+ of the interface. When everything is highlighted, nothing is. Stripe uses purple on fewer than 10% of pixels — buttons, links, active states. The restraint is what makes those elements stand out.

5. **Harmony Without Function.** Selecting colors purely for aesthetic harmony without assigning functional roles. Every color in a production palette must answer: "What does this color _mean_ in the interface?" If a color exists only because it completes the triadic scheme but has no UI role, remove it — unused scheme members add visual noise when they inevitably leak into edge cases.

### Real-World Examples

**Material Design 3 — Seed-Based Harmony.** MD3 generates an entire palette from a single seed color using the HCT (Hue, Chroma, Tone) color space. A seed of blue (hue 282) produces: Primary (T40 for light, T80 for dark), Secondary (hue shifted +15 degrees, reduced chroma), Tertiary (hue shifted +60 degrees), and Neutral (same hue, near-zero chroma). This is algorithmic analogous harmony — every color shares a perceptual relationship through the seed.

**Stripe — Controlled Complementary.** Stripe's palette is structurally a warm-cool complementary scheme compressed into near-achromatic territory: deep navy (`#061b31`, blue-hue 213 at very low lightness) as the "cool" anchor, and violet-purple (`#533afd`, hue 253) as the "warm-leaning" accent. The decorative palette extends with ruby (`#ea2261`) and magenta (`#f96bee`) — these warm hues complement the cool structural colors but appear only in illustrations and gradients, never in UI chrome.

**Vercel — Monochromatic Discipline.** Vercel's Geist design system operates almost entirely within achromatic space: pure white (`#FFFFFF`), a carefully stepped gray scale, and pure black (`#000000`). The sole chromatic accent is Vercel Blue (`#0070F3`), which carries all interactive and highlight duties. This extreme monochromatic restraint means the single blue accent has enormous visual authority — it does not compete with any other chromatic hue. The lesson: when your harmony type is monochromatic, your single accent color becomes maximally powerful because it owns the entire chromatic channel.

**Spotify — Complementary Isolation.** Spotify Green (`#1DB954`) sits at hue 141 — a mid-green. Against the near-black backgrounds (`#121212`, `#191414`), the green functions as a complementary accent against the implicit warm associations of the dark surface (dark surfaces with slight warm tinting feel cozy). Spotify reinforces this by using warm album art photography as background imagery, creating a natural complementary tension between the cool green UI chrome and the warm content. The green is used sparingly — play button, progress bar, "Follow" CTAs — at well under 10% of surface area.

### Harmony in Multi-Brand Systems

When a product supports multiple tenants or sub-brands (white-label SaaS, marketplace platforms), each brand needs its own palette that still feels at home in the shared chrome. The solution is to fix the harmony type and neutral scale, then allow only the primary hue to change per brand. Shopify's admin uses this: the structural UI is fixed neutral gray, and each merchant's brand color slots into the accent role. The harmony type (monochromatic with single accent) stays constant — only the hue rotates.

For data-heavy multi-brand dashboards, assign each brand a hue from an evenly-spaced tetradic or higher-order scheme, then reduce all to the same saturation (S:60-70%) and lightness (L:45-55%) to ensure equal visual weight. No brand should appear louder than another due to an accidentally more saturated hue.

## Source

- Itten, J. — _The Art of Color_ (1961), foundational color wheel theory
- Munsell Color System — value/chroma/hue separation framework
- Material Design 3 Color System — https://m3.material.io/styles/color
- Tailwind CSS Color Palette — perceptually uniform scale methodology
- Albers, J. — _Interaction of Color_ (1963), simultaneous contrast and relative color perception

## Process

1. Read the instructions and harmony type reference in this document. Pay particular attention to the decision procedure in the Details section.
2. Identify your dominant hue, run the decision procedure (functional role count, brand personality, content density) to select a harmony type, and apply the 60-30-10 distribution rule.
3. Verify your palette passes the grayscale test, the simultaneous contrast check, and does not exhibit any of the five listed anti-patterns.
4. Test the scheme in actual UI components (not just swatch grids) before committing to implementation.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **Pairs with:** design-palette-construction (for building production-ready scales from harmony choices), design-color-psychology (for emotional resonance of chosen hues), design-contrast-ratio (for ensuring harmony choices meet accessibility thresholds).
- **Sequencing:** Use this skill first to establish the harmonic structure, then design-palette-construction to generate tint/shade scales, then design-contrast-ratio to verify accessibility, then design-color-accessibility to add redundant encoding.
- **Decision input:** The harmony type selected here determines how many chromatic hues the palette can support, which directly constrains design-palette-construction choices.

## Success Criteria

- The color scheme uses an identifiable harmony type (complementary, analogous, triadic, split-complementary, or tetradic) — not arbitrary hue selection.
- You can name the harmony type when asked — if you cannot, the scheme is likely arbitrary.
- Saturation and lightness are coordinated across scheme members (within 20% saturation range unless deliberately focal).
- The 60-30-10 distribution rule is applied, with accent color usage below 15% of total surface area.
- No more than 3 chromatic hues are used in the UI palette (plus neutrals and semantic colors).
- The grayscale test passes — hierarchy is visible even without color.
- Every chromatic color has an assigned functional role (action, navigation, status, brand). No orphan colors.
- The scheme passes visual testing in actual UI layouts, not just swatch grids.
- No simultaneous contrast vibration occurs at color boundaries — verified by visual inspection at 100% zoom.
- Temperature relationships reinforce hierarchy — warm for actions/alerts, cool for structure/navigation.
- The palette works in both light and dark contexts (harmony relationships hold across themes).
- Each harmony choice is documented with the specific wheel geometry (e.g., "split-complementary from base hue 253").
