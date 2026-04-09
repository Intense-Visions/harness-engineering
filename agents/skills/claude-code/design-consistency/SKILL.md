# Design Consistency

> Internal vs. external consistency — maintaining coherent patterns within a product, adhering to platform conventions, and knowing when to break consistency deliberately

## When to Use

- Building a new component and deciding whether to match existing patterns or introduce a new one
- Auditing an existing product for visual or interaction inconsistencies
- Porting a product to a new platform (iOS to Android, web to native)
- Debating whether a novel interaction pattern justifies breaking established conventions
- Establishing or enforcing a design system's governance rules
- Reviewing pull requests for design drift from documented patterns

## Instructions

### 1. Distinguish the Three Levels of Consistency

**Internal consistency** means every screen, component, and interaction within your product behaves the same way. If cards have 8px border-radius on the dashboard, they have 8px border-radius everywhere.

**External consistency** means your product behaves like other products on the same platform. iOS apps use bottom tab bars; Android apps use top navigation drawers. Users carry expectations from every other app they use daily.

**Temporal consistency** means your product behaves the same way today as it did yesterday. Changing a primary button from blue to green between releases breaks the learned affordance for every existing user.

**Decision procedure — when levels conflict:**

1. External consistency wins when the user's safety or data is at stake. Never move a destructive action to where users expect a confirmation. Apple HIG mandates that "Delete" in action sheets is always red and positioned to require deliberate targeting.
2. Internal consistency wins when it reinforces a unique brand interaction that users have already learned. Spotify places Shuffle as the dominant green button on every playlist — this is internally consistent even though no platform convention dictates it.
3. Temporal consistency is the weakest constraint — you can break it during major version releases with migration cues (tooltips, onboarding overlays, changelogs).

### 2. Enforce Internal Consistency with Concrete Tokens

Do not rely on memory or visual inspection. Encode consistency into design tokens.

**Stripe's approach:** Every interactive element uses one of exactly three border-radius values: `4px` (inputs, small elements), `6px` (cards, containers), `8px` (modals, large surfaces). There is no `12px`, no `16px`, no pill shape (`999px`). This constraint is enforced in code — the design system exports only these three radius tokens.

```css
/* Stripe-style radius tokens — exhaustive, no other values permitted */
:root {
  --radius-sm: 4px; /* inputs, badges, chips */
  --radius-md: 6px; /* cards, dropdowns, popovers */
  --radius-lg: 8px; /* modals, dialogs, sheets */
}

/* Violation — inventing a new radius */
.fancy-button {
  border-radius: 24px; /* WRONG: not a token, breaks consistency */
}

/* Correct — using the token */
.fancy-button {
  border-radius: var(--radius-sm);
}
```

**Material Design's elevation system:** Shadows are not ad hoc. There are exactly 5 elevation levels (0dp, 1dp, 2dp, 4dp, 8dp for most components) mapped to specific component types. A card is always 1dp. A raised button is always 2dp. A dialog is always 24dp. Deviating from these creates visual noise that breaks the spatial model.

### 3. Adhere to Platform Conventions (External Consistency)

**The principle:** Users spend 99% of their time in other apps. Violating platform conventions forces users to relearn interactions they already know.

| Convention         | iOS (Apple HIG)                     | Android (Material)                  | Web                               |
| ------------------ | ----------------------------------- | ----------------------------------- | --------------------------------- |
| Back navigation    | Left swipe / top-left chevron       | System back button / top-left arrow | Browser back button               |
| Primary action     | Top-right bar button (e.g., "Done") | FAB or top-right icon               | Right-aligned button in forms     |
| Destructive action | Red text in action sheets           | Red text in dialogs                 | Red button, requires confirmation |
| Pull to refresh    | Native UIRefreshControl             | SwipeRefreshLayout                  | Not a convention (use button)     |
| Tab bar position   | Bottom (max 5 tabs)                 | Top (scrollable) or bottom (3-5)    | Top (horizontal nav)              |

**Airbnb's cross-platform strategy:** On iOS, Airbnb uses a bottom tab bar with 5 items (Explore, Wishlists, Trips, Inbox, Profile) matching Apple HIG. On Android, the same 5 items appear in a bottom navigation bar matching Material guidelines. The information architecture is identical; the implementation respects each platform's conventions. They do not use a hamburger menu on iOS or a bottom bar on web.

### 4. Build a Consistency Audit Checklist

