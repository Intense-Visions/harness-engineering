# Design Critique

> Structured feedback — critique frameworks (like/wish/wonder, what/why/improve), separating subjective preference from objective assessment, avoiding "I don't like it"

## When to Use

- Reviewing a design proposal, mockup, or prototype before implementation begins
- Providing feedback on a pull request that changes UI layout, typography, color, or interaction patterns
- Running a formal design review session with multiple stakeholders
- Evaluating a competitor's design to extract actionable insights for your own product
- Coaching junior designers or engineers to give better design feedback
- Receiving vague feedback like "it feels off" and needing to decompose it into addressable items
- Deciding between two or more design directions that each have merit
- Auditing your own work before presenting it — self-critique as quality gate
- Preparing a design for handoff to engineering with pre-addressed concerns

## Instructions

1. **Separate observation from judgment before speaking.** Every piece of design feedback must begin with what you see, not what you feel:
   - "The primary CTA button is 12px from the form's last field" is an observation.
   - "The button feels too close" is a judgment.
   - Start with the observation, then layer the judgment with reasoning. This prevents the most common critique failure: feedback that cannot be acted upon because nobody knows what it refers to.
   - **Stripe example:** "The payment form looks cluttered" is useless. "The payment form has 14px spacing between field groups while the rest of the page uses 24px — this inconsistency creates visual tension" is actionable.

2. **Apply the Like/Wish/Wonder framework for generative feedback.** Structure every critique response in three parts:
   - **Like** — identify specific elements that work and explain why they work. "I like that the error messages appear inline below each field rather than in a banner — this preserves the user's scroll position and creates a direct spatial association between the error and its cause."
   - **Wish** — express desired changes as wishes rather than demands. "I wish the success state included a clear next-step CTA — right now the confirmation message is a dead end."
   - **Wonder** — pose open questions that expand the design space. "I wonder if the onboarding flow would benefit from progressive disclosure — showing all 8 fields at once might create form abandonment."
   - This framework forces balanced feedback and prevents pile-on negativity.

3. **Apply the What/Why/Improve framework for evaluative feedback.** When the goal is to assess quality rather than generate ideas:
   - **What** — describe the specific element under review. "The navigation sidebar collapses to icons at 768px."
   - **Why** — explain why this is effective or problematic with reference to a principle. "Icon-only navigation relies on recognition over recall, violating Nielsen's heuristic #6, because these custom icons have no established meaning."
   - **Improve** — propose a concrete alternative. "Add persistent text labels below each icon, or use a tooltip that appears on hover with a 200ms delay."
   - Every improve statement must be specific enough to implement without further clarification.

4. **Classify feedback into three weight categories.** Not all feedback carries equal weight:
   - **Objective** — references measurable criteria. "The contrast ratio between the body text (#767676) and white background is 4.48:1, which fails WCAG AA for normal text (requires 4.5:1)." Non-negotiable — must be fixed.
   - **Subjective-informed** — applies established design principles. "The 8px margin between the headline and body text creates an ambiguous grouping per Gestalt proximity — increasing to 16px would clarify the hierarchy." Strong weight — should usually be accepted.
   - **Subjective-preference** — expresses personal taste. "I prefer rounded buttons over square ones." Least weight — must be explicitly labeled as preference so it does not dominate the discussion.

5. **Use the severity/confidence matrix to prioritize feedback.** Every critique item should be tagged:

   | Severity   | Confidence | Example                                                              | Action                  |
   | ---------- | ---------- | -------------------------------------------------------------------- | ----------------------- |
   | Critical   | High       | "Submit button is invisible on mobile — tested iPhone 14, Safari 17" | Blocks approval         |
   | Major      | High       | "Form has no error recovery — users must re-enter all fields"        | Must fix this iteration |
   | Minor      | Medium     | "Icon weight could be 1.5px instead of 2px for consistency"          | Backlog for polish      |
   | Suggestion | Low        | "Wonder if a tooltip would help here"                                | Consider in future      |

   This matrix prevents a 90-minute review from being derailed by icon weight discussions while a checkout-blocking bug goes unmentioned.

6. **Critique the design, not the designer.** Frame all feedback in terms of the artifact, never the person:
   - Say "The layout does not account for text expansion in German localization" — not "You forgot about i18n."
   - When receiving critique, practice the 24-hour rule: do not respond defensively in the moment. Write down every piece of feedback, sit with it for a day, then evaluate which items improve the design.
   - Jony Ive's design review culture at Apple was famously ego-free — feedback was directed at the object on the table, never the person who made it.

