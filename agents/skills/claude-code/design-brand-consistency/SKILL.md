# Brand Consistency

> Visual coherence across every touchpoint — mapping brand attributes to design decisions, voice-to-visual translation, consistency vs. monotony, brand flex zones, and multi-platform coherence

## When to Use

- Building or auditing a design system for brand alignment
- Extending a brand from web to mobile, email, print, or embedded contexts
- Evaluating whether a new component or page feels "on brand" without a subjective debate
- Defining what can vary (flex zones) vs. what must remain fixed (brand invariants)
- Translating brand voice attributes (e.g., "confident and clear") into concrete visual decisions
- Merging design systems after an acquisition or rebrand
- Onboarding new designers who need to internalize brand rules quickly
- Diagnosing why a product "feels off" despite using correct colors and typography

## Instructions

1. **Define brand attributes as measurable design axes, not adjectives.** Brand attributes like "modern," "trustworthy," or "playful" are useless without translation to specific design parameters. Create a brand-attribute-to-design-decision map:

   | Brand Attribute  | Color                                | Typography                        | Shape                    | Motion                      | Photography                 |
   | ---------------- | ------------------------------------ | --------------------------------- | ------------------------ | --------------------------- | --------------------------- |
   | **Confident**    | High saturation, dark values         | Bold weights, large scale         | Sharp corners, strong    | Fast, decisive easing       | Direct gaze, centered       |
   | **Approachable** | Warm hues, medium saturation         | Medium weights, generous spacing  | Rounded corners (8px+)   | Gentle, spring-based easing | Candid, warm lighting       |
   | **Precise**      | Cool neutrals, monochrome            | Monospace or geometric sans       | Right angles, thin lines | Linear, exact timing        | Clean backgrounds, isolated |
   | **Playful**      | Bright, varied hues, high saturation | Rounded sans, variable weight     | Organic shapes, curves   | Bouncy, overshoot           | Colorful, dynamic angles    |
   | **Premium**      | Black + one accent, low saturation   | Serif or thin sans, ample leading | Minimal, thin strokes    | Slow, deliberate, subtle    | Studio-lit, desaturated     |

   Stripe's brand attributes map concretely: "developer-forward" = monospace code snippets in marketing, dark code editor screenshots, terminal-inspired UI elements. "Premium" = generous whitespace (120px+ section padding), thin rule separators (1px, 10% opacity), subtle gradient backgrounds. "Confident" = saturated violet primary at `#635bff`, bold sans-serif headlines at 56px+, decisive animation curves (`cubic-bezier(0.4, 0, 0.2, 1)`).

2. **Establish brand invariants — the elements that never change.** Brand invariants are the minimum set of design decisions that, if all present, make anything recognizably "your brand." Everything else is negotiable. Typical invariants:
   - **Primary brand color** — the single color that appears on every touchpoint. Spotify Green `#1DB954`. Stripe Violet `#635bff`. Coca-Cola Red `#F40009`.
   - **Logo and its clear space rules** — minimum size, minimum padding, no color modifications.
   - **Primary typeface** — the headline font. Apple uses SF Pro. Google uses Google Sans. Stripe uses a custom variant of Inter.
   - **Corner radius token** — the default border-radius. Applies to buttons, cards, inputs, images. Apple: 12-16px (large, rounded). Vercel: 6-8px (subtle). Stripe: 8px (balanced).
   - **Voice constants** — tone attributes that persist across all copy. Stripe: "concise, direct, technical." Mailchimp: "fun but not silly, confident but not cocky."

   Decision procedure: if you remove an element and the design is no longer recognizable as your brand, it is an invariant. If you remove it and the brand still reads correctly, it is a flex zone element.

