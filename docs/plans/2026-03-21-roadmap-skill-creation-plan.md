# Plan: Roadmap Skill -- Interactive Creation

**Date:** 2026-03-21
**Spec:** docs/changes/unified-project-roadmap/proposal.md (Phase 3)
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Create the `harness:roadmap` skill with `--create` (bootstrap roadmap from existing specs/plans) and `--add` (interactive feature addition) commands, plus automatic slash command registration.

## Observable Truths (Acceptance Criteria)

1. Directory `agents/skills/claude-code/harness-roadmap/` exists with `skill.yaml` and `SKILL.md`
2. `skill.yaml` passes the `SkillMetadataSchema` validation (all required fields present and valid)
3. `SKILL.md` contains all required sections: `## When to Use`, `## Process`, `## Harness Integration`, `## Success Criteria`, `## Examples`, `## Gates`, `## Escalation` (rigid type requires Gates and Escalation)
4. When the slash command generator runs, `harness-roadmap` normalizes to `roadmap` producing `harness:roadmap`
5. The `--create` process covers: scan artifacts, propose groupings interactively, confirm, write `docs/roadmap.md`
6. The `--add` process covers: load roadmap, collect details interactively, write feature, validate
7. `npx vitest run agents/skills/tests/structure.test.ts` passes
8. `npx vitest run packages/cli/tests/slash-commands/normalize-name.test.ts` passes

## File Map

- CREATE `agents/skills/claude-code/harness-roadmap/skill.yaml`
- CREATE `agents/skills/claude-code/harness-roadmap/SKILL.md`
- MODIFY `packages/cli/tests/slash-commands/normalize-name.test.ts` (add test case)

## Tasks

### Task 1: Create skill.yaml

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-roadmap/skill.yaml`

1. Run: `mkdir -p agents/skills/claude-code/harness-roadmap`
2. Create `agents/skills/claude-code/harness-roadmap/skill.yaml` with:
   - `name: harness-roadmap`
   - `version: "1.0.0"`
   - `description: Create and manage a unified project roadmap from existing specs and plans`
   - `cognitive_mode: constructive-architect`
   - `triggers: [manual]`
   - `platforms: [claude-code, gemini-cli]`
   - `tools: [Bash, Read, Write, Edit, Glob, Grep]`
   - `cli.command: harness skill run harness-roadmap`
   - `cli.args: [{name: command, description: "Command: --create (bootstrap roadmap), --add <feature-name> (add feature)", required: false}]`
   - `mcp.tool: run_skill` with `input.skill: harness-roadmap`
   - `type: rigid`
   - 4 phases: scan, propose, write, validate (all required)
   - `state.persistent: false`, `depends_on: []`
3. Commit: `feat(roadmap): add skill.yaml for harness-roadmap`

---

### Task 2: Create SKILL.md -- header, When to Use, and --create process

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-roadmap/SKILL.md`

1. Create `agents/skills/claude-code/harness-roadmap/SKILL.md` with:

   **H1 + blockquote:** "Harness Roadmap" / "Create and manage a unified project roadmap..."

   **## When to Use:**
   - When a project needs a unified roadmap and none exists yet (`--create`)
   - When adding a new feature to an existing roadmap (`--add <feature-name>`)
   - When user asks about project status and no roadmap exists -- suggest `--create`
   - NOT for `--sync`, `--edit`, default show (deferred to Phase 6)
   - NOT for programmatic CRUD (use `manage_roadmap` MCP tool directly)

   **## Process with Iron Law:** "Never write `docs/roadmap.md` without the human confirming the proposed structure first."

   **### Command: `--create` -- Bootstrap Roadmap** with 4 sub-phases:
   - Phase 1 SCAN: Check for existing roadmap (warn if exists), scan `docs/changes/*/proposal.md` and `docs/changes/*/proposal.md` for specs, scan `docs/plans/*.md` for plans, match plans to specs, infer features with status, detect project name from `harness.yaml` or `package.json`
   - Phase 2 PROPOSE: Present discovered features in default milestone groupings (Current Work + Backlog), offer choices (A) accept, (B) rename, (C) reorganize, (D) add milestones. Ask about additional features not in specs. Repeat until accepted.
   - Phase 3 WRITE: Build roadmap structure with frontmatter (project, version 1, timestamps), write via `manage_roadmap` MCP tool or direct file write using roadmap markdown format (H2 milestones, H3 features, 5 fields each)
   - Phase 4 VALIDATE: Read back file, verify via `manage_roadmap show` if available, run `harness validate`, present summary

   **### Command: `--add <feature-name>` -- Add a Feature** with 4 sub-phases:
   - Phase 1 SCAN: Read `docs/roadmap.md` (error if missing, direct to `--create`), parse, check for duplicates
   - Phase 2 PROPOSE: Ask which milestone (list existing + NEW option), ask status (backlog/planned/in-progress/blocked), ask spec link, ask summary, ask blockers
   - Phase 3 WRITE: Add via `manage_roadmap add` MCP tool or direct parse/add/serialize, handle new milestones
   - Phase 4 VALIDATE: Read back, run `harness validate`, confirm