7. **Anchor critique in user goals, not aesthetic preference.** The ultimate test of a design is whether it helps the user accomplish their goal:
   - User-goal-anchored: "The dashboard shows 12 metrics above the fold, but the user's primary task is checking deployment status — a single status indicator with drill-down would reduce cognitive load from 12 items to 1."
   - Aesthetic preference disguised as critique: "The dashboard is too busy."
   - Always ask: what is the user trying to do, and does this design make that task easier or harder?

8. **Close every critique session with a prioritized action list.** Synthesize all feedback into a ranked list:
   - **(1) Must-fix before ship** — blocks release if unresolved.
   - **(2) Should-fix this iteration** — significant quality impact.
   - **(3) Consider for future iteration** — nice-to-have improvements.
   - Each item must reference the original feedback, the agreed-upon resolution, and the owner. Do not end a critique with "lots of good feedback, we will work through it" — that is how feedback gets lost.

## Details

### The Critique Ladder

Design critique operates at five distinct levels of depth. Skilled reviewers consciously choose which level is appropriate:

**Level 1: Visceral reaction** (0-3 seconds). First impression, gut feeling. "This feels premium" or "this feels dated" captures the immediate emotional response. Useful as a data point but never sufficient as feedback. Record it, but do not act on it until you can articulate why.

**Level 2: Descriptive observation** (what exists). Catalog what you see without judgment. "The header uses a sans-serif font at 32px bold. The primary color is #2563EB. There are four navigation items. The hero image is full-bleed." This establishes a shared factual baseline before opinions enter the conversation.

**Level 3: Analytical assessment** (how it works). Apply design principles to the observations. "The 32px heading with 16px body text creates a 2:1 type scale ratio — this is below the 2.5:1 minimum recommended for clear hierarchy. The four navigation items use identical visual weight, offering no signal about which is the current page." This is where the majority of useful critique lives.

**Level 4: Interpretive evaluation** (why it matters). Connect the analysis to user outcomes. "The weak type hierarchy means users scanning the page cannot distinguish section headings from body text at a glance, increasing time-to-task by an estimated 2-4 seconds per page. For a dashboard viewed 20+ times daily, this compounds into meaningful friction."

**Level 5: Strategic questioning** (what else is possible). Zoom out from the specific solution to question the problem framing. "The dashboard assumes users need to see all metrics simultaneously, but analytics show 80% of sessions focus on a single metric. Would a single-metric focus view with drill-down better serve the primary use case?" This level can redirect entire product directions.

### Critique Session Facilitation

A structured critique session follows this protocol:

1. **Context setting** (2 min). The presenter shares: the user problem, the constraints (timeline, tech, brand), and what specific feedback they need. "I need feedback on the information hierarchy of this settings page. I am not looking for color feedback — that follows the existing system."
2. **Silent review** (5-10 min). All participants review the design silently, writing their observations. This prevents anchoring bias — the first person to speak in an open discussion sets the frame for everyone else.
3. **Round-robin likes** (5 min). Each participant shares one specific thing that works and why. This establishes a constructive tone and surfaces strengths that should be preserved.
4. **Round-robin wishes and wonders** (15 min). Each participant shares their wishes and wonders, tagged with severity/confidence. The facilitator captures each item on a shared board.
5. **Clustering and prioritization** (5 min). Group related feedback items. Vote on priority. Identify the 3-5 most impactful items.
6. **Response** (5 min). The presenter reflects back what they heard and identifies which items they will address. No defensive explanations — just acknowledgment and intent.

### Asynchronous Critique Protocol

Not all critique happens in a room. Pull requests, Figma comments, and Slack threads require adapted techniques:

**Written feedback format.** Every asynchronous critique comment should follow this template:

1. Screenshot or link to the specific element
2. Observation — what you see
3. Assessment — why it matters, referencing a principle or user goal
4. Suggestion — a concrete alternative
5. Severity tag — critical / major / minor / suggestion

This structure prevents the two failure modes of async critique: comments that are too vague to act on and comments that are so long nobody reads them.

**Figma annotation conventions.** Pin comments to specific layers, not arbitrary canvas positions. Use color-coded labels: red for critical, orange for major, blue for minor, gray for suggestion. Resolve comments when addressed rather than leaving a thread of "fixed" replies.

**Pull request design review.** When reviewing a PR that changes UI:

- Open the preview/staging URL and test at three breakpoints (375px mobile, 768px tablet, 1440px desktop)
- Test with browser zoom at 150% and 200%
- Check dark mode if applicable
- Screenshot each finding and annotate it
- A PR design review that only looks at code diffs misses layout regressions, animation glitches, and responsive breakage

### Critique Calibration

Teams drift in critique quality over time. Calibrate regularly by reviewing the same design independently and comparing feedback:

