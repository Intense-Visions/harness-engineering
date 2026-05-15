---
type: business_concept
domain: skills
tags: [skills, authoring, schema, cognitive-modes, yaml, skill-format]
---

# Skill Authoring

Every skill consists of two files: a `SKILL.md` instruction document and a `skill.yaml` metadata manifest, both located in `agents/skills/<platform>/<skill-name>/`.

## SKILL.md Required Sections

1. **When to Use** -- trigger conditions and scope boundaries
2. **Process** -- step-by-step execution instructions
3. **Iron Law** -- the single inviolable constraint the skill must never break
4. **Phases** -- ordered execution stages (each maps to a `phases[]` entry in skill.yaml)
5. **Gates** -- pass/fail criteria checked between phases
6. **Escalation** -- when and how to hand off to a human or another skill
7. **Examples** -- concrete input/output illustrations
8. **Rationalizations to Reject** -- common excuses the agent must refuse
9. **Harness Integration** -- which MCP tools and graph queries the skill uses
10. **Success Criteria** -- measurable outcomes that define completion

## skill.yaml Schema

| Field            | Type                   | Purpose                                                            |
| ---------------- | ---------------------- | ------------------------------------------------------------------ |
| `name`           | string                 | Unique kebab-case identifier                                       |
| `version`        | semver string          | Skill version                                                      |
| `description`    | string                 | One-line summary                                                   |
| `stability`      | `static` or `evolving` | Whether the skill changes between releases                         |
| `cognitive_mode` | enum                   | One of the 6 standard modes (see below)                            |
| `triggers`       | string[]               | Activation events (`manual`, `on_new_feature`, `on_commit`, etc.)  |
| `platforms`      | string[]               | Supported agent platforms                                          |
| `tools`          | string[]               | Tools the skill is allowed to invoke                               |
| `type`           | `rigid` or `flexible`  | Rigid skills must follow phases exactly; flexible skills may adapt |
| `tier`           | 1, 2, or 3             | Workflow importance (see below)                                    |
| `phases`         | object[]               | `{ name, description, required }` entries                          |
| `state`          | object                 | `{ persistent: bool, files: string[] }`                            |
| `depends_on`     | string[]               | Skills that must be available for handoff                          |

## Cognitive Modes

1. **adversarial-reviewer** -- actively seeks flaws, regressions, and violations
2. **constructive-architect** -- designs solutions and structures
3. **meticulous-implementer** -- writes code with strict adherence to conventions
4. **diagnostic-investigator** -- traces root causes through evidence chains
5. **advisory-guide** -- explains trade-offs and recommends approaches
6. **meticulous-verifier** -- confirms correctness through systematic checking

## Tier System

- **Tier 1 (workflow)** -- core development loop skills (brainstorming, planning, execution, verification, review)
- **Tier 2 (maintenance)** -- operational skills (cleanup, refactoring, dependency health, release readiness)
- **Tier 3 (domain)** -- specialized domain skills (security scan, architecture advisor, Capillary integrations)

## Rigid vs Flexible

Rigid skills (`type: rigid`) enforce phase ordering and gate checks -- the agent must complete each phase before advancing. Flexible skills (`type: flexible`) allow the agent to skip or reorder phases based on context, useful for advisory or exploratory work.
