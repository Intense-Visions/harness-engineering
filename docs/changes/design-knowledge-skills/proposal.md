# Design Knowledge Skills — Framework-Agnostic Design Principles

**Keywords:** design-theory, visual-hierarchy, color-theory, typography, gestalt, interaction-design, design-systems, layout, composition, accessibility

## Overview

A library of 55 knowledge-type skills (`design-*`) that teach design thinking — the theory, principles, and craft behind effective visual and interaction design. These skills make any developer capable of producing world-class design by providing the _why_ behind design decisions, regardless of implementation framework.

The existing skill library covers _implementation_ (12 `css-*` skills for Tailwind mechanics, 10 `a11y-*` skills for accessibility rules, 8 `harness-*` design tooling skills). What's missing is the _design thinking_ layer — the knowledge that makes a novice _choose the right design_ before implementing it. These 55 skills fill that gap.

### Architecture

```
design-* knowledge skills (this proposal)     ← design thinking
    ↕ related_skills
css-*, a11y-* knowledge skills (existing)     ← implementation mechanics
    ↕ related_skills
harness-design-* behavioral skills (existing) ← design system tooling
```

The `related_skills` field on each skill enables the dispatcher to assemble comprehensive coverage on demand. A task that requires "choose a color palette for a dark mode fintech dashboard" would pull `design-palette-construction` + `design-dark-mode-color` + `design-color-accessibility` + `design-data-viz-design` via traversal — achieving the depth of a monolithic design reference through composition of focused skills.

### Hard Rules

1. **A complete novice following these skills produces design indistinguishable from expert work.** No handwaving, no "use your judgment" — every principle includes concrete decision procedures.
2. **Every skill is framework-agnostic.** They teach _what good design is_, not _how to write CSS_. Implementation links exist only via `related_skills` to `css-*`/`a11y-*` skills.
3. **PhD-level rigor, practitioner-level accessibility.** No dumbed-down summaries, but no academic jargon without concrete examples. Every abstraction is grounded in real-world design systems (Stripe, Apple, Vercel, Material Design, etc.).
4. **Every principle includes worked examples** showing the principle applied in production design, with specific values (not "use a nice blue" — "Stripe uses `#533afd` because saturated violet reads as confident and premium in fintech contexts").
5. **Every skill includes anti-patterns** with descriptions of what bad application looks like, so the reader can self-diagnose mistakes.

### Non-Goals

- Implementation-specific guidance (covered by existing `css-*`, `a11y-*` skills)
- Brand-specific design system generation (covered by `harness-design` and `harness-design-system`)
- Design tool usage (Figma, Sketch, etc.)
- Page templates or layout recipes (these are implementation patterns, not principles)

## Decisions

| Decision                                                  | Rationale                                                                                                                                                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework-agnostic principles, not implementation-bound   | The existing `css-*` skills cover implementation. These skills teach the _why_ — knowledge that transfers across any framework.                                                                                              |
| 55 focused skills (150-250 lines each), not 20 large ones | Smaller skills score higher in dispatcher matching (more precise relevance), compose better via `related_skills`, and match the existing 485-skill pattern.                                                                  |
| Flat `design-` prefix, no subdomain prefixes              | Subdomain clustering is handled by `related_skills`, not naming convention. `design-micro-interactions` is clearer than `design-ix-micro-interactions`.                                                                      |
| Discipline-organized taxonomy (10 domains)                | Clean mental model with clear boundaries. Cross-disciplinary concerns handled by `related_skills` traversal.                                                                                                                 |
| `type: knowledge` skills                                  | No tools, no phases, no persistent state. Consumed as context by behavioral skills and agents.                                                                                                                               |
| Worked examples from real design systems                  | Grounds every principle in observable reality. Stripe's weight-300 headlines, Apple's vibrancy layers, Vercel's monochrome precision — these are not opinions, they are documented design decisions with measurable effects. |

## Technical Design

### Skill Structure (per skill)

Each skill follows the existing knowledge skill format:

**skill.yaml:**

```yaml
name: design-<topic>
version: '1.0.0'
description: <one-line description>
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code
  - gemini-cli
  - cursor
  - codex
tools: []
paths: []
related_skills:
  - design-<related-1>
  - design-<related-2>
  - <cross-domain-skill> # e.g., css-dark-mode, a11y-color-contrast
stack_signals: []
keywords:
  - <domain-specific keywords for dispatcher scoring>
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

**SKILL.md structure:**

```markdown
# <Skill Title>

