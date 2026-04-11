# UX Writing & Content Design Knowledge Skills

## Overview

UX Writing & Content Design knowledge skills (~25 skills, `ux-` prefix) teaching durable writing principles for user interfaces. These skills fill the gap between visual/interaction design (`design-*`) and the UX copy audit workflow (`harness-ux-copy`). A complete novice following these skills produces microcopy, error messages, and UI text indistinguishable from an expert content designer's work.

**Keywords:** microcopy, voice-tone, error-messages, plain-language, content-hierarchy, form-labels, onboarding-copy, empty-states, CTA-writing, inclusive-language

## Goals

1. Cover the 13 content areas identified in the Wave 2 proposal with ~25 focused skills
2. Follow the exact format established by `design-*` Wave 1: 150-250 lines, worked examples from real production systems, anti-patterns, citations
3. Full platform parity (claude-code, gemini-cli, cursor, codex)
4. Bidirectional `related_skills` cross-references to existing `design-*`, `a11y-*` skills
5. Focused cross-references from `harness-ux-copy` to 6 core knowledge skills

## Non-Goals

- Modifying `harness-ux-copy` audit logic (future work — thin out inline rules)
- Marketing copy, landing pages, or content outside the application UI
- Internationalization string extraction (covered by `harness-i18n`)
- CMS content management or editorial workflows

## Decisions

| Decision                                                          | Rationale                                                                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ux-` prefix                                                      | Concise, distinct from `design-*`, disambiguated by skill description                                                                                               |
| ~25 focused skills                                                | Matches granularity of Waves 2a-2d (~45 skills per domain scaled to domain size)                                                                                    |
| Flat structure, no shared YAML                                    | Consistent with `perf-*`, `db-*`, `security-*` waves; 25 skills don't warrant shared knowledge infra                                                                |
| Implementation order: principles first, contextual second         | Foundation skills (`ux-microcopy-principles`, `ux-voice-tone`) built before contextual skills (`ux-error-messages`, `ux-form-labels`) so cross-references are valid |
| Cross-reference harness-ux-copy to 6 core ux- skills              | Focused graph connectivity without bloating the workflow's related_skills list                                                                                      |
| Cross-reference existing design-\*/a11y-\* skills bidirectionally | Same pattern as Waves 2a-2d; enriches graph traversal                                                                                                               |
| No changes to harness-ux-copy audit logic                         | Avoid scope creep; gradual migration is a future task                                                                                                               |
| Framework-agnostic only                                           | Principles apply to React, Vue, Svelte, native — no framework-specific variants                                                                                     |

## Technical Design

### Skill List (~25 skills)

#### Phase 1: Foundation Skills (8 skills)

| Skill Name                        | Description                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ux-microcopy-principles`         | Clarity, brevity, human voice, active voice — the core rules all UI text follows                             |
| `ux-voice-tone`                   | Defining and applying voice (constant) vs tone (contextual), formality calibration                           |
| `ux-plain-language`               | Reading level targeting, jargon elimination, sentence structure for scanning                                 |
| `ux-active-voice`                 | Active vs passive voice in UI, when passive is acceptable, verb-first patterns                               |
| `ux-content-hierarchy`            | Heading structure, progressive disclosure in text, inverted pyramid for UI                                   |
| `ux-writing-for-scanning`         | F-pattern, front-loading keywords, chunking, bullet vs prose decisions                                       |
| `ux-inclusive-language`           | Gender-neutral, ability-neutral, culture-aware writing, avoiding idioms that don't translate                 |
| `ux-internationalization-writing` | Writing source strings that survive translation — concatenation traps, pluralization, date/number references |

#### Phase 2: Contextual Skills (17 skills)

| Skill Name                   | Description                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `ux-error-messages`          | What went wrong, why it matters, how to fix it — the three-part error pattern                    |
| `ux-error-severity`          | Calibrating error tone to severity — field validation vs system failure vs data loss             |
| `ux-empty-states`            | First-use, user-cleared, and no-results empty states — motivating action, setting expectations   |
| `ux-onboarding-copy`         | Progressive disclosure, value-first framing, reducing anxiety, welcome flows                     |
| `ux-button-cta-copy`         | Verb-noun pattern, specificity over vagueness, context-sensitive labels                          |
| `ux-form-labels`             | Label clarity, helper text placement, placeholder anti-patterns, required-field indication       |
| `ux-confirmation-dialogs`    | Destructive action copy, consequence clarity, specific button labels ("Delete project" not "OK") |
| `ux-notification-copy`       | Urgency calibration, actionability, toast vs banner vs modal decision, snackbar brevity          |
| `ux-tooltip-contextual-help` | When to use tooltips vs inline help, progressive disclosure of complexity, character limits      |
| `ux-loading-states`          | Progress transparency, expectation setting, skeleton screen copy, time estimates                 |
| `ux-success-feedback`        | Confirmation messages, celebration calibration, next-step prompts after completion               |
| `ux-navigation-labels`       | Menu item naming, breadcrumb clarity, tab labels, sidebar organization                           |
| `ux-permission-access-copy`  | Role-based messaging, upgrade prompts, "you don't have access" patterns, gating copy             |
| `ux-settings-preferences`    | Toggle descriptions, preference explanations, consequence previews for settings changes          |
| `ux-data-table-copy`         | Column headers, empty cells, truncation patterns, filter/sort labels                             |
| `ux-search-copy`             | Search placeholder text, zero-results messaging, autocomplete hints, search scope indicators     |
| `ux-destructive-action-copy` | Irreversibility warnings, undo availability, double-confirmation patterns, cooldown messaging    |

### File Structure

