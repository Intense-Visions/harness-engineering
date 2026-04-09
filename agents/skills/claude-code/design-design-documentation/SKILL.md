# Design Documentation

> Documenting design decisions — design rationale, spec handoff, annotating designs, living documentation, decision logs, the DESIGN.md format

## When to Use

- Starting a new project or feature that involves non-trivial design decisions (layout, interaction model, component selection)
- Handing off designs from a design phase to implementation — the spec must be unambiguous enough that a developer produces the correct result without guessing
- Onboarding new team members who need to understand why the interface looks and behaves the way it does
- Auditing an existing product where design decisions were made but never recorded, leading to inconsistency as team members reinvent rationale
- Building or maintaining a design system where every component needs documented usage rules, constraints, and change history
- Resolving recurring design debates — "Why don't we use tabs here?" should have a recorded answer, not a re-litigation
- Preparing for a design review or critique where participants need context before the meeting, not during it
- Any time a design decision is made that a future developer or designer might question or reverse without understanding the original reasoning

## Instructions

1. **Write a DESIGN.md at the root of every project or feature directory.** This file is the single canonical source for design rationale. It lives alongside the code it documents, versioned in git, reviewed in pull requests. The format follows a strict structure:

   ```markdown
   # Feature Name — Design Document

   ## Overview

   One paragraph: what this feature does and why it exists.

   ## Decisions

   ### D1: [Decision Title]

   - **Status:** accepted | proposed | deprecated | superseded by D[n]
   - **Date:** YYYY-MM-DD
   - **Context:** What situation prompted this decision
   - **Decision:** What was decided
   - **Rationale:** Why this option was chosen over alternatives
   - **Alternatives considered:** What else was evaluated
   - **Consequences:** What this decision enables and constrains

   ## Visual Spec

   [Layout descriptions, spacing values, responsive behavior]

   ## Component Inventory

   [Which components are used, their states, their props]

   ## Open Questions

   [Unresolved items with owners and deadlines]
   ```

   Stripe maintains this format internally — every payment form, dashboard view, and API response page has a corresponding design document that records why specific layout, typography, and interaction choices were made.

2. **Record the rationale, not just the outcome.** "We use a modal for deletion confirmation" is useless documentation. "We use a modal for deletion confirmation because user research showed 23% of users accidentally clicked delete on mobile, a confirmation toast was dismissed too quickly, and an inline confirmation displaced adjacent content causing misclicks" is documentation that prevents the next designer from replacing the modal with a toast. Every decision entry must answer: What was the context? What alternatives existed? Why was this one chosen?

3. **Annotate designs at the point of ambiguity.** Not every pixel needs a note — only the ones where a developer might guess wrong. Annotate: spacing that differs from the base grid ("24px here, not 16px, because the visual weight of the icon needs more breathing room"), interactive behavior that is not obvious from a static mockup ("this panel slides from the right on desktop but overlays from the bottom on mobile"), conditional visibility ("this badge only appears when count > 0"), and truncation rules ("truncate at 2 lines with ellipsis, tooltip on hover shows full text"). Apple's Human Interface Guidelines annotate these exact ambiguity points in their component specs — every spacing override, every conditional behavior, every platform-specific variation.

4. **Use a living documentation system, not static exports.** A Figma link in a wiki that nobody updates after launch is dead documentation. Living documentation is generated from or tightly coupled to the source of truth. Approaches that work:
   - **Storybook** with embedded design notes per story — the documentation lives next to the rendered component
   - **DESIGN.md in the feature directory** — reviewed in every PR that changes the feature
   - **Design tokens as documentation** — the token file (`tokens.json`) is the spec; if the token says `spacing.modal.padding: 24px`, that is both the implementation and the documentation
   - **Automated screenshot tests** — the test output is the visual spec; if it changes, the PR diff shows the before/after

5. **Create a decision log for cross-cutting design choices.** Individual DESIGN.md files capture feature-level decisions. Cross-cutting decisions ("We use 8px grid system throughout," "Our primary action color is always blue, never green," "We never auto-play video") belong in a centralized decision log, typically at `docs/design-decisions.md` or within the design system documentation. Material Design's documentation functions as a massive decision log — every guideline ("FABs should contain at most one per screen") is a recorded decision with rationale.

6. **Write spec handoff documents that eliminate ambiguity.** A spec handoff is complete when a developer can implement the design without asking a single clarifying question. The handoff must include: exact dimensions and spacing (in design tokens, not pixel values), all interactive states (hover, active, focus, disabled, loading, error), responsive breakpoints and what changes at each, content limits (max characters, truncation behavior, what happens with 1 item vs 1000), accessibility requirements (focus order, ARIA labels, keyboard shortcuts), and animation specs (duration, easing, trigger condition). Vercel's internal spec handoffs include a "Questions a Developer Will Ask" section that pre-answers implementation ambiguities.

