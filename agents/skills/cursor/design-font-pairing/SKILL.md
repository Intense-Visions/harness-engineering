# Font Pairing

> Combining typefaces — contrast principles, superfamilies, serif+sans pairing rules, pairing by x-height and proportion, limiting to 2-3 families

## When to Use

- Selecting a headline and body typeface combination for a new project
- Adding a monospace companion to an existing design system
- Evaluating whether two typefaces work together or create visual conflict
- Deciding between a single-family strategy and a multi-family approach
- Replacing a licensed font with a free alternative that pairs with the remaining system fonts

## Instructions

1. **Apply the concord/contrast/conflict model.** Every font pairing falls into one of three relationships:
   - **Concord** — fonts share similar traits (two humanist sans-serifs). Creates quiet harmony but risks monotony. Works for single-family systems.
   - **Contrast** — fonts differ in classification but share structural DNA (serif headlines + sans body). Creates visual interest and clear role separation. This is the most reliable pairing strategy.
   - **Conflict** — fonts differ slightly but not enough (two grotesque sans-serifs with similar proportions). Creates visual tension without purpose — the eye notices something is "off" but cannot identify what.
   - **Decision rule**: If two fonts are not clearly in concord or contrast, they are in conflict. Replace one.

2. **Match x-height and vertical proportions.** Two fonts paired at the same pixel size must appear the same visual size. The mechanism is x-height ratio:
   - **Good pair**: Inter (x-height 0.756) + Merriweather (x-height 0.750) — virtually identical perceived size at 16px
   - **Problematic pair**: Inter (0.756) + Garamond (0.630) — Garamond appears ~17% smaller at the same font-size, requiring size compensation
   - **Test method**: Set both fonts at 16px side by side with the text "Handgloves" — if one appears noticeably smaller, compensate with a larger font-size or choose a different pairing

3. **Enforce the 2-3 family maximum.** Every additional typeface increases visual complexity, file size, and decision burden:
   - **1 family**: Maximum consistency, minimum expression. Works for developer tools and data-dense UIs. Example: Vercel uses Geist exclusively.
   - **2 families**: The standard for most projects — one for headings, one for body, or one sans and one mono. Example: Stripe uses sohne (UI) + Source Code Pro (code).
   - **3 families**: Maximum for any project. Typically sans + serif + mono. Example: Apple uses SF Pro (UI) + New York (editorial) + SF Mono (code).
   - **4+ families**: Almost always a mistake. Each additional family fragments visual identity and adds load time.

4. **Use superfamilies for guaranteed harmony.** A superfamily is a type family designed with serif, sans-serif, and sometimes mono variants that share identical metrics:
   - **Roboto + Roboto Slab + Roboto Mono** (Google) — same x-height, cap height, and vertical metrics across all three
   - **Source Sans Pro + Source Serif Pro + Source Code Pro** (Adobe) — designed as a matched triplet
   - **PT Sans + PT Serif + PT Mono** (ParaType) — Russian-origin superfamily with full Cyrillic support
   - **IBM Plex Sans + IBM Plex Serif + IBM Plex Mono** (IBM) — corporate superfamily with 8 weights each
   - Superfamilies eliminate x-height matching problems entirely — they are designed to pair.

5. **Pair by classification contrast, not quality contrast.** The goal is fonts that differ in _kind_ (serif vs sans, geometric vs humanist) but match in _quality_ (similar level of refinement, similar era of design thinking):
   - **Good**: Playfair Display (refined didone serif) + Source Sans Pro (refined humanist sans) — both are polished, contemporary designs
   - **Bad**: Playfair Display (refined didone serif) + Comic Sans (casual humanist sans) — wildly different refinement levels
   - **Good**: Inter (geometric-influenced neo-grotesque) + Lora (contemporary old-style serif) — both designed for screen, similar quality
   - **Bad**: Inter + Times New Roman — Times was designed for newspaper columns in 1931; the design philosophy clash is visible