Run this audit on every major feature or quarterly on the full product:

**Visual properties:**

- [ ] Border-radius: Are all values from the token set? (Grep codebase for hardcoded `px` values in `border-radius`)
- [ ] Color: Are all colors from the palette? (No hex literals outside the token file)
- [ ] Spacing: Are all margins/paddings multiples of the base unit? (Stripe uses 4px base; Vercel uses 8px base)
- [ ] Typography: Are all font-size/line-height/font-weight combinations from the type scale?
- [ ] Shadows: Are all box-shadows from the elevation token set?
- [ ] Icons: Are all icons from the same family, same stroke weight, same optical size?

**Interaction properties:**

- [ ] Hover states: Do all interactive elements show the same hover treatment? (Vercel: background shifts to `--accents-2` uniformly)
- [ ] Focus rings: Is the focus ring style identical on every focusable element?
- [ ] Loading states: Do all async operations use the same skeleton/spinner pattern?
- [ ] Error states: Do all errors use the same color, icon, and message position?
- [ ] Empty states: Do all empty collections show a consistent illustration + message + CTA pattern?
- [ ] Transitions: Are all motion durations from the timing token set? (Material: 150ms for small, 300ms for medium, 500ms for large)

**Content properties:**

- [ ] Capitalization: Is it sentence case or title case? (Apple: Title Case for buttons; Google: Sentence case for buttons)
- [ ] Terminology: Is the same concept always called the same thing? ("Delete" vs. "Remove" vs. "Trash" — pick one)
- [ ] Date formats: Is the date format consistent across all surfaces?
- [ ] Number formats: Are currencies, percentages, and units formatted identically?

### 5. Know When to Break Consistency Deliberately

Consistency is not uniformity. Some situations demand breaking the pattern:

**Rule: Break consistency only when the inconsistency communicates meaning.**

**Worked example — Spotify's green CTA:** Every surface in Spotify uses a monochrome palette of blacks, grays, and whites. The single exception is the green (#1DB954) used exclusively for the primary action (Play, Shuffle, Follow). This deliberate inconsistency works because the break itself carries meaning — green means "this is the one thing you should do." If green appeared on 10 different element types, the signal would dissolve.