7. **Version your design decisions explicitly.** When a decision is superseded, do not delete the old entry — mark it as `superseded by D[n]` and link to the new decision. This creates an audit trail that explains why the interface evolved. GitHub's Primer design system maintains a changelog for every component that records not just what changed but why, including links to the user research or bug reports that motivated the change.

8. **Conduct documentation reviews as part of design reviews.** Before any design is approved, its documentation must be reviewed for completeness. A design without documentation is an undocumented API — it works today, but nobody can maintain it tomorrow. Add "Documentation complete?" as a checkbox in your design review template.

## Details

### The DESIGN.md Format in Depth

The DESIGN.md file serves three audiences simultaneously: designers reviewing the rationale, developers implementing the spec, and future maintainers understanding the constraints. Each section targets a specific audience:

**Overview** is for everyone — one paragraph, no jargon, explains what exists and why. "The notification center displays real-time alerts, grouped by category, with bulk actions for mark-read and dismiss. It exists because user research (2024-Q3) showed users missed critical alerts buried in email notifications."

**Decisions** is for future maintainers. Each decision follows the ADR (Architecture Decision Record) format adapted for design. The critical field is **Alternatives considered** — without it, future designers will propose the same rejected alternatives. Stripe's payment form DESIGN.md records that they considered inline validation (rejected: too aggressive for payment fields where users type slowly), post-submit validation (rejected: users must re-find errors), and field-exit validation (accepted: validates when user moves to next field, balances feedback speed with interruption).

**Visual Spec** is for developers. It must use design tokens, not raw values. "The card has `spacing.card.padding` internal padding, `elevation.card.default` shadow, and `radius.card` border radius" is implementation-ready. "The card has 16px padding, a subtle shadow, and rounded corners" requires the developer to guess which token maps to "subtle" and "rounded."

**Component Inventory** lists every component used in the feature, its variant, and its state coverage. A notification center inventory might read: "NotificationCard (variants: info, warning, error, success; states: unread, read, dismissed, loading), NotificationGroup (variants: collapsed, expanded; states: all-read, has-unread, empty), BulkActionBar (states: hidden, visible, processing)."

**Open Questions** is a forcing function. Every unresolved ambiguity must be written down with an owner and a deadline. "Q: Should notifications older than 30 days auto-archive? Owner: @sarah. Deadline: 2024-11-15." If an open question has no owner and no deadline, it will never be resolved.

### Annotation Best Practices

Annotations should follow a consistent format across the team. A proven annotation structure:

| Annotation Type     | Format                             | Example                                                 |
| ------------------- | ---------------------------------- | ------------------------------------------------------- |
| Spacing override    | `[spacing] value — reason`         | `[spacing] 24px — extra breathing room for icon weight` |
| Conditional display | `[condition] rule`                 | `[condition] visible when notifications.length > 0`     |
| Responsive change   | `[breakpoint] behavior`            | `[breakpoint] <768px: stack vertically, full-width`     |
| Truncation          | `[truncation] rule`                | `[truncation] 2 lines, ellipsis, tooltip on hover`      |
| Interaction         | `[interaction] trigger — behavior` | `[interaction] long press — reveal drag handle`         |
| Accessibility       | `[a11y] requirement`               | `[a11y] aria-live="polite" for new notification count`  |

Keep annotations terse. An annotation is a pointer to a decision, not an essay. If the rationale is complex, the annotation should reference the corresponding decision entry: `[spacing] 24px — see D4 in DESIGN.md`.

### Living Documentation Strategies

**Strategy 1: Code-adjacent documentation.** Place a `DESIGN.md` in the same directory as the feature code. When a developer opens the feature directory, the design rationale is right there. This is the approach used by many open-source design systems including Primer (GitHub) and Polaris (Shopify). The documentation is reviewed in the same PR as the code, ensuring they stay synchronized.

**Strategy 2: Storybook as living spec.** Each Storybook story can include a "Design" tab (using the `@storybook/addon-designs` plugin) that embeds the Figma frame, plus a "Documentation" tab (using MDX) that contains usage guidelines, dos/don'ts, and decision rationale. The component, its visual spec, and its documentation coexist in the same tool. When the component changes, the Storybook story changes, and the documentation mismatch becomes immediately visible.

**Strategy 3: Token-driven documentation.** When design tokens are the source of truth, the token file itself becomes the documentation. A token like `color.action.primary.default: #0066FF` with a description field `"Primary action color — used for all primary buttons, links, and interactive elements. Do not use for informational or status indicators."` is both implementation and documentation. Tools like Style Dictionary can generate documentation sites directly from token files.