> <One-line description of the principle>

## When to Use

- <Concrete trigger conditions>
- <NOT conditions>

## Instructions

1. <Step-by-step application of the principle>
2. <Each step includes concrete values, ratios, or decision procedures>
3. <No "use your judgment" — always provide a default answer>

<Code/specification examples showing exact values>

## Details

### <Sub-topic 1>

<Deep coverage with worked examples from real design systems>

### <Sub-topic 2>

<Additional depth>

### Anti-Patterns

- <What bad application looks like>
- <Common mistakes with explanation of why they fail>

### Real-World Examples

- **Stripe:** <specific application with exact values>
- **Apple:** <specific application>
- **Vercel:** <specific application>

## Source

<Authoritative references — WCAG specs, design system docs, research papers>

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
```

### Complete Skill Taxonomy (55 skills, 10 domains)

#### Domain 1: Color (6 skills)

| Skill                         | Description                                                                                                     | `related_skills`                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `design-color-harmony`        | Color wheel relationships — complementary, analogous, triadic, split-complementary, tetradic schemes            | `design-color-psychology`, `design-palette-construction`, `design-contrast-ratio`                           |
| `design-contrast-ratio`       | Luminance contrast for readability and visual weight — WCAG ratios, contrast as hierarchy tool                  | `design-color-harmony`, `design-color-accessibility`, `a11y-color-contrast`, `design-visual-hierarchy`      |
| `design-color-psychology`     | Emotional and cultural color associations — warmth/coolness, trust, urgency, industry conventions               | `design-color-harmony`, `design-brand-consistency`                                                          |
| `design-palette-construction` | Building functional palettes — primary/secondary/accent, neutral scales, semantic colors, tint/shade generation | `design-color-harmony`, `design-color-accessibility`, `design-dark-mode-color`, `design-token-architecture` |
| `design-dark-mode-color`      | Color adaptation for dark themes — inverted hierarchy, reduced saturation, elevation through lightness          | `design-palette-construction`, `design-elevation-shadow`, `design-contrast-ratio`, `css-dark-mode`          |
| `design-color-accessibility`  | Color independence — conveying information without color alone, colorblind-safe palettes, perceptual uniformity | `design-contrast-ratio`, `design-palette-construction`, `a11y-color-contrast`                               |

#### Domain 2: Typography (7 skills)

| Skill                            | Description                                                                                              | `related_skills`                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `design-typography-fundamentals` | Anatomy of type — x-height, ascenders, counters, serifs, stroke contrast, optical sizing                 | `design-type-scale`, `design-font-pairing`, `design-readability`                      |
| `design-type-scale`              | Mathematical type scales — modular, major third, perfect fourth, golden ratio, custom scales             | `design-typography-fundamentals`, `design-visual-hierarchy`, `design-responsive-type` |
| `design-font-pairing`            | Combining typefaces — contrast principles, superfamilies, serif+sans rules, limiting to 2-3 families     | `design-typography-fundamentals`, `design-type-scale`, `design-brand-consistency`     |
| `design-typographic-hierarchy`   | Reading order through type — size, weight, color, spacing, case, and position as hierarchy signals       | `design-type-scale`, `design-visual-hierarchy`, `design-whitespace`                   |
| `design-readability`             | Optimizing for reading — line length, leading, paragraph spacing, alignment, F-pattern/Z-pattern         | `design-typography-fundamentals`, `design-content-density`, `design-responsive-type`  |
| `design-web-fonts`               | Font loading strategy — performance vs. FOUT/FOIT, variable fonts, subsetting, system font stacks        | `design-typography-fundamentals`, `design-responsive-type`                            |
| `design-responsive-type`         | Type across viewports — fluid typography (clamp), viewport scaling, minimum sizes, maintaining hierarchy | `design-type-scale`, `design-readability`, `design-responsive-strategy`               |

#### Domain 3: Layout & Composition (6 skills)

| Skill                        | Description                                                                                             | `related_skills`                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `design-grid-systems`        | Grid theory — column, modular, baseline, compound grids, breaking the grid intentionally                | `design-alignment`, `design-whitespace`, `design-responsive-strategy`                                    |
| `design-whitespace`          | Space as design element — macro vs. micro, breathing room, density control, whitespace as luxury signal | `design-grid-systems`, `design-content-density`, `design-visual-hierarchy`                               |
| `design-visual-hierarchy`    | Directing attention — size, color, contrast, position, isolation, motion as hierarchy tools             | `design-typographic-hierarchy`, `design-contrast-ratio`, `design-whitespace`, `design-gestalt-proximity` |
| `design-alignment`           | Visual order — edge, center, optical vs. mathematical alignment, alignment as invisible structure       | `design-grid-systems`, `design-consistency`                                                              |
| `design-responsive-strategy` | Responsive as design decision — content priority, progressive disclosure, design-first breakpoints      | `design-grid-systems`, `design-responsive-type`, `design-content-density`                                |
| `design-content-density`     | Information density tradeoffs — compact vs. comfortable vs. spacious, data-dense vs. marketing          | `design-whitespace`, `design-readability`, `design-responsive-strategy`                                  |

#### Domain 4: Gestalt & Perception (5 skills)

| Skill                               | Description                                                                                                | `related_skills`                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `design-gestalt-proximity`          | Spatial grouping — elements near each other perceived as related, controlling group membership             | `design-gestalt-similarity`, `design-whitespace`, `design-form-ux`          |
| `design-gestalt-similarity`         | Visual kinship — shared color/size/shape/texture perceived as related, creating categories without labels  | `design-gestalt-proximity`, `design-consistency`, `design-visual-hierarchy` |
| `design-gestalt-closure-continuity` | Pattern completion — brain fills incomplete shapes, follows smooth paths, implications for icons and flow  | `design-gestalt-figure-ground`, `design-iconography`                        |
| `design-gestalt-figure-ground`      | Depth perception — foreground vs. background, ambiguous figure-ground, z-axis ordering, overlay perception | `design-elevation-shadow`, `design-gestalt-closure-continuity`              |
| `design-gestalt-common-fate`        | Motion grouping — elements moving/changing together perceived as a unit, implications for animation        | `design-motion-principles`, `design-state-design`                           |

#### Domain 5: Interaction Design (7 skills)

| Skill                       | Description                                                                                                | `related_skills`                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `design-state-design`       | UI state inventory — empty, loading, partial, error, success, offline, disabled, read-only                 | `design-feedback-patterns`, `design-loading-patterns`, `design-empty-error-states`            |
| `design-micro-interactions` | Small moments — trigger/rules/feedback/loops (Dan Saffer), usability vs. decoration distinction            | `design-feedback-patterns`, `design-motion-principles`, `design-affordances`                  |
| `design-affordances`        | Perceived actionability — signifiers, constraints, mappings (Don Norman), flat design's affordance problem | `design-feedback-patterns`, `design-form-ux`, `design-navigation-ux`                          |
| `design-feedback-patterns`  | System response — immediate vs. delayed, optimistic updates, progress indicators, undo vs. confirm         | `design-state-design`, `design-micro-interactions`, `design-affordances`                      |
| `design-navigation-ux`      | Wayfinding — hub-spoke, hierarchy, flat, content-driven models, information scent, spatial memory          | `design-affordances`, `design-information-architecture`                                       |
| `design-form-ux`            | Form design beyond labels — progressive disclosure, validation timing, smart defaults, error recovery      | `design-affordances`, `design-state-design`, `design-gestalt-proximity`, `a11y-form-patterns` |
| `design-loading-patterns`   | Perceived performance — skeletons, progressive loading, optimistic rendering, perceived vs. actual speed   | `design-state-design`, `design-motion-principles`, `design-empty-error-states`                |

#### Domain 6: Depth & Motion (4 skills)

| Skill                       | Description                                                                                               | `related_skills`                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `design-elevation-shadow`   | Depth as information — shadow anatomy, elevation scale, chromatic shadows, dark mode shadows              | `design-gestalt-figure-ground`, `design-dark-mode-color`                                                        |
| `design-motion-principles`  | Purposeful animation — Disney's 12 adapted for UI, easing, duration, choreography, reducing motion        | `design-micro-interactions`, `design-transitions-timing`, `design-gestalt-common-fate`, `a11y-motion-animation` |
| `design-transitions-timing` | Temporal design — enter/exit asymmetry, stagger, easing functions, duration by element size               | `design-motion-principles`, `design-micro-interactions`                                                         |
| `design-parallax-scroll`    | Scroll-driven depth — rate-differential, scroll reveals, sticky sections, performance, motion sensitivity | `design-motion-principles`, `design-elevation-shadow`                                                           |

#### Domain 7: Design Systems (5 skills)

| Skill                       | Description                                                                                               | `related_skills`                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `design-atomic-design`      | Composition methodology — atoms/molecules/organisms/templates/pages, right level of abstraction           | `design-component-anatomy`, `design-design-governance`                                          |
| `design-token-architecture` | Token taxonomy — primitive/semantic/component tokens, naming, aliasing, theme switching, token pipeline   | `design-palette-construction`, `design-type-scale`, `design-atomic-design`, `css-design-tokens` |
| `design-component-anatomy`  | Reusable components — slots, variants, states, sizes, composition vs. configuration, when to split        | `design-atomic-design`, `design-naming-conventions`                                             |
| `design-naming-conventions` | Design system nomenclature — semantic vs. descriptive names, consistent vocabulary across design and code | `design-token-architecture`, `design-component-anatomy`, `design-design-governance`             |
| `design-design-governance`  | Living system maintenance — contribution, deprecation, versioning, design system as product, adoption     | `design-atomic-design`, `design-naming-conventions`, `design-design-documentation`              |

#### Domain 8: Platform Languages (3 skills)

| Skill                      | Description                                                                                             | `related_skills`                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `design-material-design-3` | Google Material You — dynamic color, tonal palettes, elevation via surface tint, shape theme, motion    | `design-token-architecture`, `design-elevation-shadow`, `design-color-harmony`      |
| `design-apple-hig`         | Apple HIG — clarity/deference/depth, vibrancy, SF Symbols, semantic colors, safe areas, nav conventions | `design-elevation-shadow`, `design-navigation-ux`, `design-typography-fundamentals` |
| `design-fluent-design`     | Microsoft Fluent 2 — light/depth/motion/material/scale, acrylic, reveal highlight, token theming        | `design-elevation-shadow`, `design-motion-principles`, `design-token-architecture`  |

#### Domain 9: Visual Craft (5 skills)

| Skill                        | Description                                                                                              | `related_skills`                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `design-iconography`         | Icon design principles — optical sizing, stroke consistency, pixel grid, metaphor, icon families         | `design-gestalt-closure-continuity`, `design-visual-hierarchy`                  |
| `design-imagery-photography` | Image in design — art direction, aspect ratios, focal point, treatments, placeholder strategy            | `design-brand-consistency`, `design-visual-hierarchy`                           |
| `design-brand-consistency`   | Visual coherence — brand attributes to design decisions, consistency vs. monotony, flex zones            | `design-color-psychology`, `design-font-pairing`, `design-design-governance`    |
| `design-data-viz-design`     | Data visualization — chart selection, color encoding, Tufte's data-ink ratio, accessible charts          | `design-color-accessibility`, `design-contrast-ratio`, `design-content-density` |
| `design-illustration-style`  | Illustration system — style consistency, spot vs. hero, illustration as brand voice, illustration tokens | `design-brand-consistency`, `design-iconography`                                |

#### Domain 10: Design Process (4 skills)

| Skill                         | Description                                                                                             | `related_skills`                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `design-design-critique`      | Structured feedback — like/wish/wonder, separating preference from assessment, actionable feedback      | `design-design-audit`, `design-visual-hierarchy`                                         |
| `design-design-audit`         | Evaluating existing design — heuristic evaluation (Nielsen's 10), consistency inventory, design debt    | `design-design-critique`, `design-design-governance`, `design-consistency`               |
| `design-i18n-design`          | Designing for internationalization — text expansion, RTL, icon cultural sensitivity, pseudolocalization | `design-responsive-strategy`, `design-typography-fundamentals`, `design-content-density` |
| `design-design-documentation` | Documenting design decisions — rationale, spec handoff, annotations, the DESIGN.md format               | `design-design-governance`, `design-brand-consistency`                                   |

#### Cross-Cutting (3 skills)

| Skill                             | Description                                                                                                        | `related_skills`                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `design-empty-error-states`       | Empty and error state design — empty states as onboarding, error recovery, zero-data, degraded states              | `design-state-design`, `design-loading-patterns`, `design-feedback-patterns`                            |
| `design-consistency`              | Internal vs. external consistency — within-product patterns, platform adherence, breaking consistency deliberately | `design-alignment`, `design-gestalt-similarity`, `design-brand-consistency`, `design-design-governance` |
| `design-information-architecture` | Structuring information — card sorting, mental models, labeling, organization schemes, findability                 | `design-navigation-ux`, `design-content-density`, `design-visual-hierarchy`                             |

### Cross-References to Existing Skills

The following existing skills gain `related_skills` entries pointing to new `design-*` skills:

| Existing Skill             | New `related_skills` Additions                             |
| -------------------------- | ---------------------------------------------------------- |
| `css-dark-mode`            | `design-dark-mode-color`                                   |
| `css-design-tokens`        | `design-token-architecture`, `design-palette-construction` |
| `css-responsive-design`    | `design-responsive-strategy`, `design-responsive-type`     |
| `css-layout-patterns`      | `design-grid-systems`, `design-whitespace`                 |
| `css-animation-pattern`    | `design-motion-principles`, `design-transitions-timing`    |
| `css-component-variants`   | `design-component-anatomy`                                 |
| `a11y-color-contrast`      | `design-contrast-ratio`, `design-color-accessibility`      |
| `a11y-form-patterns`       | `design-form-ux`                                           |
| `a11y-motion-animation`    | `design-motion-principles`                                 |
| `a11y-keyboard-navigation` | `design-affordances`                                       |
| `harness-design-system`    | `design-token-architecture`, `design-atomic-design`        |
| `harness-design`           | `design-brand-consistency`, `design-design-documentation`  |
| `harness-design-web`       | `design-component-anatomy`, `design-elevation-shadow`      |

### File Layout

```
agents/skills/claude-code/design-color-harmony/
  skill.yaml
  SKILL.md
