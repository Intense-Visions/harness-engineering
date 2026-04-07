# Harness Onboarding

> Navigate an existing harness-managed project and generate a structured orientation for new team members. Map the codebase, understand constraints, identify the adoption level, and produce a summary that gets someone productive fast.

## When to Use

- A new developer (human or agent) is joining a harness-managed project for the first time
- Resuming work on a project after extended time away and needing to re-orient
- When `on_project_init` triggers fire in an existing project (agent starting a new session)
- When someone asks "how does this project work?" or "where do I start?"
- NOT when initializing a new project (use initialize-harness-project)
- NOT when the project has no harness configuration (onboard to harness first with initialize-harness-project)
- NOT when deep-diving into a specific module (use standard code exploration — onboarding gives the big picture)

## Process

### Phase 1: READ — Load Project Configuration

1. **Read `AGENTS.md`.** This is the primary source of truth for agent behavior in the project. Note:
   - Project description and purpose
   - Architecture overview
   - Conventions and coding standards
   - Constraints and forbidden patterns
   - Any special instructions or warnings

2. **Read `harness.config.json`.** Extract:
   - Project name and stack
   - Adoption level (basic, intermediate, advanced)
   - Layer definitions and their directory mappings
   - Dependency constraints between layers
   - Registered skills and their triggers
   - Persona configuration (if present)

3. **Read `.harness/learnings.md`** if it exists. This contains hard-won insights from previous sessions — decisions made, gotchas discovered, patterns that worked or failed. Summarize the most recent and most important entries.

4. **Read `.harness/state.json`** if it exists. This reveals what was happening in the last session — current phase, active task, any blockers that were recorded.

### Phase 2: MAP — Understand the Codebase Structure

1. **Map the technology stack.** Identify from package files, configuration, and code:
   - Language(s) and version(s)
   - Framework(s) and major libraries
   - Test framework and test runner command
   - Build tool and build command
   - Package manager
   - Database or data stores (if applicable)

2. **Map the architecture.** Walk the directory structure and identify:
   - Top-level organization pattern (monorepo, single package, workspace)
   - Source code location and entry points
   - Layer boundaries (from `harness.config.json` and actual directory structure)
   - Shared utilities or common modules
   - Configuration files and their purposes

3. **Map the conventions.** Look for patterns in existing code:
   - File naming conventions (kebab-case, camelCase, PascalCase)
   - Test file location and naming (co-located, separate directory, `.test.ts` vs `.spec.ts`)
   - Import style (relative, aliases, barrel files)
   - Error handling patterns
   - Logging patterns
   - Code formatting (detect from config files: `.prettierrc`, `.eslintrc`, `biome.json`)

4. **Map the constraints.** Identify what is restricted:
   - Forbidden imports (from `harness.config.json` dependency constraints)
   - Layer boundary rules (which layers can import from which)
   - Linting rules that encode architectural decisions
   - Any constraints documented in `AGENTS.md` that are not yet automated

5. **Map the design system** (when present). Look for:
   - `design-system/tokens.json` — W3C DTCG design tokens (colors, typography, spacing)
   - `design-system/DESIGN.md` — Aesthetic intent, anti-patterns, platform notes
   - `harness.config.json` `design` block — strictness level, enabled platforms, token path
   - Active design skills — check if `harness-design-system`, `harness-accessibility`, `harness-design`, `harness-design-web`, `harness-design-mobile` are available
   - Design constraint violations — run a quick `harness-accessibility` scan to surface any existing issues
   - Token coverage — how many components reference tokens vs. hardcoded values

   If no design system exists, note this as a potential improvement area.

6. **Map the concerns.** Identify areas that need attention:
   - Are there TODOs or FIXMEs in the code?
   - Does `harness validate` pass cleanly, or are there warnings?
   - Are there known blockers in `.harness/state.json`?
   - Is documentation up to date with the code?
   - Are there tests? What is the approximate coverage?

### Graph-Enhanced Context (when available)

