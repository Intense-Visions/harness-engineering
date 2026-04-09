# Gestalt Closure and Continuity

> Pattern completion — the brain fills gaps in incomplete shapes (closure) and follows smooth paths over abrupt changes (continuity), with implications for icons, progress indicators, and visual flow

## When to Use

- Designing icons that must be recognizable at small sizes with minimal detail
- Building progress indicators, step wizards, or completion meters
- Creating visual flow through a page — guiding the eye along a reading path
- Designing charts, graphs, or data visualizations with connected data points
- Evaluating why an icon reads poorly, a progress indicator feels ambiguous, or a layout lacks directional flow
- Implementing breadcrumbs, timelines, or sequential navigation patterns

## Instructions

1. **Understand closure.** The Gestalt principle of closure states that the brain automatically completes incomplete shapes, perceiving whole forms from partial information. A circle with a gap is still perceived as a circle. A square missing a corner is still perceived as a square. This principle is foundational to icon design — icons work because the brain fills in detail that pixels cannot provide at small sizes.

   **Critical implication:** Closure means you can remove visual information without losing meaning, as long as enough structural cues remain. This is the basis of minimalist design — show less, mean the same.

2. **Apply closure to icon design.** Icons are closure in action. At 24x24px or 16x16px, there is insufficient resolution for photorealistic representation. Icons succeed by providing just enough visual structure for the brain to complete the pattern.

   **Worked example — Apple's SF Symbols:**
   - The "phone" icon is not a photograph of a phone — it is a curved rectangle with a speaker bump
   - The "envelope" icon is a rectangle with a V-shaped fold — two lines represent an entire object
   - The "magnifying glass" icon is a circle with a diagonal line — the brain completes the handle, the glass, the concept of "search"
   - SF Symbols remove detail until only the essential geometric structure remains, then rely on closure for recognition

   **Decision procedure for icon simplification:**
   1. Start with the most detailed version of the object
   2. Remove one detail at a time
   3. After each removal, test: is the object still recognizable without its label?
   4. Stop removing when the next removal breaks recognition
   5. The icon should be 1-2 removals above the recognition threshold — just enough redundancy for confidence

3. **Apply closure to progress indicators.** Progress rings, step indicators, and loading animations all exploit closure. An incomplete ring is perceived as "a ring that is partially filled" rather than "an arc" — the brain supplies the complete circle and interprets the gap as "remaining."

   **Worked example — circular progress indicators (Material Design):**
   - A 270-degree arc on a 360-degree track reads as "75% complete"
   - The track (the remaining 90 degrees) is rendered as a faint gray arc — providing the closure target
   - Without the track, the same 270-degree arc reads ambiguously: is it a C-shape, or a partial circle?
   - The track is the closure scaffold — it tells the brain "this is meant to be a circle, and here is how much is filled"
   - Track color: `rgba(0,0,0,0.08)` on light backgrounds, `rgba(255,255,255,0.12)` on dark — visible enough to complete the shape, faint enough not to compete with the filled portion

   **Worked example — step indicators (Stripe onboarding):**
   - Steps displayed as numbered circles connected by a line: (1)----(2)----(3)----(4)
   - Completed steps: filled circle. Current step: outlined circle with bold number. Future steps: faint outlined circle
   - The connecting line is the continuity cue — it tells the brain "these circles form a sequence"
   - The partially-complete sequence exploits closure: the user perceives the full 4-step journey and their position within it

4. **Understand continuity.** The Gestalt principle of continuity states that the eye follows smooth, continuous paths over abrupt direction changes. When two lines cross, the brain perceives two straight lines passing through each other rather than four lines meeting at a point. The eye prefers the interpretation that maintains smooth trajectory.

   **Critical implication:** Continuity governs how users scan a page. The eye follows alignment axes, baselines, and directional cues. If elements are arranged along a smooth path, the eye will follow that path. If the path has a sharp break, the eye stops or gets confused.

