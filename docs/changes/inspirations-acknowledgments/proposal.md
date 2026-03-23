# Inspirations & Acknowledgments — Design Specification

**Date:** 2026-03-22
**Status:** Draft

## Overview

Credit all projects, standards, and tools that influenced harness engineering decisions. Organized by influence level with transparent rationale for what was adopted, what was skipped, and why.

**Non-goals:**

- Not a competitive comparison or feature matrix
- Not a ranking of project quality — influence on harness specifically
- Not a tutorial on how these frameworks work

**Keywords:** inspirations, acknowledgments, prior-art, framework-research, design-influences, standards

## Decisions

| Decision                                                                                                                                                  | Rationale                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 7 sections: Core Influences, Patterns Extracted (Frameworks), Patterns Extracted (Design), Standards, Tools, Researched Not Adopted, Where Harness Stands | Matches actual depth of analysis and gives richest format to entries that deserve it |
| Core Influences + Patterns Extracted use 3-column table (Project, Adopted, Skipped)                                                                       | GitHub markdown readable; rationale in collapsible `<details>` blocks                |
| Standards & Tools use bullet lists                                                                                                                        | No adopt/skip dynamic — you either use a standard or don't                           |
| Researched Not Adopted uses bullet list                                                                                                                   | Only 2 entries; a table would be overkill                                            |
| Harness Engineering as final summary row                                                                                                                  | Shows differentiators in context rather than as a separate section                   |
| README gets Core Influences only + link                                                                                                                   | Keeps README scannable; full detail in dedicated doc                                 |
| Links to project repos/sites where available                                                                                                              | Proper credit means people can find the original work                                |
| Rationale in `<details>` blocks per tier                                                                                                                  | Collapsible keeps the page scannable; grouping matches table structure               |

## Technical Design

### `docs/inspirations.md` Structure

```
# Inspirations & Acknowledgments

[Intro paragraph]

## Core Influences (5 rows, table + <details>)
Spec Kit, BMAD, GSD, Superpowers, Ralph Loop

## Patterns Extracted — Frameworks (15 rows, table + <details>)
Claude Flow, Gas Town, Turbo Flow, Cursor P/W/J, OpenSpec,
gstack, GSD v2, Kiro, Composio, Goose, CodeRabbit, Qodo,
Devika, Tessl, Augment Code

## Patterns Extracted — Design & Accessibility (6 rows, table + <details>)
Anthropic Frontend Design, UI/UX Pro Max, Impeccable,
Vercel Agent Skills, Material Design, Tailwind/shadcn

## Standards & References (bullet list)
OWASP Top 10, CWE Top 25, WCAG 2.1, W3C DTCG,
Unicode CLDR/ICU MessageFormat, EARS syntax, BCP 47,
Cyclomatic Complexity metrics

## Tool Ecosystem (bullet list)
Semgrep, Gitleaks, Vitest bench, Figma, Style Dictionary,
Tolgee/Lokalise/Lingo.dev/i18next MCPs

## Researched, Not Adopted (bullet list)
Skill Factory, PM Skills

## Where Harness Stands (summary table)
Mechanical constraints + behavioral guidance differentiator
```

### Table Format (Core Influences, Patterns Extracted)

| Project                  | Adopted              | Skipped              |
| ------------------------ | -------------------- | -------------------- |
| **[Project Name](link)** | Feature A, Feature B | Feature X, Feature Y |

### Bullet Format (Standards, Tools, Researched)

- **[Standard/Tool Name](link)** — What it informed in harness

### README.md Addition

New section before Contributing:

```markdown
## Inspirations

| Project         | Key Contribution                                                       |
| --------------- | ---------------------------------------------------------------------- |
| GitHub Spec Kit | Constitution/principles, cross-artifact validation                     |
| BMAD Method     | Scale-adaptive intelligence, workflow re-entry, party mode             |
| GSD             | Goal-backward verification, persistent state, codebase mapping         |
| Superpowers     | Rigid behavioral workflows, subagent dispatch, verification discipline |
| Ralph Loop      | Fresh-context iteration, append-only learnings, task sizing            |

These five projects most directly shaped harness engineering. See the full
[Inspirations & Acknowledgments](./docs/inspirations.md) for all 42 projects,
standards, and tools analyzed — what we adopted, what we skipped, and why.
```

### Tier Assignment

**Core Influences (5):** Spec Kit, BMAD, GSD, Superpowers, Ralph Loop

**Patterns Extracted — Frameworks (15):** Claude Flow, Gas Town, Turbo Flow, Cursor P/W/J, OpenSpec, gstack, GSD v2, Kiro, Composio, Goose, CodeRabbit, Qodo, Devika, Tessl, Augment Code

**Patterns Extracted — Design & Accessibility (6):** Anthropic Frontend Design, UI/UX Pro Max, Impeccable, Vercel Agent Skills, Material Design, Tailwind/shadcn

**Standards & References (8):** OWASP Top 10, CWE Top 25, WCAG 2.1, W3C DTCG, Unicode CLDR/ICU MessageFormat, EARS syntax (via Kiro), BCP 47, Cyclomatic Complexity metrics

**Tool Ecosystem (8):** Semgrep, Gitleaks, Vitest bench, Figma, Style Dictionary, Tolgee MCP, Lokalise MCP, Lingo.dev MCP, i18next MCP

**Researched, Not Adopted (2):** Skill Factory, PM Skills

## Success Criteria

1. `docs/inspirations.md` exists with all 7 sections plus the Harness summary
2. All ~42 projects/standards/tools from the research are represented — none omitted
3. Core Influences and Patterns Extracted tiers use 3-column table with `<details>` rationale blocks
4. Standards, Tools, and Researched tiers use bullet list format
5. README.md has condensed Inspirations section with 5 Core Influences and link to full doc
6. Links to original project repos/sites included where available
7. Harness Engineering summary captures differentiator: mechanical constraints + behavioral guidance, human-architect model

## Implementation Order

1. Write `docs/inspirations.md` — full document with all sections
2. Update `README.md` — add condensed Inspirations section before Contributing
3. Run `harness validate` — verify project health