agents/skills/claude-code/design-contrast-ratio/
  skill.yaml
  SKILL.md
... (55 directories)

# Replicated to all platforms:
agents/skills/gemini-cli/design-*/
agents/skills/cursor/design-*/
agents/skills/codex/design-*/
```

### Implementation Order

1. **Wave 1 — Foundations (20 skills, parallel):** Color (6), Typography (7), Layout & Composition (6), plus `design-consistency`. These are the most frequently needed and have the highest dispatcher hit rate.
2. **Wave 2 — Perception & Interaction (12 skills, parallel):** Gestalt (5), Interaction Design (7). Depend on foundation skills for cross-references.
3. **Wave 3 — Systems & Craft (14 skills, parallel):** Depth & Motion (4), Design Systems (5), Visual Craft (5). Build on foundations and interaction knowledge.
4. **Wave 4 — Platform & Process (9 skills, parallel):** Platform Languages (3), Design Process (4), remaining cross-cutting (2). Most specialized, lowest dispatcher frequency.
5. **Wave 5 — Cross-references:** Update `related_skills` on 13 existing skills to point to new `design-*` skills. Replicate all skills to gemini-cli, cursor, codex platforms.

Each wave is independently shippable. Wave 1 alone delivers significant value.

## Success Criteria

1. All 55 skills pass `SkillMetadataSchema` Zod validation (skill.yaml)
2. All 55 SKILL.md files contain required sections: `## When to Use`, `## Instructions`, `## Details`, `## Source`, `## Process`, `## Harness Integration`, `## Success Criteria`
3. All 55 skills are replicated across all 4 platforms (claude-code, gemini-cli, cursor, codex)
4. Platform parity test passes (identical SKILL.md and skill.yaml across platforms)
5. Every skill includes at least 2 worked examples from real-world design systems with specific values
6. Every skill includes an Anti-Patterns subsection with at least 3 anti-patterns
7. Every skill's `related_skills` field references only skills that exist in the index
8. 13 existing skills are updated with bidirectional `related_skills` references
9. A novice developer, given only these skills as context, can produce a color palette, type scale, layout grid, and component hierarchy that passes expert review
10. `harness validate` passes after all skills are added
