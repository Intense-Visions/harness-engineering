# Design Governance

> Living system maintenance covering contribution models, deprecation processes, versioning strategies, adoption metrics, and documentation standards for treating a design system as a product.

## When to Use

- Launching a design system and need a governance structure before the first external contribution
- A design system has grown past 30 components and informal processes are breaking down
- Teams are forking components instead of contributing back, creating drift
- Planning a breaking change and need a deprecation strategy that does not strand consumers
- Leadership asks "is the design system working?" and you have no metrics to answer

## Instructions

A design system without governance is a component library with an expiration date. Governance is the set of processes that keep a design system alive, coherent, and adopted as it scales across teams, products, and years. It answers five questions: Who can change the system? How do changes get approved? How do breaking changes propagate? How do we measure health? How do we document everything?

**The governance maturity model:**

1. **Ad hoc (1-10 components).** One team owns everything. Changes happen in PRs. Documentation is README files. This works for 6-12 months.
2. **Defined (10-50 components).** Contribution guidelines exist. A review board approves additions. Versioning follows semver. Migration guides accompany breaking changes.
3. **Managed (50-200 components).** Dedicated design system team. Formal RFC process. Automated adoption metrics. Deprecation timelines enforced. Multi-product support.
4. **Optimized (200+ components).** Community-driven contributions. Automated visual regression. Self-service documentation. Design system as internal product with roadmap, OKRs, and user research.

Most systems stall at level 1. The goal of this document is to help you reach level 2 early and level 3 within the first year.

## Details

### Contribution Models

A contribution model defines who can propose, implement, and approve changes to the design system.

**Centralized model:** A dedicated design system team owns all code. Product teams submit requests; the DS team prioritizes and implements. Used by Stripe (small, senior DS team controls all changes to the shared library).

- Advantages: Consistency, quality control, single source of truth.
- Disadvantages: Bottleneck. Product teams wait weeks for component additions. Resentment builds.

**Federated model:** Product teams implement components and submit them to the system. The DS team reviews, provides feedback, and merges. Used by Atlassian (product teams contribute to `@atlaskit` packages through a structured RFC and review process).

- Advantages: Scales with organization size. Product teams feel ownership.
- Disadvantages: Quality variance. Contributions may not generalize well. Review burden on DS team.

**Hybrid model (recommended):** The DS team owns core atoms and molecules. Product teams contribute organisms and patterns through a defined process. Used by Salesforce Lightning and IBM Carbon.

**Salesforce Lightning's contribution workflow:**

1. Contributor opens an RFC issue describing the component, its use cases, and proposed API.
2. DS team triages within 5 business days: accept, request changes, or defer.
3. Accepted RFCs enter a design review (Figma spec + accessibility checklist).
4. Implementation follows the DS team's coding standards, submitted as a PR.
5. DS team reviews code for token usage, accessibility, documentation, and test coverage.
6. Merged components enter a 30-day beta period before stable release.

**IBM Carbon's community contribution model** is fully open-source. External contributors submit components through GitHub PRs. Carbon's team maintains a "Component Status" board showing every component's lifecycle stage: proposed, draft, experimental, stable, deprecated. Each transition requires explicit approval from a Carbon maintainer.

### Deprecation Process

Deprecation is the most underinvested governance area. A component or token that is removed without a migration path breaks consumer trust permanently.

**The deprecation lifecycle:**

| Phase        | Duration           | Actions                                                                                                      |
| ------------ | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Announce** | Release N          | Add `@deprecated` JSDoc tag. Add console.warn in dev mode. Update docs with migration guide.                 |
| **Warn**     | Release N+1 to N+2 | Console.warn in dev and production. Codemod published (if feasible). Adoption metrics track remaining usage. |
| **Remove**   | Release N+3        | Component removed from package. Import fails with descriptive error message pointing to replacement.         |

**Minimum deprecation window:** 3 minor releases or 6 months, whichever is longer. Atlassian enforces a 12-month deprecation window for any component with more than 10 consumer teams.

**Deprecation artifacts (all required):**