3. **Define brand flex zones — where variation is permitted and bounded.** Flex zones prevent monotony while maintaining coherence. Without them, every page looks identical (boring) or designers improvise (inconsistent). Define bounds, not options:
   - **Color flex zone:** The primary color is invariant. Secondary and accent colors can vary within a defined gamut. Spotify allows editorial playlist covers to use any color pair in duotone — but the Spotify Green always appears in the UI chrome around the content. The green is the invariant; the content colors are the flex zone.
   - **Layout flex zone:** Grid column count and gutter width are invariant. Content arrangement within the grid can vary. Material Design fixes the 4/8/12 column grid across breakpoints but allows any content arrangement within it.
   - **Typography flex zone:** The typeface is invariant. Size, weight, and leading can vary within the type scale. GitHub uses the same system font stack everywhere but varies between 6 heading levels and 3 body sizes.
   - **Illustration flex zone:** The style (geometric, organic, isometric) is invariant. Subject matter and color within the style can vary. Shopify's Polaris illustrations are always flat, geometric, and use the brand green as an accent — but depict hundreds of different subjects.

   Concrete bounds example: "Cards may use any background from the neutral palette (gray-50 through gray-200) but must use the brand primary for interactive elements (buttons, links). Card corner radius is fixed at 8px. Card shadow is one of three elevation tokens (sm, md, lg). Card padding is fixed at 24px."

4. **Map brand voice to visual attributes with a translation matrix.** Voice and visual are two expressions of the same brand personality. They must align:

   Mailchimp's voice is "fun but not silly." Visual translation: illustrations use bright colors and playful characters (fun) but maintain consistent 2px stroke weight and precise geometric shapes (not silly). The illustration characters have expressive poses but realistic proportions — not cartoonishly exaggerated. Typography uses a rounded sans-serif (Cooper Light) for warmth and a clean geometric sans (Graphik) for professionalism.

   Stripe's voice is "concise and technical." Visual translation: UI text is short (button labels are 1-2 words, descriptions are 1 sentence). Code is visible everywhere — product screenshots show real code, not mockups. The dark-mode code editor treatment signals "this is a developer tool." Animation is fast (200-300ms) and functional — no decorative motion.

   Decision procedure for voice-visual alignment: take a piece of marketing copy and a screenshot of the product. Cover the logo. Would a stranger identify them as the same brand? If not, the voice and visual are misaligned. The most common failure: playful, casual copy paired with a cold, corporate visual design, or vice versa.

5. **Audit consistency across platforms without enforcing pixel-identical replication.** "Consistent" does not mean "identical." Each platform has its own conventions, and forcing identical UI across web, iOS, and Android produces an experience that feels native nowhere. Instead, define platform-specific expressions of the same brand invariants:

   | Brand Element     | Web                                                       | iOS                            | Android                        |
   | ----------------- | --------------------------------------------------------- | ------------------------------ | ------------------------------ |
   | Navigation        | Horizontal top nav                                        | Bottom tab bar (UITabBar)      | Bottom navigation bar          |
   | Primary button    | Brand color, 8px radius                                   | Brand color, 12px radius (iOS) | Brand color, 20px radius (MD3) |
   | Typography        | Inter/System stack, 16px body                             | SF Pro, 17pt body              | Roboto, 14sp body              |
   | Elevation         | Box shadow tokens                                         | None (iOS uses blur layers)    | Tonal elevation (MD3)          |
   | Brand color usage | Invariant: same hex value across all platforms            |
   | Logo placement    | Invariant: same mark, same clear space, same minimum size |
   | Voice/copy        | Invariant: same tone, same terminology                    |

   Airbnb's iOS app uses native iOS tab bars with platform-standard haptics, while the web app uses a custom bottom navigation on mobile. Both use the same Cereal typeface, the same Rausch coral, and the same photography art direction. The brand is unmistakably Airbnb on both platforms despite different structural patterns.

6. **Measure consistency with a brand consistency score.** Subjective assessments ("this feels on-brand") are unreliable across a team. Create a measurable checklist:
   - Does the page use only colors from the design token palette? (Yes/No)
   - Does the page use only typefaces from the brand type stack? (Yes/No)
   - Does the page use only corner radii from the token set? (Yes/No)
   - Is the brand primary color present in the viewport without scrolling? (Yes/No)
   - Does the page follow the grid system (column count, gutter width)? (Yes/No)
   - Does the photography match the art direction guide (color temp, composition, subject)? (Yes/No)
   - Does the copy match the voice guide (tone, terminology, sentence structure)? (Yes/No)
   - Are interactive components using brand-standard hover/focus/active states? (Yes/No)

   A page scoring 8/8 is fully on-brand. 6-7/8 has minor deviations. Below 6/8, the page needs a brand review. Automate where possible — design token linting (Stylelint with custom rules), color extraction from screenshots (compare against palette), and copy tone analysis (Grammarly Business with brand voice profile).

## Details

### Consistency vs. Monotony — The Variety Paradox