6. **Evaluate pairings with real content, not specimen text.** "The quick brown fox" tells you nothing about how fonts behave in your actual UI:
   - Set a real page layout: navigation, headings, body paragraphs, buttons, form labels, captions
   - Check at 3 sizes: mobile (375px), tablet (768px), desktop (1440px)
   - View at actual distance (arm's length for desktop, hand-held for mobile)
   - Print a screenshot at 100% scale and evaluate from 2 feet away — this reveals hierarchy problems that on-screen viewing misses

## Details

### Single-Family Strategies

Using one typeface for everything is not a limitation — it is a deliberate design strategy used by some of the most sophisticated systems:

**Weight Variation** — Create hierarchy through weight alone:

- Headlines: 700 (bold) or 300 (light, Stripe-style)
- Body: 400 (regular)
- Captions: 400 at smaller size or 300
- Example: Stripe uses sohne-var at only weights 300 and 400, achieving all hierarchy through size, weight, and letter-spacing

**Width Variation** — Variable fonts with `wdth` axis allow condensed headings and normal body:

- Headlines: width 85% (condensed) at weight 600
- Body: width 100% (normal) at weight 400
- Example: Roboto Flex supports width from 75% to 125%, enabling a complete typographic system from one file

**Style Variation** — Italic and small caps create emphasis without adding a second family:

- Block quotes: italic at same size and weight
- Labels: small caps at slightly smaller size
- Code: switch to the mono companion (most design systems treat mono as a functional requirement, not a pairing choice)

### Stripe's Pairing Approach

Stripe demonstrates a minimal two-family strategy:

- **Primary**: sohne-var (Klim Type Foundry) — a refined neo-grotesque variable font with OpenType feature `ss01` enabled globally
- **Code**: Source Code Pro — Adobe's open-source monospace designed for programming contexts
- **Strategy**: sohne handles all UI text (navigation, headings, body, buttons, form labels) using only weights 300 and 400. Source Code Pro appears only in code blocks and API references.
- **Why it works**: sohne's variable font axes provide enough internal variation (weight, optical size) that a second text face is unnecessary. The monospace companion serves a purely functional role.

### Apple's Three-Family System

Apple's pairing is the gold standard for a three-family system:

- **SF Pro** (sans-serif): all UI text, navigation, buttons, labels. Has text and display optical sizes.
- **New York** (serif): editorial content, long-form reading, marketing headlines. Designed with metrics that match SF Pro — both share identical x-height ratios and vertical metrics, so they can coexist on the same baseline grid without adjustment.
- **SF Mono** (monospace): code, terminal output, tabular data. Matches SF Pro's x-height.
- **Why it works**: All three were designed as a family — not a superfamily in the traditional sense, but a coordinated system where metrics align by intention.

### Material Design's Superfamily Approach

Material Design 3 defaults to the Roboto superfamily:

- **Roboto Flex**: primary UI typeface with 13 variation axes
- **Roboto Serif**: editorial and display content
- **Roboto Mono**: code and tabular data
- All three share the same core vertical metrics, ensuring any combination produces aligned baselines
- Google's recommendation: start with Roboto, customize only when brand requires differentiation

### Anti-Patterns

1. **Two similar sans-serifs.** Pairing Helvetica with Arial, or Inter with Roboto, creates conflict — they are similar enough to look like a mistake but different enough to create visual noise. The eye detects "these are not the same font" without understanding why. If you need variation within sans-serif, use weight/width variation within one family, not two families.

2. **More than 3 families.** Loading Montserrat for headings, Open Sans for body, Lato for navigation, Fira Code for code, and Playfair Display for pull quotes produces visual cacophony. Each font brings different proportions, letter spacing, and personality. Consolidate to 2-3 families and use weight/style variation for differentiation.

3. **Pairing without checking x-height compatibility.** Futura (x-height ratio ~0.653) paired with Georgia (x-height ratio ~0.698) at the same pixel size will look mismatched — Georgia appears ~7% larger. At 16px this is subtle; at 24px it is obvious. Always compare x-height ratios before committing to a pairing. If the ratio difference exceeds 0.05, compensate with font-size adjustment or choose a better match.

4. **Pairing based on "feel" without structural analysis.** "These two fonts feel right together" is not a pairing rationale. Document why: Do they share x-height proportions? Do they contrast in classification? Are they from the same era of design thinking? If you cannot articulate the structural reason, the pairing is likely coincidental and will break under different content conditions.

### Real-World Examples

**GitHub: System Fonts + Custom Marketing**

- UI: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Noto Sans, Helvetica, Arial, sans-serif` — pure system font stack for zero-load-time UI
- Marketing/landing pages: Mona Sans (custom variable font) for headlines, system fonts for body
- Code: SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace
- Strategy: performance-first for the application, brand expression only on marketing surfaces

**Airbnb: Cereal as Single Family**

- Airbnb Cereal: custom geometric sans-serif in weights Book, Medium, Bold, Extra Bold
- Used exclusively across all surfaces — app UI, marketing, documentation
- Paired only with a system monospace for developer-facing content
- Demonstrates that a strong single-family choice eliminates pairing decisions entirely

**Spotify: Circular as Brand Anchor**

- Spotify Circular: custom geometric sans-serif (based on Lineto's Circular)
- Weights: Book (400), Bold (700), Black (900) — three weights handle all hierarchy
- Paired with system fonts for body text in embedded web views for performance
- The single display typeface carries brand recognition across all platforms (mobile, desktop, TV, car displays)
- Monospace needs handled by platform defaults since code display is not a product requirement

## Source

- Bringhurst, Robert. _The Elements of Typographic Style_ — on combining typefaces (chapter 6)
- Heck, Bethany. Font Review Journal — https://fontreviewjournal.com
- Google Fonts Knowledge: Choosing Type — https://fonts.google.com/knowledge/choosing_type
- Butterick, Matthew. _Butterick's Practical Typography_ — font recommendations chapter

## Process

1. **Evaluate** — Identify the roles that need distinct typographic treatment (headings, body, code, captions). Determine whether a single family with weight variation can fulfill all roles or whether multiple families are needed.
2. **Apply** — Select fonts using the contrast principle. Verify x-height compatibility. Test with real content at multiple viewport sizes. Limit to 2-3 families maximum.
3. **Verify** — Confirm that paired fonts are visually distinguishable by role, proportionally compatible (x-height ratio difference < 0.05), and that total font file size is acceptable for the performance budget.

## Harness Integration

This is a knowledge skill. When activated, it provides typeface combination expertise to guide font-family selections in design tokens and CSS. Use these principles when defining `--font-family-*` custom properties or evaluating existing font stacks. Cross-reference with `design-typography-fundamentals` for anatomy comparisons and `design-web-fonts` for loading strategy.

## Success Criteria

- The project uses no more than 3 typeface families
- Every font pairing has a documented structural rationale (classification contrast, x-height match)
- X-height ratios of paired fonts differ by no more than 0.05 (or size compensation is applied)
- No two fonts from the same classification are paired (no two grotesque sans-serifs)
- Font roles are clearly assigned: each family has a defined purpose (UI, editorial, code)