**Worked example — Stripe's destructive actions:** Stripe's entire UI is composed of neutral blues and grays. Red (#FF4136) appears only on destructive actions (delete, cancel subscription, revoke key). The red breaks the color consistency to signal danger. This is a deliberate, meaningful violation.

**Decision procedure for breaking consistency:**

1. **Identify the signal.** What does the inconsistency communicate? If you cannot articulate it in one sentence, do not break consistency.
2. **Verify exclusivity.** The breaking element must be the ONLY thing that looks different in that specific way. If three things are red, red no longer signals danger.
3. **Test learnability.** After seeing the inconsistency once, can a user predict where they will see it again? Spotify users learn within minutes that green = primary action.
4. **Document it.** Add the exception to the design system with a rationale. Undocumented exceptions become accidental inconsistencies when the next designer does not know the reasoning.

## Details

### Consistency Measurement

Consistency is measurable, not subjective. Count the number of unique values for each visual property across the entire product:

- **Border-radius:** Stripe has 3 unique values. If your product has 11, you have a consistency problem.
- **Font sizes:** A disciplined type scale has 6-8 sizes. If your CSS contains 23 distinct `font-size` declarations, the scale is not being followed.
- **Colors:** Vercel's dashboard uses ~12 semantic color tokens. If your product references 47 distinct hex values, the palette has drifted.
- **Spacing:** Products on a 4px grid should show spacing values exclusively as multiples of 4. Grep for odd values (e.g., `margin: 13px`) to find violations.

**Tooling for measurement:** Run `grep -roh 'border-radius: [^;]*' src/ | sort | uniq -c | sort -rn` to see every unique border-radius in the codebase. Do the same for `font-size`, `color`, `margin`, `padding`, and `box-shadow`. The output is your consistency scorecard.

### Anti-Patterns

**1. Snowflake components.** A designer creates a "special" card variant for a marketing page with different radius, shadow, and padding from the standard card. Another designer sees it and creates their own variant. Within 6 months, the product has 14 card variants that each appeared "justified" in isolation but collectively destroy coherence. **Fix:** Require all component variants to be added to the design system with explicit documentation of when to use each variant. If you cannot write a clear usage rule, the variant should not exist.

**2. Platform denial.** Forcing iOS conventions onto Android (or vice versa) because "we want the same experience everywhere." This creates an experience that feels wrong on every platform. Users on Android expect the system back button to work; wrapping navigation in a custom stack that ignores it creates confusion. **Fix:** Share information architecture and brand identity across platforms. Adapt interaction patterns to each platform's conventions.

**3. Pixel-perfect inconsistency.** The design file says buttons are 40px tall, but 30% of the buttons in production are 38px or 42px because developers eyeballed it or different developers used different base values. The eye detects these near-misses more than gross differences. **Fix:** Expose sizing tokens (not pixel values) in the component API. A button's height should be `--size-control-md`, never a raw number. Lint for hardcoded dimensional values.

**4. Terminology drift.** The settings page says "Remove account," the confirmation dialog says "Delete account," and the success message says "Account erased." Three synonyms for one action across three screens. Users wonder if these are different actions. **Fix:** Maintain a terminology glossary in the design system. Each concept has exactly one canonical term. Lint content strings against the glossary.

**5. Franken-pattern.** Combining conventions from different platforms or design systems in the same product — Material icons with iOS navigation with a custom Android-style FAB on web. Each piece is well-designed in its original context but together they create a disorienting experience. **Fix:** Choose one design system as the foundation and extend it. Do not mix origin systems.

### Real-World Examples

**Vercel — Monochrome as consistency strategy.** Vercel's entire dashboard uses exactly two hue categories: grayscale (backgrounds, text, borders) and blue (links, focus rings). There is no green success, no yellow warning, no red error in the primary UI. Status is communicated through icons and labels, not color variation. This extreme consistency means any color that does appear (like a red deployment failure badge) carries enormous visual weight precisely because it is the only chromatic element. The constraint: `--geist-foreground` (white or black depending on theme) and `--geist-background` (inverse) are the only two mandatory color tokens.

**Apple — Consistency as platform trust.** Apple's HIG defines that every destructive action in an action sheet must use the `.destructive` button style (red text, standard font weight). This is consistent across every first-party and well-behaved third-party app. When a user sees red text in an action sheet, they know — without reading — that this option destroys something. Apps that use red for non-destructive actions (like "Change Color to Red") violate this convention and erode platform trust for all apps.

**Material Design — Consistency through systematic constraint.** Material's component specs do not say "pick a nice shadow." They prescribe exact elevation values: FAB rests at 6dp, raised button at 2dp, card at 1dp, dialog at 24dp. The shadow values are mathematically derived from the elevation number, not hand-tuned. This system means every Material app has the same spatial hierarchy, making the platform feel cohesive even across apps from different developers.

**Airbnb — Card anatomy consistency.** Every listing card across Airbnb's product follows identical anatomy: image carousel (16:9 aspect ratio), heart icon (top-right), title (semibold, 16px), subtitle (regular, 14px), metadata line (regular, 14px, secondary color), price (semibold, 16px, right-aligned). This rigid structure means users can scan hundreds of listings without cognitive overhead — their eyes know exactly where to find each piece of information. When Airbnb introduced "Experiences," the cards followed the same anatomy with different content, maintaining recognition.

## Source

- Apple Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- Material Design Guidelines: https://m3.material.io/
- Jakob Nielsen, "Consistency and Standards" (Usability Heuristic #4): https://www.nngroup.com/articles/consistency-and-standards/
- Stripe Design System (public Stripe Sessions talks and component patterns)

## Process

1. Read the instructions and examples in this document.
2. Identify which level of consistency (internal, external, temporal) is relevant to your current task.
3. Apply the audit checklist to verify your implementation respects existing patterns.
4. If you need to break consistency, follow the four-step decision procedure in Section 5.
5. Document any new patterns or deliberate exceptions in the design system.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **Related skills:** Use `design-alignment` for spatial consistency, `design-gestalt-similarity` for perceptual grouping through consistent styling, `design-brand-consistency` for brand-level coherence, and `design-design-governance` for process-level enforcement.

## Success Criteria

- All visual properties (radius, color, spacing, typography, shadows, icons) use design tokens, not hardcoded values.
- Platform-specific conventions are respected — the product feels native on each platform.
- The consistency audit checklist passes with no unresolved violations.
- Any deliberate consistency breaks are documented with a clear rationale and follow the exclusivity rule.
- Terminology is uniform — each concept has exactly one canonical name across all surfaces.