1. **Migration guide:** Step-by-step instructions showing old code, new code, and edge cases. Not "use ComponentB instead" but the exact prop mapping, slot changes, and behavior differences.
2. **Codemod (when feasible):** An automated transform (using jscodeshift, ts-morph, or similar) that converts old usage to new. GitHub Primer publishes codemods for every component migration.
3. **Adoption dashboard entry:** A live counter showing how many files/instances still use the deprecated component, per consuming team.

**Salesforce Lightning deprecation example:** When `lightning-card` v1 was replaced by v2, Salesforce published a migration guide with 14 before/after code examples covering every prop and slot change. They provided a codemod that handled 80% of migrations automatically. The remaining 20% (custom slot content) received dedicated office hours from the DS team.

### Versioning Strategy

Design systems must version thoughtfully because their consumers are internal teams who cannot choose to skip a version.

**Semantic versioning applied to design systems:**

- **Major (X.0.0):** Breaking changes to component APIs, token removals, fundamental layout changes. Requires migration guide.
- **Minor (0.X.0):** New components, new variants, new tokens. No existing API changes. Safe to upgrade without code changes.
- **Patch (0.0.X):** Bug fixes, visual corrections, documentation updates. No API changes.

**What counts as a breaking change in a design system:**

- Removing a prop, token, or component
- Renaming a prop, token, or component
- Changing a prop's type (string to enum, optional to required)
- Changing default values that affect layout (default size from `md` to `lg`)
- Changing token values that affect contrast ratios (WCAG compliance boundary)

**What does NOT count as breaking:**