When a knowledge graph exists at `.harness/graph/`, use graph queries for faster, more accurate codebase mapping:

- `query_graph` — map architecture automatically from module and layer nodes, replacing manual directory walking
- `search_similar` — find entry points and key files by querying for high-connectivity nodes
- `get_relationships` — show layer dependencies and module structure as a traversable graph

Graph queries produce a complete architecture map in seconds, including transitive relationships that directory inspection misses. Fall back to file-based commands if no graph is available.

### Phase 3: ORIENT — Identify Adoption Level and Maturity

1. **Confirm the adoption level** matches what `harness.config.json` declares:
   - Basic: `AGENTS.md` and `harness.config.json` exist but no layers or constraints
   - Intermediate: Layers defined, dependency constraints enforced, at least one custom skill
   - Advanced: Personas, state management, learnings, CI integration

2. **Assess harness health.** Run `harness validate` and note any issues. A project that declares intermediate but fails validation is not truly intermediate.

3. **Identify available skills.** List the skills configured for the project. Note which are custom (project-specific) vs. standard (harness-provided). Each skill represents a workflow the team has formalized.

### Phase 4: SUMMARIZE — Generate Orientation Output

1. **Produce a structured orientation summary.** This is the deliverable. Format:

```markdown
# Project Orientation: <project-name>

## Overview

<1-2 sentence project description from AGENTS.md>

## Stack

- Language: <language> <version>
- Framework: <framework>
- Tests: <test framework> (`<test command>`)
- Build: <build tool> (`<build command>`)
- Package manager: <pm>

## Architecture

<Brief description of top-level organization>

### Layers

| Layer   | Directories | Can Import From   |
| ------- | ----------- | ----------------- |
| <layer> | <dirs>      | <allowed imports> |

### Key Components

- <component>: <purpose> (<location>)

## Constraints

- <constraint 1>
- <constraint 2>

## Conventions

- <convention 1>
- <convention 2>

## Design System

- **Tokens:** [present/absent] ([token count] tokens in [group count] groups)
- **Aesthetic Intent:** [present/absent] (style: [style], strictness: [level])
- **Platforms:** [web, mobile, or none configured]
- **Accessibility:** [baseline scan result — e.g., "3 warnings, 0 errors"]
- **Design Skills:** [list of available design skills]

## Harness Status

- Adoption level: <level>
- Validation: <pass/fail with summary>
- Available skills: <list>
- State: <current phase/task if applicable>

## Recent Learnings

- <most relevant learnings from .harness/learnings.md>

## Getting Started

1. <first thing to do>
2. <second thing to do>
3. <third thing to do>
```

2. **Tailor "Getting Started" to the audience.** For a new developer: how to set up the dev environment and run tests. For an agent resuming work: what the current task is and what to do next. For a reviewer: where to look and what constraints to check.

3. **Present the summary to the human.** Do not write it to a file unless asked. The orientation is a conversation artifact, not a project artifact.

## Harness Integration

- **`harness validate`** — Run during onboarding to assess project health and identify any configuration issues.
- **`harness skill list`** — List available skills to understand what workflows the team has formalized.
- **`harness check-deps`** — Run to verify dependency constraints are passing, which confirms layer boundaries are respected.
- **`harness state show`** — View current state to understand where the last session left off.
- **`AGENTS.md`** — Primary source of project context and agent instructions.
- **`harness.config.json`** — Source of structural configuration (layers, constraints, skills).
- **`.harness/learnings.md`** — Historical context and institutional knowledge.

## Success Criteria

- All four configuration sources were read (`AGENTS.md`, `harness.config.json`, `.harness/learnings.md`, `.harness/state.json`)
- Technology stack is accurately identified (language, framework, test runner, build tool)
- Architecture is mapped with correct layer boundaries and dependency directions
- Conventions are identified from actual code patterns, not assumed
- Constraints are enumerated from both `harness.config.json` and `AGENTS.md`
- Adoption level is confirmed (not just declared — validated)
- A structured orientation summary is produced with all sections filled
- The "Getting Started" section is actionable and tailored to the audience
- `harness validate` was run and results are reported

