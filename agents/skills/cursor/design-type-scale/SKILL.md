# Type Scale

> Mathematical type scales — modular, major third, perfect fourth, golden ratio, custom scales, and when each is appropriate

## When to Use

- Establishing font sizes for a new design system or component library
- Auditing an existing system that has accumulated arbitrary font sizes
- Choosing heading sizes that create clear visual hierarchy without guesswork
- Adapting a type scale for different contexts (marketing site vs data dashboard)
- Translating a designer's type ramp into a developer token system

## Instructions

1. **Start with a base size.** The base size is the body text size — the most frequently read text in your interface. For web, the standard is **16px** (1rem). Do not change this without strong justification; browsers default to 16px, accessibility tools assume it, and the entire rem system depends on it.

2. **Choose a ratio based on content density.** A type scale multiplies the base size by a ratio at each step. The ratio determines how dramatically sizes increase between levels:

   | Ratio | Name             | Factor     | Use Case                              |
   | ----- | ---------------- | ---------- | ------------------------------------- |
   | 1.067 | Minor second     | Tight      | Data-dense dashboards, admin panels   |
   | 1.125 | Major second     | Compact    | Documentation, technical interfaces   |
   | 1.200 | Minor third      | Moderate   | General-purpose web applications      |
   | 1.250 | Major third      | Balanced   | Content sites, blogs, marketing       |
   | 1.333 | Perfect fourth   | Expressive | Editorial, storytelling               |
   | 1.414 | Augmented fourth | Dramatic   | Landing pages, single-message layouts |
   | 1.500 | Perfect fifth    | Bold       | Hero sections, splash screens         |
   | 1.618 | Golden ratio     | Extreme    | High-impact single headlines only     |

   **Decision procedure**: Count the distinct hierarchy levels visible on your densest page. If you need 6+ levels to remain distinguishable, use a tighter ratio (1.125-1.200). If you need only 3-4 levels, use a wider ratio (1.250-1.414).

3. **Generate the scale.** From a 16px base with a major third ratio (1.250):

   | Step | Calculation   | Value | Rounded | Token Name |
   | ---- | ------------- | ----- | ------- | ---------- |
   | -2   | 16 / 1.250^2  | 10.24 | 10px    | text-xs    |
   | -1   | 16 / 1.250    | 12.80 | 13px    | text-sm    |
   | 0    | 16 \* 1.000   | 16.00 | 16px    | text-base  |
   | +1   | 16 \* 1.250   | 20.00 | 20px    | text-lg    |
   | +2   | 16 \* 1.250^2 | 25.00 | 25px    | text-xl    |
   | +3   | 16 \* 1.250^3 | 31.25 | 31px    | text-2xl   |
   | +4   | 16 \* 1.250^4 | 39.06 | 39px    | text-3xl   |
   | +5   | 16 \* 1.250^5 | 48.83 | 49px    | text-4xl   |

   Round to whole pixels for simplicity. The mathematical relationship matters more than exact precision — it creates **visual rhythm** that the eye perceives as coherent.

4. **Map scale steps to semantic roles.** Do not expose raw step numbers to consumers. Map each step to a purpose:
   - **body** (step 0): paragraphs, descriptions, form labels
   - **body-small** (step -1): captions, footnotes, metadata
   - **heading-3** (step +1 or +2): subsection headings
   - **heading-2** (step +2 or +3): section headings
   - **heading-1** (step +3 or +4): page titles
   - **display** (step +4 or +5): hero headlines, marketing

5. **Constrain the total number of sizes.** A well-functioning type scale has **6-10 distinct sizes**. Fewer than 6 limits hierarchy expression. More than 10 creates decision paralysis — designers pick arbitrary sizes when the options are too numerous.

6. **Validate the scale against real content.** Set actual UI text (not "Lorem ipsum") at each scale step. Check:
   - Is each step visually distinguishable from its neighbors?
   - Are the smallest sizes still readable (minimum 11px on screen, 14px on mobile)?
   - Are the largest sizes not overwhelming their containers?
   - Does the scale produce reasonable line lengths when combined with your layout grid?

## Details

### How Real Design Systems Build Scales

**Material Design 3 Type Scale**
Material Design 3 defines 15 named styles across 5 roles, using a custom scale built on Roboto Flex:

| Role     | Size | Small | Medium | Large |
| -------- | ---- | ----- | ------ | ----- |
| Display  | -    | 36px  | 45px   | 57px  |
| Headline | -    | 24px  | 28px   | 32px  |
| Title    | -    | 14px  | 16px   | 22px  |
| Body     | -    | 12px  | 14px   | 16px  |
| Label    | -    | 11px  | 12px   | 14px  |

This is not a strict mathematical scale — it is a **custom scale** tuned to Material's specific hierarchy needs. The ratios between adjacent sizes vary by role. This is valid when you have the design expertise to tune by eye, but a mathematical scale provides better defaults for most teams.

**Tailwind CSS Type Scale**
Tailwind uses a roughly major-second progression with manual adjustments:

- `text-xs`: 12px, `text-sm`: 14px, `text-base`: 16px, `text-lg`: 18px
- `text-xl`: 20px, `text-2xl`: 24px, `text-3xl`: 30px, `text-4xl`: 36px
- `text-5xl`: 48px, `text-6xl`: 60px, `text-7xl`: 72px, `text-8xl`: 96px, `text-9xl`: 128px