Brand consistency does not mean every page looks the same. It means every page feels like it belongs to the same family. The distinction is between structural consistency (same grid, same tokens, same type scale) and expressive variety (different layouts, different hero treatments, different content hierarchies).

Spotify demonstrates this well: the home screen, search screen, and artist page have completely different layouts — grid of cards, category bubbles, and a full-bleed hero with scrolling track list. But all three use the same dark background (`#121212`), the same green accent (`#1DB954`), the same Circular typeface, and the same card corner radius (8px). The structure is consistent; the expression varies.

The danger of excessive consistency is brand fatigue — when every page is so formulaic that users cannot distinguish sections or feel no emotional progression through the experience. Fix: define 2-3 page archetypes (e.g., landing, content, dashboard) with distinct layout templates that share the same brand invariants.

### Design Token Architecture as Brand Enforcement

Design tokens are the mechanical enforcement layer of brand consistency. A token system that encodes brand decisions makes consistency the path of least resistance:

- **Color tokens:** `--color-brand-primary: #635bff` is the Stripe invariant. All components reference the token, never the hex value. Changing the brand color means changing one token.
- **Spacing tokens:** `--space-section: 120px` ensures consistent section padding. A designer cannot use 80px or 160px without overriding the token — which is flagged in code review.
- **Shadow tokens:** `--shadow-card: 0 4px 6px -1px rgba(0,0,0,0.1)` ensures every card has the same elevation feel.
- **Radius tokens:** `--radius-default: 8px` applied to buttons, cards, inputs, and images creates the rounded brand feel without manual per-component specification.

The token layer turns brand consistency from a cultural practice ("we trust designers to be consistent") into an engineering constraint ("the system only allows brand-consistent values").

### Anti-Patterns

1. **Adjective-Only Brand Guidelines.** A brand guide that says "our brand is modern, friendly, and innovative" without mapping these adjectives to specific design values. Every designer interprets "modern" differently — one uses geometric sans-serif and sharp corners, another uses rounded humanist sans and organic shapes. Fix: translate every brand adjective to specific design parameter ranges using the attribute-to-decision map in step 1. "Modern" must resolve to concrete values: geometric sans-serif (not humanist), 4px corner radius (not 16px), cool neutrals (not warm).

2. **Pixel-Perfect Cross-Platform Cloning.** Forcing the iOS app to look exactly like the web app — same 8px corner radius on buttons even though iOS Human Interface Guidelines specify larger radii, same hover states even though mobile has no hover, same navigation even though iOS uses bottom tab bars. The result feels native to no platform. Fix: define brand invariants (color, typeface, voice) that cross all platforms, and allow structural elements (navigation, input controls, elevation, radii) to follow each platform's conventions.

3. **Brand Police Without Flex Zones.** A design governance process that rejects any variation from the style guide, producing a product that is technically on-brand but creatively dead. Every page has the exact same layout, the same hero treatment, the same illustration style. Users experience brand fatigue. Fix: define explicit flex zones (step 3) where variation is not just permitted but encouraged. The flex zones are bounded by the brand invariants — variation within them is on-brand by definition.

4. **Voice-Visual Disconnect.** Marketing copy is playful and casual ("Hey there! Let's build something awesome") while the product UI is cold and corporate (gray backgrounds, formal labels, no personality). Users experience cognitive dissonance at the transition from marketing to product. Fix: use the voice-visual translation matrix (step 4) to ensure copy tone and visual tone are calibrated to the same brand personality. If the voice is casual, the visuals must be warm and approachable.

5. **Token Bypass.** Engineers hardcoding hex values, pixel sizes, and font names instead of referencing design tokens. The product starts on-brand but drifts as hardcoded values are not updated when the brand evolves. Fix: lint for magic values in CSS/styled-components. Every color, spacing, radius, shadow, and font reference should resolve to a token. Hardcoded values are code smells.

### Real-World Examples

**Stripe — Consistency Through Restraint.** Stripe's brand is recognizable because of what it does NOT do: no gradients on buttons, no decorative illustrations in the product, no color variety beyond the violet/navy/white core. The restraint itself is the brand signal. Every touchpoint — docs, dashboard, marketing, Stripe Press books — uses the same navy text color (`#061b31`), the same code-block style (dark background, syntax highlighting), and the same generous whitespace. New pages feel on-brand because the design system provides so few choices that off-brand combinations are nearly impossible. Key lesson: brand consistency is easier when the palette of options is deliberately narrow.