- If five reviewers all surface different critical issues, the team's shared standards are misaligned.
- If five reviewers converge on the same three issues, the team has a healthy shared baseline.
- **Calibration exercise:** Take a publicly available design (a SaaS landing page, a government form, a mobile app screen). Each team member writes five critique items using What/Why/Improve. Compare: which items overlap? Which are objective vs. preference? Where do severity ratings diverge? This 30-minute exercise, run quarterly, dramatically improves critique consistency.

### Anti-Patterns

1. **The Drive-By "I Don't Like It."** Feedback with no specificity, no reasoning, and no suggested alternative. "I don't like the spacing" tells the designer nothing about what spacing, why it is problematic, or what to change. The fix: require every "I don't like" to be followed by "specifically [element], because [reason], and I suggest [alternative]." If the reviewer cannot complete the sentence, the feedback is not ready to share.

2. **The Pixel Police.** Focusing exclusively on implementation details (2px misalignment, slightly wrong shade of gray) while ignoring structural issues (navigation model is confusing, information hierarchy is inverted, user flow has a dead end). A review that spends 40 minutes on padding inconsistencies while the core user flow is broken has inverted its priorities. The fix: enforce critique levels — structure first, details second.

3. **The Solution Stampede.** Jumping directly to solutions without understanding the problem. "Just add a sidebar" or "make it more like Notion" or "use tabs instead of a dropdown." Solution-first feedback skips the analytical step and assumes the reviewer's first instinct is correct. The fix: require feedback to follow the What/Why/Improve sequence — the "what" and "why" must be validated before any "improve."

4. **The Frankenstein Review.** Multiple reviewers each contribute one change, none coordinated, resulting in an incoherent patchwork. Reviewer A wants more whitespace, B wants more density, C wants larger type, D wants smaller type. The designer implements all four and the result is worse than the original. The fix: the design owner synthesizes feedback into a coherent revision rather than applying each suggestion independently.

5. **The Compliment Sandwich Trap.** Framing critical feedback between two hollow compliments: "The colors are nice. The entire navigation model is broken. But great font choice!" This trains people to ignore the compliments and softens the impact of the critique. The fix: give genuine, specific positive and critical feedback separately — do not manufacture fake positives as wrapping paper.

6. **The Stakeholder Override.** A senior leader's personal preference overrides well-reasoned design decisions: "The CEO wants it blue." The fix: acknowledge the constraint but document the trade-off with measurable impact: "Changing from orange (#F97316) to blue (#2563EB) reduces the CTA's contrast against the blue navigation bar from 8.2:1 to 1.3:1."

### Real-World Examples

**Apple Design Reviews.** Apple's industrial design team under Jony Ive held daily critique sessions with physical prototypes. The protocol: place the object on the table, and everyone critiques the object — never the person who designed it. "The radius on this corner creates a shadow line that interrupts the continuous surface" is the level of specificity expected. This culture produced the unibody MacBook, the iPhone's edge-to-edge glass, and the AirPods case.

**Google's Design Sprint Critique.** In Google Ventures' design sprint methodology, critique happens on Day 3 ("Decide"). The team silently reviews printed concepts on a wall, places dot-vote stickers on effective elements, and discusses the clusters. Silent voting eliminates groupthink. A concept with 15 dots clustered on its navigation but zero dots on its data visualization tells a clear story without discussion.

**Stripe's Design Review Protocol.** Stripe runs formal reviews for any customer-facing change. Three explicit questions: (1) Does this design handle all edge cases in the state matrix? (2) Does it maintain consistency with the existing design language? (3) Does it degrade gracefully on slow connections and small screens? A "P0" finding (checkout button below the fold on iPhone SE) blocks release. A "P2" finding (reduce font weights from 4 to 2) is logged for the next iteration.

**Airbnb's Design Language System Reviews.** Airbnb's DLS team runs weekly sessions where any team can bring a component variation. Critique is anchored against DLS principles: unified, iconic, conversational. "This card variant introduces a fifth corner radius (6px) when the system uses only 4px, 8px, 12px, and 16px" is grounded in system consistency. Components that pass review carry a "reviewed" badge in the component library.

## Source

- Feldman, E. — "Practical Handbook of Design Critique" (2019), structured critique methods
- Stanford d.school — "I Like, I Wish, What If" framework for generative feedback
- Liedtka, J. & Ogilvie, T. — _Designing for Growth_ (2011), critique in design thinking
- Nielsen, J. — "10 Usability Heuristics for User Interface Design" (1994), criteria anchoring
- Knapp, J. — _Sprint_ (2016), design sprint critique and dot-voting methodology
- Connor, A. & Irizarry, A. — _Discussing Design_ (2015), improving critical conversations about design

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