The ratios tighten at small sizes (14/12 = 1.167) and widen at large sizes (128/96 = 1.333). This is deliberate — small size differences need less separation to be distinguishable, while large sizes need more dramatic jumps.

**Stripe's Constrained Scale**
Stripe's dashboard uses a deliberately minimal type scale:

- Body: 14px (weight 400) and 16px (weight 300-400)
- Headings: 20px, 24px, 28px (all weight 300)
- Display hero: 56px (weight 300, letter-spacing -1.4px)
- Only 6-7 distinct sizes total — extreme constraint creates extreme consistency

**Vercel's Minimal Scale**
Vercel limits their primary scale to approximately 5 core sizes:

- 14px (small/meta), 16px (body), 20px (subheading), 24px (heading), 32px (page title)
- This restriction forces hierarchy through weight, color, and spacing rather than size alone

### Custom Scales and When to Break the Math

Mathematical scales are starting points, not laws. Legitimate reasons to deviate:

- **Rounding for the pixel grid**: 31.25px rounds to 32px — this is fine and expected
- **Accessibility minimums**: if the scale produces a size below 11px, clamp it to 11px
- **Specific use cases**: a data table might need 13px that does not exist in your scale — add it as a named exception, not a new scale step
- **Responsive adaptation**: mobile scales often use a tighter ratio than desktop (1.125 mobile vs 1.250 desktop) to prevent headings from dominating small screens

### Anti-Patterns

1. **Too many sizes.** When a system accumulates 15+ font sizes (11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32, 36, 48...), every pixel difference becomes a choice that designers and developers make inconsistently. Audit your CSS: if `font-size` has more than 10 unique values, your scale is broken. Collapse to a mathematical scale and map existing values to the nearest step.

2. **Arbitrary sizes with no mathematical relationship.** A scale of 14px, 17px, 19px, 23px has no governing ratio — each jump is different (1.214, 1.118, 1.211). The eye perceives this inconsistency as visual noise. Run your sizes through the formula `ratio = size_n / size_n-1` — if the ratios vary by more than 0.05, you do not have a scale, you have a list.

3. **One ratio for all contexts.** The golden ratio (1.618) produces a stunning headline but by step +4, your largest heading is 111px from a 16px base. Data dashboards using a perfect fifth (1.500) will have headings that overpower their content. Match the ratio to content density: tight for dense UI, wide for sparse marketing.

4. **Ignoring the base size.** Teams that change the base from 16px to 14px "to fit more content" cascade problems throughout the system — rem calculations break, browser zoom behavior changes, and body text drops below comfortable reading size. If text feels too large, the problem is usually line-length or spacing, not font size.

### Real-World Examples

**Building a SaaS Dashboard Scale (Major Second, 1.125)**
Starting from 16px: 11px, 13px, 14px, 16px, 18px, 20px, 23px, 25px. Eight sizes. The tight ratio keeps headings from overwhelming dense data tables. Heading-1 at 25px is only 1.56x the body size — appropriate for a screen that may have 4 data tables visible simultaneously.

**Building a Marketing Landing Page Scale (Perfect Fourth, 1.333)**
Starting from 16px: 12px, 16px, 21px, 28px, 38px, 50px, 67px. Seven sizes. The dramatic ratio creates clear separation between the hero headline (67px), section headings (38px), and body text (16px). Each level is unmistakable at a glance — essential when the user is scanning, not reading.

**Migrating from Ad-Hoc to Systematic**
A real-world audit might find these font sizes in production CSS: 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 40, 48, 64. That is 16 sizes. Collapse to a minor-third scale (1.200) from 16px base: 11, 13, 16, 19, 23, 28, 33, 40. Map each existing size to its nearest scale value. Document exceptions. The result: 8 sizes replacing 16, with mathematical coherence.

## Source

- Bringhurst, Robert. _The Elements of Typographic Style_, version 4.0 — on proportional systems
- Brown, Tim. "More Meaningful Typography" — A List Apart, modular scale theory
- type-scale.com — interactive scale generator by Jeremy Church
- Material Design 3 Type System — https://m3.material.io/styles/typography/type-scale-tokens
- Tailwind CSS font-size documentation — https://tailwindcss.com/docs/font-size

## Process

1. **Evaluate** — Audit the current font sizes in the project. Count unique values. Determine if a mathematical relationship exists. Assess content density to choose an appropriate ratio.
2. **Apply** — Generate a scale from the chosen base and ratio. Map steps to semantic token names. Replace arbitrary sizes with the nearest scale value.
3. **Verify** — Confirm that each scale step is visually distinguishable, no size falls below readability minimums, and the total size count is between 6 and 10.

## Harness Integration

This is a knowledge skill. When activated, it provides type scale theory and calculation methods to guide font-size token creation. Use these principles when defining `--font-size-*` custom properties, Tailwind `fontSize` config, or any design token system. Cross-reference with `design-responsive-type` for viewport-adaptive scaling.

## Success Criteria

- Font sizes follow a consistent mathematical ratio (variation < 0.05 between steps)
- Total unique font sizes in the system are between 6 and 10
- Every font size maps to a named semantic token (no raw pixel values in components)
- The smallest size is at least 11px on desktop and 14px on mobile
- The chosen ratio matches the content density (tight for data, wide for marketing)