**Airbnb — Multi-Platform Coherence.** Airbnb is one of the few companies whose web, iOS, and Android apps feel like the same brand without being pixel-identical. The invariants: Cereal typeface, Rausch coral (`#FF5A5F`), warm photography art direction, rounded shapes, and casual-yet-helpful voice. The flex zones: navigation structure follows platform convention (tabs on mobile, sidebar on desktop), component styling respects platform norms, and layout adapts to screen context. An Airbnb user switching between web and mobile feels continuity without uncanny sameness. Key lesson: brand consistency is about recognizability, not replication.

**Material Design — Brand as System.** Google's Material Design is a brand consistency framework for thousands of apps. It defines invariants (the type scale, the elevation system, the color role architecture) and flex zones (theme colors, shape overrides, component customization). A Material Design app themed with Stripe's colors and Google's with YouTube's colors look completely different — yet both are recognizably Material Design because they share the systematic structure. Key lesson: at scale, brand consistency must be systematic (tokens, constraints, automated checks) rather than manual (design reviews, visual QA).

**GitHub — Consistency Through System Fonts.** GitHub uses system fonts rather than a custom typeface — SF Pro on Mac, Segoe UI on Windows, Roboto on Android. This means the literal font rendering varies across platforms. But the brand remains consistent because the invariants are: monospace code blocks (the developer identity signal), the Mona octocats (illustration system), Primer design tokens (color, spacing, radius), and the direct, technical voice. Key lesson: brand invariants do not have to include a custom typeface if other elements carry sufficient brand signal.

### Brand Consistency Auditing Process

A systematic audit prevents drift from becoming entrenched:

1. **Screenshot audit (monthly).** Capture full-page screenshots of the 10 most-trafficked pages. Place them side-by-side in a Figma frame. Visually scan for: color outliers, typography inconsistencies, spacing anomalies, and photography style breaks. Any page that does not "belong" to the group at a glance needs investigation.
2. **Token coverage audit (per sprint).** Run a CSS analysis tool (Stylelint with design-token rules, or Project Wallace) to measure what percentage of color, spacing, and typography values reference tokens vs. hardcoded values. Target: 95%+ token coverage. Below 90% indicates active drift.
3. **Copy tone audit (quarterly).** Sample 20 strings from different product areas (onboarding, error messages, settings, marketing). Score each against the voice guide's tone attributes. If more than 3/20 are off-tone, the voice guide needs reinforcement.
4. **Cross-platform parity audit (quarterly).** Place equivalent screens from web, iOS, and Android side-by-side. Verify brand invariants (color, typeface, voice) are consistent. Document platform-specific flex zone differences to confirm they are intentional, not accidental.

### Rebrand and Migration Strategy

When brand elements change (new colors, new typeface, new illustration style), the migration must be systematic:

- **Token-first migration:** Update design tokens at the source. All components referencing tokens update automatically. This is why token architecture matters — a rebrand that changes `--color-brand-primary` from `#635bff` to `#4F46E5` propagates to every button, link, and accent in one change.
- **Progressive rollout:** Change the marketing site first (highest visibility, lowest interaction complexity), then the product chrome (navigation, headers), then the product content area. This gives users a graduated transition rather than a jarring overnight change.
- **Deprecation markers:** Mark old brand values as deprecated in the token system. Linting rules flag deprecated token usage. Set a sunset date after which deprecated tokens are removed.
- **Brand versioning:** Maintain a `brand-v2` token layer alongside `brand-v1` during transition. Components can opt into the new brand by switching their import. This prevents half-migrated states where some components use old values and others use new.

Slack's 2019 rebrand migrated from the hashtag logo and 11-color palette to the aubergine-focused 4-color palette using a token-first approach. The design system's color tokens were updated, and every component that referenced them adopted the new palette automatically. Custom-themed elements that used hardcoded values required manual migration — reinforcing why token coverage matters.

## Source

- Airbnb Design Language System Documentation
- Stripe Brand Guidelines (inferred from public assets)
- Material Design 3 — Theming and Customization
- Mailchimp Content Style Guide
- Nathan Curtis — "Design Tokens and Brand Consistency" (Medium, 2023)
- Slack — "Rebrand Migration Case Study" (2019)

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
