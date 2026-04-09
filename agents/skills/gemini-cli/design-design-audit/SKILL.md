# Design Audit

> Evaluating existing design — heuristic evaluation (Nielsen's 10), consistency inventory, accessibility audit, competitive analysis, identifying and quantifying design debt

## When to Use

- Inheriting a codebase or product with no documented design system and needing to assess current state
- Preparing for a redesign by cataloging what exists, what works, and what is broken
- Quantifying design debt to justify investment in a design system or refactor
- Evaluating a competitor's product to identify gaps and opportunities in your own
- Running a periodic health check on a mature product to catch consistency drift
- Onboarding a new design team member who needs to understand existing patterns
- Preparing evidence for stakeholders that design quality directly impacts business metrics
- Assessing WCAG compliance across a product before a regulatory deadline
- Investigating why user satisfaction scores have declined despite no intentional changes

## Instructions

1. **Define the audit scope and success criteria before starting.** An audit without boundaries becomes an infinite task. Specify:
   - Which screens or flows are in scope
   - Which heuristics or standards you are evaluating against
   - What the output format will be
   - Who the audience is
   - A checkout flow audit for WCAG 2.1 AA compliance is a different exercise than a full-product heuristic evaluation for a redesign proposal. Mixing scopes produces a report too broad to be actionable.
   - Document the scope in a single sentence: "This audit evaluates the settings page (account, notifications, security, billing tabs) against Nielsen's 10 heuristics and WCAG 2.1 AA, producing a prioritized findings report for the product team."

2. **Conduct a heuristic evaluation using Nielsen's 10 usability heuristics.** Walk through every screen in scope and evaluate against each heuristic systematically. Do not rely on memory — open the actual product and interact with it. For each heuristic, note:
   - Specific violations with screenshots
   - The severity (cosmetic, minor, major, catastrophic on Nielsen's 0-4 scale)
   - The affected user task
   - **The 10 heuristics:** (1) Visibility of system status, (2) Match between system and real world, (3) User control and freedom, (4) Consistency and standards, (5) Error prevention, (6) Recognition rather than recall, (7) Flexibility and efficiency of use, (8) Aesthetic and minimalist design, (9) Help users recognize/diagnose/recover from errors, (10) Help and documentation.
   - A thorough evaluation of a 20-screen product typically surfaces 50-150 findings. Prioritize by severity and frequency.

3. **Build a consistency inventory.** A consistency inventory catalogs every visual and interaction pattern in the product:
   - Every button style (primary, secondary, ghost, icon-only — with hex colors, border-radius, padding, font-size)
   - Every spacing value used across the product
   - Every font/weight/size combination
   - Every color in active use
   - Every icon style and source library
   - Every form input variant
   - Every modal and dialog pattern
   - Every navigation pattern
   - Export into a spreadsheet or visual grid. The inventory reveals inconsistency invisible when looking at one screen at a time. Shopify discovered 47 unique button styles when they expected 4. Atlassian found 13 different date picker implementations.

4. **Measure design debt quantitatively.** Design debt is the accumulation of inconsistent, outdated, or suboptimal design decisions. Quantify by counting:
   - Unique variants of each component type (buttons: 12 variants when 4 are needed = 8 units of debt)
   - Orphaned patterns (components used on only one screen that could use a standard pattern)
   - Accessibility violations (each WCAG failure is a debt item)
   - Broken interaction patterns (flows that dead-end, error states with no recovery path)
   - Assign a remediation cost estimate to each category: "Consolidating 47 button styles to 4 requires updating 230 instances across 85 screens — estimated 3 engineering sprints." This transforms subjective feeling ("our UI is inconsistent") into a concrete business case.

5. **Perform a competitive audit for design patterns.** Select 3-5 direct competitors and 2-3 best-in-class products outside your category. For each, document:
   - Navigation structure and information architecture
   - Onboarding flow and first-run experience
   - Key task flows (the 3-5 most common user actions)
   - Empty states and zero-data states
   - Error handling and recovery patterns
   - Mobile adaptation strategy
   - Focus on patterns, not aesthetics. "Competitor A uses progressive disclosure in their settings — grouping 40+ settings into 6 categories with expand/collapse, while our product shows all 40 on a single page" is a finding. "Competitor A looks more modern" is not.

6. **Audit for accessibility against WCAG 2.1 AA.** Use both automated tools and manual testing. Automated tools (axe, Lighthouse, WAVE) catch approximately 30-40% of accessibility issues — the remaining 60-70% require manual evaluation:
   - Keyboard navigation through every interactive flow
   - Screen reader testing (VoiceOver on macOS, NVDA on Windows)
   - Focus order verification
   - Color contrast measurement for all text/background combinations
   - Touch target size verification (minimum 44x44px per WCAG 2.5.5)
   - Form label association check
   - Document each finding with: the specific WCAG criterion violated, the affected element, current behavior, and required behavior.

7. **Synthesize findings into a severity-prioritized report.** Raw audit data is overwhelming. Synthesize into four tiers:
   - **Critical** — blocks user tasks, causes data loss, fails legal compliance. Fix immediately.
   - **Major** — significant usability degradation, accessibility failures affecting large segments. Fix this quarter.
   - **Minor** — inconsistencies and friction that degrade experience but do not block tasks. Fix in next redesign cycle.
   - **Opportunity** — enhancements inspired by competitive audit or emerging best practices. Backlog for future.
   - Each finding needs: description, evidence (screenshot + specific values), affected heuristic or standard, severity, and recommended fix.

8. **Establish a baseline and schedule recurring audits.** A single audit is a snapshot. Design debt accumulates continuously. Establish metrics from the audit and re-measure quarterly:
   - Number of unique component variants (button styles, modal types, etc.)
   - WCAG violation count by severity
   - Heuristic violation count by severity
   - Track the trendline. If button variants grew from 12 to 18 between audits, design system adoption is broken. If WCAG violations dropped from 45 to 12, the accessibility initiative is working.

## Details

### Nielsen's Heuristics — Evaluation Depth Guide

Each heuristic requires specific evaluation techniques:

**H1: Visibility of system status.** Check every state transition:

- Loading indicators on network requests (spinners or skeleton screens?)
- Progress indicators on multi-step flows (does the user know step 3 of 5?)
- Confirmation feedback on user actions (does saving show a success state?)
- Real-time sync indicators (does the user know if data is current?)
- Any operation taking more than 1 second without feedback violates this heuristic.

**H2: Match between system and real world.** Audit all labels, error messages, and instructional text. "CORS error" in a consumer product fails this heuristic. "Unable to connect — check your internet connection" passes. Check icon metaphors: does a floppy disk mean "save" to users who have never seen one?

**H4: Consistency and standards.** The heuristic most served by the consistency inventory:

- Internal consistency: does the same action look and behave the same across all screens?
- External consistency: does the product follow platform conventions (iOS back gesture, Android material patterns, web form conventions)?
- Are destructive actions always red? Are primary actions always in the same position? Does "Cancel" always go to the same place?

**H5: Error prevention.** Audit every form and destructive action:

- Are required fields marked before submission, not just after?
- Do confirmation dialogs appear before irreversible actions?
- Are input constraints communicated upfront (password requirements shown before typing)?
- Does the system prevent invalid states (disabled submit until form is valid)?

### Design Debt Taxonomy

Design debt falls into five categories, each with different remediation strategies:

1. **Pattern fragmentation.** The same UI concept implemented differently across the product. Example: three different loading patterns (spinner, skeleton, progress bar) used interchangeably with no governing logic. Remediation: define a loading pattern decision tree and migrate all instances.

2. **Stale patterns.** UI that followed best practices when built but has not been updated. Example: a modal without focus trapping — acceptable in 2018, a WCAG violation since 2.1. Remediation: identify all stale patterns, prioritize by impact, update incrementally.

3. **Inconsistent spacing and sizing.** Values that drift from the system scale. Example: the design system defines an 8px grid, but screens use 7px, 9px, 10px, 13px because developers eyeballed values. Remediation: find-and-replace with design token audit tooling.

4. **Orphaned components.** One-off UI elements that could use a standard component. Example: a custom date range picker on analytics when the design system has a standard one. Remediation: replace with the standard component, accounting for edge cases the custom version handled.

5. **Missing states.** Components that only handle the happy path. Example: a data table with no empty state, no error state, no loading state, no pagination for large datasets. Remediation: define the full state matrix for each component and implement missing states.

### Audit Output Templates

**Finding card format:**

```
ID: AUDIT-042
Heuristic: H4 (Consistency and standards)
Severity: Major (3/4)
Screen: Settings > Notifications
Finding: The "Save" button in notification preferences is left-aligned,
  while every other settings tab places "Save" right-aligned.
Evidence: [screenshot with annotation]
Impact: Users with muscle memory for right-aligned save will miss this button.
Recommendation: Move to right-aligned position consistent with other tabs.
Effort: Low (CSS change, 1 file)
```

**Summary dashboard metrics:**

| Category                | Count | Critical | Major | Minor |
| ----------------------- | ----- | -------- | ----- | ----- |
| Heuristic violations    | 87    | 4        | 23    | 60    |
| WCAG failures           | 34    | 8        | 19    | 7     |
| Pattern inconsistencies | 156   | 0        | 42    | 114   |
| Missing states          | 28    | 6        | 15    | 7     |

### Anti-Patterns

1. **The Screenshot Safari.** Collecting hundreds of screenshots with no analytical framework. The auditor spends two weeks capturing every screen, produces a 200-slide deck, and nobody reads it because there is no synthesis, no prioritization, and no recommendation. The fix: evaluate against a framework (Nielsen's heuristics, WCAG criteria) and produce a prioritized findings report. Screenshots are evidence, not the deliverable.

2. **The Perfection Trap.** Treating every inconsistency as equally urgent. An audit that flags "the border-radius is 7px instead of 8px" with the same severity as "users cannot recover from a failed payment without clearing their browser cache" has lost all sense of proportion. The fix: use a severity scale ruthlessly. Only critical findings block releases. Minor findings go to the backlog.

3. **The Audit-and-Forget.** Running a comprehensive audit, producing an excellent report, and never acting on it. Six months later the same issues persist plus new ones. The fix: tie audit findings to sprint planning. Each sprint pulls the top 3 findings from the audit backlog. Track remediation velocity. Re-audit quarterly.

4. **Solo Evaluator Bias.** A single person conducts the entire heuristic evaluation. Research shows one evaluator finds only 35% of usability problems. Three to five independent evaluators find 75-85%. The fix: use multiple evaluators who audit independently before comparing findings. The disagreements are often the most valuable discussion points.

### Real-World Examples

**Shopify's Polaris Audit (2017).** Before building Polaris, Shopify audited their entire admin interface. They discovered: 47 unique button styles, 12 different modal implementations, inconsistent spacing ranging from 4px to 37px with no system, and color usage that had drifted so far that no source of truth existed. The audit quantified the cost: engineers spent an estimated 30% of UI development time making decisions a design system would eliminate. This data justified the multi-year Polaris investment. The methodology — screenshot every component variant, categorize, count, calculate remediation cost — became a template Atlassian, Salesforce, and GitLab later adopted.

**UK Government Digital Service (GDS) Accessibility Audit.** GDS audited all gov.uk services against WCAG 2.1 AA in 2019. They tested 900+ forms across 150 services. Findings: 62% had form labels not programmatically associated with inputs, 41% had insufficient color contrast on at least one critical element, 23% had keyboard traps in modal dialogs. Results were published publicly, creating accountability. Each service team received a prioritized remediation list. Within 12 months, critical violations dropped 78%.

**Atlassian Design System Consolidation.** When Atlassian unified Jira, Confluence, Trello, and Bitbucket under a single design system, they first audited all four products. The audit revealed: 13 date picker variants, 8 avatar implementations, 5 dropdown menus, and color palettes that overlapped but were not identical. Each variant was categorized as "keep," "merge," or "deprecate." The merged components retained the best accessibility characteristics from any variant. The audit took 6 weeks; the consolidation roadmap spanned 18 months.

## Source

- Nielsen, J. — "10 Usability Heuristics for User Interface Design" (1994, updated 2020)
- Nielsen, J. — "How to Conduct a Heuristic Evaluation" (1994), evaluator methodology
- W3C — "Web Content Accessibility Guidelines (WCAG) 2.1" (2018), AA conformance criteria
- Kholmatova, A. — _Design Systems_ (2017), pattern inventories and system auditing
- Curtis, N. — _Modular Web Design_ (2010), component inventory methodology
- Shopify Polaris Team — "Building a Design System from Scratch" (2017), audit-first approach

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