5. **Apply continuity to layout flow.** Continuity dictates that content should follow predictable reading paths. In Western interfaces, the primary axis is top-to-bottom, left-to-right (Z-pattern or F-pattern).

   **Worked example — Stripe's marketing page flow:**
   - Hero section: headline left-aligned, CTA aligned to the same left edge
   - Feature section below: text block left-aligned to the same grid column
   - The consistent left-edge alignment creates a vertical continuity line — the eye follows it downward without searching
   - When an element breaks this alignment (e.g., a centered testimonial), it creates an intentional continuity break that signals "this is different" — use this deliberately, not accidentally

   **Worked example — dashboard data flow:**
   - KPI cards arranged in a horizontal row: the shared top edge creates a horizontal continuity line
   - Below the cards, a chart starts at the same left edge as the first card — the eye flows from cards to chart along the left alignment axis
   - If the chart were offset 20px to the right, the continuity would break, and the eye would pause to re-orient

6. **Apply continuity to data visualization.** Line charts, flow diagrams, and Sankey charts depend entirely on continuity. The eye follows the line, interpreting it as a single continuous data stream.

   **Worked example — GitHub contribution graph:**
   - The green squares form a grid, but the eye reads horizontal rows as continuous timelines (weeks) due to the left-to-right continuity cue
   - Darker squares along a row create an implicit line that the eye traces — "this person was active in January, quiet in February, active again in March"
   - The grid structure provides the continuity scaffold; the color variation provides the data

   **Decision procedure for visual flow:**
   1. Identify the primary reading path (top-to-bottom, left-to-right for most Western UIs)
   2. Align key elements along this path — shared left edge, shared top edge, or shared center axis
   3. Verify that no element breaks the alignment without a deliberate design reason
   4. Use alignment breaks only to signal content type changes (e.g., shift from text to testimonial)

## Details

### Closure Threshold and Recognition

Not all shapes tolerate the same degree of incompleteness. Recognition depends on the object's gestalt strength — how strong its internal structure is:

- **High gestalt strength (tolerates 40-50% removal):** Circles, squares, triangles, common symbols (heart, star, arrow). A circle with half its outline removed is still perceived as a circle.
- **Medium gestalt strength (tolerates 20-30% removal):** Letters, numbers, familiar icons (house, car, phone). The letter "A" with its crossbar removed is still readable in context.
- **Low gestalt strength (tolerates <10% removal):** Abstract shapes, unfamiliar symbols, complex illustrations. A custom logo with pieces removed may become unrecognizable.

**Implication for icon design:** Use geometrically simple base shapes (circles, squares, triangles) as the foundation. These tolerate more simplification and reproduce cleanly at all sizes.

### Continuity in Navigation Patterns

**Breadcrumbs** exploit continuity. The chain `Home > Products > Shoes > Running` creates a left-to-right continuity line that the eye follows. The separator characters (>, /, arrows) serve as continuity connectors — they tell the brain "this is one path, read it as a sequence."

- Effective separator: `>` or `chevron-right` icon — implies direction and flow
- Weak separator: `/` — implies hierarchy but not direction
- Anti-pattern: no separator, relying only on spacing — breaks continuity; items read as independent links

**Timelines** exploit vertical continuity. A connecting line between events creates an unambiguous time-flow axis:

- GitHub's activity feed: events connected by a vertical line on the left
- The line is the continuity cue — without it, events are a disconnected list
- The line transforms "a list of things that happened" into "a story with sequence"

### Closure in Loading States

Skeleton screens exploit closure. A gray rectangle where a text block will appear triggers closure — the brain completes the pattern: "this is text that has not loaded yet." The skeleton must match the structural layout of the real content closely enough for the brain to complete the prediction.

**Worked example — Facebook/Meta skeleton screens:**