### Decision Log Maintenance

Decision logs rot when they are append-only with no review cycle. Implement a quarterly review where each decision is re-evaluated:

- **Still valid?** Keep it, add a "reviewed YYYY-MM-DD" note
- **Outdated?** Mark as `deprecated` with the date and reason
- **Wrong?** Mark as `superseded by D[n]`, write the new decision, and update the implementation

### Anti-Patterns

1. **The Screenshot Graveyard.** Dropping PNG screenshots into a wiki page with no context, no annotations, and no update mechanism. Within weeks, the screenshots diverge from the implemented UI. Within months, nobody knows if the screenshot represents the intended design or a legacy version. Screenshots without version numbers, dates, and associated decision entries are noise, not documentation. Use linked Figma frames or automated visual regression screenshots instead.

2. **Tribal Knowledge Masquerading as Documentation.** "Ask Jordan, they know why we did it that way." This is not documentation — it is a single point of failure. When Jordan leaves, the rationale leaves with them. Every design decision that lives only in someone's head must be extracted and written into DESIGN.md. A good test: if every designer and developer on the team were replaced tomorrow, could the new team understand every design decision from the documentation alone?

3. **The Specification Novel.** A 40-page spec document that describes every pixel in prose, updated by one person, read by nobody. Long-form spec documents have a half-life of about two sprints before they diverge from reality. Keep specs modular (one DESIGN.md per feature), terse (use tables and token references, not paragraphs), and reviewable (small enough to review in a PR diff). If a spec takes more than 10 minutes to read, it is too long.

4. **Documenting What, Not Why.** "The button is blue" is not a design decision — it is a description. "The button is blue (color.action.primary) because blue tested 18% higher in task completion than green in our A/B test (2024-Q2), and aligns with our brand palette where blue signals interactivity and green signals success/completion" is a design decision. Documentation without rationale is just a less efficient way to read the CSS.

5. **Post-Hoc Documentation.** Writing design documentation after the feature ships, reconstructing rationale from memory. By that point, the alternatives considered are forgotten, the trade-offs are rationalized, and the documentation reads like a justification rather than a decision record. Document decisions when they are made, in real time, as part of the design process — not as a cleanup task after launch.

### Real-World Examples

**Stripe's Component Documentation.** Every component in Stripe's internal design system includes: a usage description, a "When to use / When not to use" section, a props table with types and defaults, a state matrix showing all visual states, a "Design decisions" section recording why the component looks and behaves the way it does, and a changelog linking each visual change to the research or feedback that motivated it. This documentation is generated partially from code (props table, state matrix) and partially maintained by hand (rationale, usage guidance), striking a balance between automation and human insight.

**GitHub Primer's ADR System.** Primer uses Architecture Decision Records for design system decisions. ADR-001 might record "Use CSS custom properties for theming" with full context on why CSS-in-JS was rejected (build complexity, runtime cost) and why Sass variables were superseded (no runtime theming). Each ADR is a markdown file in the repository, reviewed in PRs, and cross-referenced from component documentation. When a developer asks "Why don't we use styled-components?", the answer is a link, not a debate.

**Apple's Human Interface Guidelines as Living Documentation.** The HIG is the gold standard for design documentation at scale. Every component has: a description of its purpose, platform-specific usage guidance (iOS vs macOS vs watchOS), a "Best practices" section that functions as a decision log ("Use action sheets instead of alerts when offering more than two choices"), specific measurements and spacing values, and accessibility requirements. The HIG is updated with every OS release, with change annotations marking what is new. It demonstrates that documentation can scale to thousands of components across multiple platforms without becoming unreadable.

**Material Design's Documentation Structure.** Material Design 3 documents each component with: an overview, anatomy diagram (labeling every visual element), usage guidelines, specs (exact dimensions, spacing, elevation), states (with visual examples of each), accessibility notes, and implementation guidance per platform (Android, iOS, Web, Flutter). The documentation is generated from a single source and published to multiple formats. Every specification includes the design rationale — not just "the FAB is 56dp" but why 56dp is the minimum touch target that balances reachability and visual prominence.

## Source

- Keeling, M. — _Design It!_ (2017), documenting design decisions in software
- Nygard, M. — "Documenting Architecture Decisions" (2011), the original ADR format
- Apple — Human Interface Guidelines, https://developer.apple.com/design/human-interface-guidelines/
- Material Design — Component documentation format, https://m3.material.io/components
- GitHub Primer — ADR process, https://primer.style/

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