## Rationalizations to Reject

| Rationalization                                                                                                            | Reality                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "I can skip reading .harness/learnings.md since it is just historical notes"                                               | Learnings contain hard-won insights from previous sessions -- decisions made, gotchas discovered, patterns that worked or failed. Skipping them means repeating mistakes already diagnosed.      |
| "The harness.config.json says intermediate, so I can report that without validation"                                       | Declared adoption level must be confirmed, not assumed. A project that declares intermediate but fails harness validate is not truly intermediate.                                               |
| "I will map the architecture by reading the directory names since that is faster than checking conventions in actual code" | Conventions must be identified from actual code patterns, not assumed from directory structure. File naming, import style, and error handling can only be verified by reading real source files. |

## Examples

### Example: Onboarding to an Intermediate TypeScript Project

**READ:**

```
Read AGENTS.md:
  - Project: Widget API — REST service for widget lifecycle management
  - Stack: TypeScript, Express, Vitest, PostgreSQL
  - Conventions: zod validation, repository pattern, kebab-case files

Read harness.config.json:
  - Level: intermediate
  - Layers: presentation (src/routes/), business (src/services/), data (src/repositories/)
  - Constraints: presentation → business OK, business → data OK, data → presentation FORBIDDEN

Read .harness/learnings.md:
  - "Date comparison needs UTC normalization — use Date.now()"
  - "The notifications table has a unique constraint on (userId, type) — upsert, don't insert"

Read .harness/state.json:
  - Position: Phase execute, Task 4 of 6
  - Blocker: none
```

**MAP:**

```
Stack: TypeScript 5.3, Express 4, Vitest 1.2, pg (node-postgres)
Architecture: Single package, 3 layers, entry point src/index.ts
Conventions: kebab-case files, co-located tests (.test.ts), barrel exports
Constraints: 3 layers with strict downward-only imports
Concerns: harness validate passes, 47 tests all passing
```

**ORIENT:**

```
Adoption level: intermediate (confirmed — layers defined, constraints enforced)
Skills: harness-tdd, harness-execution, harness-code-review
State: Mid-execution on a 6-task notification feature plan
```

**SUMMARIZE:**

```
Produce orientation with all sections. Getting Started for this context:
1. Read the plan at docs/plans/2026-03-14-notifications-plan.md
2. Resume execution at Task 4 (state shows Tasks 1-3 complete)
3. Note the UTC normalization gotcha from learnings before working with dates
```

### Example: Onboarding to a Basic Project

**READ:**

```
Read AGENTS.md — exists, minimal content
Read harness.config.json — level: basic, no layers defined
No .harness/learnings.md
No .harness/state.json
```

**MAP and SUMMARIZE:**

```
Adoption level: basic (confirmed — no layers or constraints)
Getting Started:
1. Run npm install && npm test to verify the project builds and tests pass
2. Read AGENTS.md for project context and conventions
3. Consider migrating to intermediate level to add layer boundaries
   (use initialize-harness-project to upgrade)
```

## Adoption Maturity

A mental model for where a team sits on the harness adoption curve. Not prescriptive — just orientation.

| Level | Name               | Description                                                                                                                                                          |
| ----- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | **Manual**         | Write `CLAUDE.md` by hand, run commands manually. Harness is a reference, not a tool.                                                                                |
| 2     | **Repeatable**     | Skills installed, agent follows conventions consistently. Workflows are codified but enforcement is human-driven.                                                    |
| 3     | **Automated**      | Mechanical gates in CI. `harness validate` runs on PRs. Failures auto-log to `.harness/failures.md`. The system catches mistakes before humans do.                   |
| 4     | **Self-improving** | Learnings accumulate in `.harness/learnings.md`. Agents reference past failures before planning. Institutional knowledge compounds across sessions and team members. |

Most teams start at Level 1 and move up as they see the value. There is no pressure to reach Level 4 — each level delivers real benefits on its own.