- Avatar placeholder: gray circle, exact size of the real avatar (40px)
- Name placeholder: gray rectangle, approximate width of a name (120px x 14px)
- Content placeholder: two gray rectangles, approximate width of a paragraph
- The structural similarity to real content triggers closure — users perceive "a post is loading" rather than "gray shapes are on screen"
- If the skeleton deviates too much from the real layout (wrong sizes, wrong positions), closure fails and the skeleton reads as arbitrary visual noise

### Anti-Patterns

1. **Broken closure targets in progress indicators.** A progress ring without a track (just an arc floating in space). The brain cannot determine the total — is this 75% of a circle or just a curved line? Always provide the complete shape as a track, scaffold, or background so the brain knows what is being "filled." Material Design specifies both determinate (with track) and indeterminate (animated arc) variants — the indeterminate variant uses continuous animation to signal "in progress" since static closure cues would mislead.

2. **Jagged continuity in layouts.** Elements at inconsistent left margins — a heading at 24px, a paragraph at 32px, a list at 40px, then back to 24px. Each shift breaks the vertical continuity line and forces the eye to re-orient. The fix is a grid: define column edges and snap every element to one. Stripe's marketing pages use exactly three alignment points: left column edge, center, and right column edge. Nothing falls between.

3. **False continuity between unrelated sequences.** A connecting line between steps that are not sequential, or breadcrumbs that show a path the user did not actually take. Continuity creates a powerful narrative implication — "these are connected in order." Using continuity connectors between unrelated items misleads users into seeing a false sequence. Shopping sites that show `Home > Sale > Product` when the user arrived from a search (not through the Sale page) create false continuity.

4. **Over-simplified icons (below closure threshold).** Reducing an icon until it loses its essential geometric cues. A "settings gear" icon simplified to a plain circle has crossed the closure threshold — the brain cannot complete "gear" from a circle alone. Test icons at their smallest rendered size (typically 16px) and verify recognition without labels.

### Real-World Examples

**Apple SF Symbols — Closure Mastery:**

- SF Symbols use consistent 1.5pt stroke weight across all 5,000+ icons, ensuring closure works at every size
- At 44pt (iOS touch target), icons show fine detail. At 17pt (tab bar), the same icons lose detail but the brain completes them via closure
- The "person.crop.circle" icon at 17pt is barely 6 distinguishable pixels of detail — yet it is instantly recognized as "profile" because the circle + head bump triggers closure from a known archetype
- SF Symbols provide 9 weight variants: heavier weights for small sizes (more ink = stronger closure cues), lighter weights for large sizes

**Material Design Step Indicators — Closure + Continuity Combined:**

- Horizontal stepper: numbered circles connected by lines
- Active step: filled circle, bold connector line to completed steps
- Future steps: outlined circle, faint connector line
- The outline circles trigger closure ("this will be filled when I get there")
- The connector line triggers continuity ("these steps form a single journey")
- Together: the user perceives a complete journey with their current position marked

**Spotify's Progress Bar:**

- Track progress: a filled green bar on a gray track
- The gray track is the closure target — it shows the total song length
- The green fill shows current position — the ratio is instantly readable because closure supplies the "total"
- Scrubbing: when the user hovers, a circle handle appears at the fill edge — adding a focal point to the continuity line

**GitHub Contribution Graph — Continuity in Data:**

- 52 columns (weeks) x 7 rows (days) of colored squares
- The eye reads left-to-right across rows (continuity along the horizontal axis)
- Color intensity variations within a row create an implicit data line that the eye traces
- Column alignment creates vertical continuity — "every Sunday is the top row" — enabling day-of-week pattern recognition
- The grid provides double continuity (horizontal for time, vertical for weekday), making patterns visible that would be invisible in a table of numbers

## Source

- Max Wertheimer, "Laws of Organization in Perceptual Forms" (1923) — original closure and continuity principles
- Gaetano Kanizsa, "Subjective Contours" (1976) — illusory contours as closure evidence
- "Interaction Design: Beyond Human-Computer Interaction" by Preece, Rogers, and Sharp — application to interface design
- Colin Ware, "Information Visualization: Perception for Design" — continuity in data visualization

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