```
agents/skills/
  claude-code/ux-<name>/
    skill.yaml          # type: knowledge, tier: 3, cognitive_mode: advisory-guide
    SKILL.md            # 150-250 lines
  gemini-cli/ux-<name>/
    skill.yaml          # platforms: [gemini-cli]
    SKILL.md            # identical to claude-code
  cursor/ux-<name>/
    skill.yaml          # platforms: [cursor]
    SKILL.md            # identical to claude-code
  codex/ux-<name>/
    skill.yaml          # platforms: [codex]
    SKILL.md            # identical to claude-code
```

### skill.yaml Template

```yaml
name: ux-<name>
version: '1.0.0'
description: <one-line description matching SKILL.md blockquote>
cognitive_mode: advisory-guide
type: knowledge
tier: 3
triggers:
  - manual
platforms:
  - claude-code # (or gemini-cli, cursor, codex per platform copy)
tools: []
paths: []
related_skills:
  - <2-5 related ux-* and design-* skills>
stack_signals: []
keywords:
  - <3-6 domain keywords>
metadata:
  author: community
state:
  persistent: false
  files: []
depends_on: []
```

### SKILL.md Template

```markdown
# <Title>

> <one-line description>

## When to Use

- 3-5 trigger scenarios
- 1-2 NOT-for exclusions

## Instructions

1. Numbered principles (5-8 per skill)
   - Each with real production examples (Stripe, GitHub, Slack, Notion, etc.)
   - Tables where comparison aids understanding

## Details

### <Subsection>

- Deeper treatment of nuanced aspects

### Anti-Patterns

1. <anti-pattern with before/after examples>
2. ...
3. ...

## Source

- Citations with links (NNGroup, Google Material, Apple HIG, etc.)

## Process

1. Consume the skill content
2. Apply principles to the current context

## Harness Integration

- Reference document — no tools, no state

## Success Criteria

- 3-5 observable outcomes
```

### Cross-References

#### New → Existing (related_skills in ux- skill.yaml)

| ux- skill                         | Links to                                                  |
| --------------------------------- | --------------------------------------------------------- |
| `ux-error-messages`               | `design-empty-error-states`, `design-feedback-patterns`   |
| `ux-empty-states`                 | `design-empty-error-states`, `design-loading-patterns`    |
| `ux-form-labels`                  | `design-form-ux`, `a11y-form-patterns`                    |
| `ux-content-hierarchy`            | `design-information-architecture`, `design-readability`   |
| `ux-internationalization-writing` | `design-i18n-design`                                      |
| `ux-loading-states`               | `design-loading-patterns`                                 |
| `ux-navigation-labels`            | `design-information-architecture`, `design-navigation-ux` |

#### Existing → New (add to existing skill.yaml related_skills)

| Existing skill                    | Add link to                                    |
| --------------------------------- | ---------------------------------------------- |
| `design-empty-error-states`       | `ux-error-messages`, `ux-empty-states`         |
| `design-form-ux`                  | `ux-form-labels`                               |
| `design-feedback-patterns`        | `ux-error-messages`, `ux-notification-copy`    |
| `design-information-architecture` | `ux-content-hierarchy`, `ux-navigation-labels` |
| `design-readability`              | `ux-plain-language`, `ux-writing-for-scanning` |
| `design-loading-patterns`         | `ux-loading-states`                            |
| `design-i18n-design`              | `ux-internationalization-writing`              |
| `a11y-form-patterns`              | `ux-form-labels`                               |

#### harness-ux-copy → New (add to workflow related_skills)

`ux-microcopy-principles`, `ux-voice-tone`, `ux-error-messages`, `ux-form-labels`, `ux-confirmation-dialogs`, `ux-empty-states`

## Success Criteria

1. 25 knowledge skills created with `ux-` prefix, all passing schema validation tests
2. Each SKILL.md is 150-250 lines with at least 2 worked examples from real production systems and at least 3 anti-patterns
3. All 4 platforms have identical SKILL.md files (platform parity test passes)
4. Bidirectional `related_skills` links created — new `ux-*` → existing `design-*`/`a11y-*` and existing → new
5. `harness-ux-copy` updated with `related_skills` pointing to 6 core `ux-*` skills
6. The novice standard holds: a complete novice following these skills produces UI text indistinguishable from an expert content designer's
7. All existing tests continue to pass (no regressions)

## Implementation Order

### Phase 1: Foundation Skills (8 skills)

Build the 8 principle-level skills first. These establish the concepts that contextual skills reference.

Skills: `ux-microcopy-principles`, `ux-voice-tone`, `ux-plain-language`, `ux-active-voice`, `ux-content-hierarchy`, `ux-writing-for-scanning`, `ux-inclusive-language`, `ux-internationalization-writing`

### Phase 2: Contextual Skills (17 skills)

Build the 17 context-specific skills. Each references 1-3 foundation skills via `related_skills`.

Skills: `ux-error-messages`, `ux-error-severity`, `ux-empty-states`, `ux-onboarding-copy`, `ux-button-cta-copy`, `ux-form-labels`, `ux-confirmation-dialogs`, `ux-notification-copy`, `ux-tooltip-contextual-help`, `ux-loading-states`, `ux-success-feedback`, `ux-navigation-labels`, `ux-permission-access-copy`, `ux-settings-preferences`, `ux-data-table-copy`, `ux-search-copy`, `ux-destructive-action-copy`

### Phase 3: Cross-References

- Add bidirectional `related_skills` from 8 existing `design-*`/`a11y-*` skills to relevant `ux-*` skills
- Add `related_skills` to `harness-ux-copy` pointing to 6 core knowledge skills
- Verify all links resolve (no dangling references)
