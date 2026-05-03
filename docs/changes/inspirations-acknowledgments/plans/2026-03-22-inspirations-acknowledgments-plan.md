# Plan: Inspirations & Acknowledgments

**Date:** 2026-03-22
**Spec:** docs/changes/inspirations-acknowledgments/proposal.md
**Estimated tasks:** 5
**Estimated time:** 16 minutes

## Goal

Credit all 42 projects, standards, and tools that influenced harness engineering decisions in a comprehensive `docs/inspirations.md` with a condensed highlights table in README.md.

## Observable Truths (Acceptance Criteria)

1. `docs/inspirations.md` exists with 7 sections: Core Influences, Patterns Extracted — Frameworks, Patterns Extracted — Design & Accessibility, Standards & References, Tool Ecosystem, Researched Not Adopted, Where Harness Stands
2. Core Influences table has 5 rows (Spec Kit, BMAD, GSD, Superpowers, Ralph Loop) with Adopted and Skipped columns
3. Patterns Extracted — Frameworks table has 15 rows with Adopted and Skipped columns
4. Patterns Extracted — Design & Accessibility table has 6 rows with Adopted and Skipped columns
5. Standards & References is a bullet list (~8 entries)
6. Tool Ecosystem is a bullet list (~9 entries)
7. Researched Not Adopted is a bullet list (2 entries)
8. Where Harness Stands is a summary table with 4 differentiators
9. Each table section has a collapsible `<details>` rationale block
10. README.md contains an "Inspirations" section before "Contributing" with a 5-row Core Influences table and a link to `docs/inspirations.md`
11. `harness validate` passes

## File Map

- CREATE `docs/inspirations.md`
- MODIFY `README.md`

## Tasks

### Task 1: Write `docs/inspirations.md` — intro and Core Influences

**Depends on:** none
**Files:** `docs/inspirations.md`

1. Create `docs/inspirations.md` with title, intro paragraph, and `## Core Influences` section containing:
   - 5-row table (Project | Adopted | Skipped) for Spec Kit, BMAD, GSD, Superpowers, Ralph Loop
   - `<details>` rationale block with per-project paragraphs
2. Run: `harness validate`
3. Commit: `docs(inspirations): add core influences section`

### Task 2: Add Patterns Extracted — Frameworks

**Depends on:** Task 1
**Files:** `docs/inspirations.md`

1. Append `## Patterns Extracted — Frameworks` with 15-row table for: Claude Flow, Gas Town, Turbo Flow, Cursor P/W/J, OpenSpec, gstack, GSD v2, Kiro, Composio, Goose, CodeRabbit, Qodo, Devika, Tessl, Augment Code
2. Append `<details>` rationale block
3. Run: `harness validate`
4. Commit: `docs(inspirations): add patterns extracted frameworks section`

### Task 3: Add Patterns Extracted — Design & Accessibility

**Depends on:** Task 2
**Files:** `docs/inspirations.md`

1. Append `## Patterns Extracted — Design & Accessibility` with 6-row table for: Anthropic Frontend Design, UI/UX Pro Max, Impeccable, Vercel Agent Skills, Material Design, Tailwind/shadcn
2. Append `<details>` rationale block
3. Run: `harness validate`
4. Commit: `docs(inspirations): add design and accessibility influences`

### Task 4: Add Standards, Tools, Researched, and Harness Summary

**Depends on:** Task 3
**Files:** `docs/inspirations.md`

1. Append `## Standards & References` bullet list (~8 entries): OWASP Top 10, CWE Top 25, WCAG 2.1, W3C DTCG, Unicode CLDR/ICU MessageFormat, EARS Syntax, BCP 47, Cyclomatic Complexity
2. Append `## Tool Ecosystem` bullet list (~9 entries): Semgrep, Gitleaks, Vitest bench, Figma, Style Dictionary, Tolgee MCP, Lokalise MCP, Lingo.dev MCP, i18next MCP
3. Append `## Researched, Not Adopted` bullet list (2 entries): Skill Factory, PM Skills
4. Append `## Where Harness Stands` summary table with 4 rows: Mechanical + Behavioral, Human-Architect Model, Context Engineering, Local-First
5. Run: `harness validate`
6. Commit: `docs(inspirations): add standards, tools, researched, and harness summary`

### Task 5: Update README.md

**Depends on:** Task 4
**Files:** `README.md`

`[checkpoint:human-verify]` — Review `docs/inspirations.md` before updating README

1. Insert `## Inspirations` section before `## Contributing` in README.md with:
   - 5-row table (Project | Key Contribution) for the Core Influences
   - Link to full `docs/inspirations.md`
2. Run: `harness validate`
3. Commit: `docs(readme): add inspirations section with link to full doc`

## Completeness Trace

| Observable Truth                  | Delivered By |
| --------------------------------- | ------------ |
| 1. 7 sections exist               | Tasks 1-4    |
| 2. Core Influences table (5 rows) | Task 1       |
| 3. Frameworks table (15 rows)     | Task 2       |
| 4. Design table (6 rows)          | Task 3       |
| 5. Standards bullet list          | Task 4       |
| 6. Tool Ecosystem bullet list     | Task 4       |
| 7. Researched Not Adopted list    | Task 4       |
| 8. Where Harness Stands summary   | Task 4       |
| 9. `<details>` rationale blocks   | Tasks 1-3    |
| 10. README Inspirations section   | Task 5       |
| 11. `harness validate` passes     | Every task   |