2. Do not commit yet -- Task 3 adds remaining sections.

---

### Task 3: Complete SKILL.md -- Harness Integration, Success Criteria, Examples, Gates, Escalation

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-roadmap/SKILL.md`

1. Append to `agents/skills/claude-code/harness-roadmap/SKILL.md`:

   **## Harness Integration:**
   - `manage_roadmap` MCP tool -- primary read/write interface for roadmap
   - `harness validate` -- run after any roadmap modification
   - Core `parseRoadmap`/`serializeRoadmap` -- fallback when MCP unavailable
   - Roadmap file always at `docs/roadmap.md`

   **## Success Criteria:**
   - `--create` discovers all specs and plans
   - `--create` proposes groupings and waits for confirmation before writing
   - `--create` produces valid `docs/roadmap.md` that round-trips
   - `--add` collects all fields interactively
   - `--add` rejects duplicates with clear message
   - `--add` errors gracefully when no roadmap exists
   - Output matches spec format exactly
   - `harness validate` passes after operations

   **## Examples:** Include a complete `--create` example showing SCAN output (found 3 specs, 2 plans), PROPOSE interaction (milestone groupings with A/B/C/D choice), WRITE (roadmap created), VALIDATE (summary). Include a complete `--add` example showing SCAN (roadmap loaded), PROPOSE (milestone choice, status, spec, summary), WRITE (feature added), VALIDATE (confirmation).

   **## Gates:**
   - No writing `docs/roadmap.md` without human confirmation of structure
   - No overwriting existing roadmap without explicit user consent
   - No adding features with duplicate names
   - No proceeding when `docs/roadmap.md` is missing for `--add` (direct to `--create`)

   **## Escalation:**
   - When no specs or plans are found during `--create`: suggest creating a minimal roadmap with just a Backlog milestone, or run `harness:brainstorming` first
   - When the roadmap file is malformed and cannot be parsed: report the parse error, suggest manual inspection or recreation with `--create`
   - When MCP tool is unavailable: fall back to direct file manipulation via Read/Write tools using the roadmap markdown format

2. Run: `npx vitest run agents/skills/tests/structure.test.ts` -- observe pass (new skill discovered, has all required sections)
3. Commit: `feat(roadmap): add SKILL.md for harness-roadmap skill`

---

### Task 4: Add normalize-name test case for harness-roadmap

**Depends on:** none (parallel with Tasks 1-3)
**Files:** `packages/cli/tests/slash-commands/normalize-name.test.ts`

1. Read `packages/cli/tests/slash-commands/normalize-name.test.ts`
2. Add a test case in the existing test suite: `harness-roadmap` -> `roadmap` (exercises rule 1: strip leading `harness-`)
3. Run: `npx vitest run packages/cli/tests/slash-commands/normalize-name.test.ts` -- observe pass
4. Commit: `test(slash-commands): add harness-roadmap normalize-name test case`

---

### Task 5: Verify full test suite and slash command generation

**Depends on:** Tasks 1-4
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `npx vitest run agents/skills/tests/structure.test.ts` -- verify harness-roadmap SKILL.md passes all structure checks (required sections, h1 heading, corresponding skill.yaml)
2. Run: `npx vitest run agents/skills/tests/platform-parity.test.ts` -- verify no parity regressions
3. Run: `npx vitest run packages/cli/tests/slash-commands/normalize-name.test.ts` -- verify normalize test passes
4. Run: `npx vitest run packages/cli/tests/slash-commands/` -- verify full slash-commands test suite passes
5. Verify slash command generation would pick up the new skill: confirm `agents/skills/claude-code/harness-roadmap/skill.yaml` has `platforms: [claude-code, gemini-cli]` and the normalize function would produce `harness:roadmap` as the slash command name
6. Present results to human for verification