- Adding a new optional prop with a sensible default
- Adding a new component
- Adjusting visual properties that do not affect layout (changing a shadow's blur radius by 1px)
- Adding a new token

**Material Design's versioning approach:** M1 to M2 was a full rewrite (major). M2 to M3 introduced new components alongside old ones with a gradual migration path. Google maintains both M2 and M3 component libraries simultaneously, allowing product teams to migrate on their own timeline. This dual-support model costs engineering resources but prevents forced migration crises.

**Multi-package versioning:** Large systems (Atlassian, IBM Carbon) version individual packages independently. `@atlaskit/button` at v16 while `@atlaskit/modal-dialog` is at v12. This allows granular upgrades but requires a compatibility matrix. Atlassian maintains a public "Supported Combinations" page listing which package versions are tested together.

### Adoption Metrics

"Is the design system working?" requires quantitative answers. Track these metrics:

**Coverage metrics:**

- **Component adoption rate:** Percentage of UI instances in product code that use DS components vs custom implementations. Target: >80% after 12 months. Salesforce measures this by scanning product repos for `lightning-*` imports vs raw HTML elements.
- **Token adoption rate:** Percentage of color, spacing, and typography values that resolve to DS tokens vs hardcoded values. Target: >90%. IBM Carbon runs a Stylelint rule that flags any non-token CSS value.
- **Page coverage:** Percentage of pages in the application that use at least one DS component. Target: 100%.

**Health metrics:**

- **Contribution velocity:** Number of community-contributed components merged per quarter. Atlassian targets 3-5 per quarter from outside the DS team.
- **Issue resolution time:** Median time from bug report to fix release. Target: <2 weeks for accessibility issues, <4 weeks for feature requests.
- **Deprecation compliance:** Percentage of deprecated components removed by the deadline. Target: 100%.

**Satisfaction metrics:**

- **Developer satisfaction (quarterly survey):** "How easy is it to build UIs with the design system?" on a 1-5 scale. Target: >4.0. Shopify Polaris runs this survey and publishes results internally.
- **Designer satisfaction:** "How well does the Figma library match the code library?" Target: >4.0.
- **Onboarding time:** Time for a new developer to ship their first feature using the DS. Target: <1 day with documentation, <3 days without.

**Atlassian's adoption dashboard** is a live internal tool that shows per-product adoption rates, broken down by component. Product teams see their adoption percentage on a leaderboard. Teams below 70% adoption receive a quarterly nudge from the DS team with an offer of pairing sessions.

### Documentation Standards

Documentation is the design system's user interface. If the docs are bad, the system is bad -- regardless of code quality.

**Required documentation per component:**

1. **Overview:** One paragraph describing what the component is and when to use it. Not how it works internally, but what problem it solves for the consumer.
2. **Interactive examples:** Live, editable code examples showing every variant, size, and state. Storybook or a custom playground. Not screenshots.
3. **Props/API table:** Every prop with name, type, default, required/optional, and a one-sentence description. Auto-generated from TypeScript types.
4. **Accessibility:** Which ARIA roles and properties the component uses. Keyboard interaction pattern. Screen reader announcement behavior. Tested with VoiceOver/NVDA/JAWS.
5. **Design guidelines:** When to use this component vs alternatives. "Use Card for grouped content. Use Banner for page-level messages. Do not use Card as a button -- use ActionCard instead."
6. **Migration notes (if applicable):** What changed from the previous version and how to upgrade.

**Shopify Polaris documentation structure:** Every component page has four tabs: Examples (interactive), Props (auto-generated), Accessibility (manual), and Best Practices (design guidelines with Do/Don't image pairs). Their "Best Practices" tab averages 5-7 rules per component with visual examples of correct and incorrect usage.

**Apple Human Interface Guidelines** serve as the canonical example of governance-level documentation. Each component has: purpose statement, platform availability matrix, configuration options with visual examples, and behavioral guidelines ("A toggle should take effect immediately without requiring a save action"). Apple updates the HIG in sync with every OS release.

### Anti-Patterns

**Governance by committee.** A review board of 12 people that meets monthly and takes 3 months to approve a new component. Governance should enable speed, not prevent it. Atlassian's solution: a 3-person rotating review panel with a 5-day SLA. Any 2 of 3 can approve. Deadlocks escalate to the DS lead.

**Documentation as afterthought.** "We will document it after the component is stable." Stable components without documentation are invisible to consumers. Salesforce Lightning requires documentation to be part of the PR -- a component cannot merge without its doc page, examples, and accessibility section complete.

**Silent deprecation.** Removing a component in a minor release without warning, migration guide, or codemod. This trains consumers not to upgrade, because upgrades are dangerous. Every removal MUST follow the deprecation lifecycle: announce, warn, remove.

**Vanity metrics.** Tracking "number of components in the system" as a success metric. A system with 200 poorly designed components is worse than one with 40 excellent ones. Track adoption and satisfaction, not inventory size.

**Forking tolerance.** Allowing product teams to fork DS components into their codebases "temporarily" without a plan to merge back. Every fork that lasts more than one sprint becomes permanent. IBM Carbon addresses this by requiring fork requests to include a "merge-back plan" with a deadline. Forks without merge-back plans are denied.

### Real-World Examples

**Salesforce Lightning Design System** is the gold standard for enterprise design system governance. They maintain a public contribution guide, a structured RFC process, a deprecation policy with 6-month minimums, automated adoption scanning across 100+ internal products, and a dedicated documentation team. Their "Component Blueprint" format is a template that every new component must follow before review begins.

**IBM Carbon** operates as an open-source design system with governance that supports both IBM internal teams and external community contributors. Their GitHub repository has 3,500+ stars, 900+ contributors, and a maintainer team of 15. They use GitHub Projects for roadmap visibility, label-driven triage, and a "good first issue" program for onboarding new contributors. Every component has a lifecycle status badge on its documentation page.

**Atlassian Design System** governs a multi-product design system serving Jira, Confluence, Trello, Bitbucket, and 10+ other products. Their "Design System Council" (3 designers + 3 engineers, rotating quarterly) reviews all component proposals. They publish adoption metrics per product, run quarterly developer satisfaction surveys, and maintain a "Design System Health" internal dashboard that surfaces components with low adoption, high bug counts, or missing accessibility coverage.

**Apple Human Interface Guidelines** represent governance through documentation authority. Apple does not accept community contributions to their design system, but their governance model -- centralized ownership, exhaustive documentation updated in sync with platform releases, strict deprecation through SDK versioning -- has maintained consistency across 40 years of products. Their "Designed for iPad" and "Designed for iPhone" badges are adoption metrics: apps that do not follow HIG guidelines do not receive Apple's endorsement.

## Source

Brad Frost, "Design Systems are for People" (2019). Nathan Curtis, "The Design System Product" (2020). Jina Anne, "Design Tokens and Theming" (2019). Dan Mall, "Design System in 90 Days" (2022). Salesforce Lightning Design System Governance documentation. IBM Carbon Design System Contribution Guidelines. Atlassian Design System documentation.

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
