# Framework-Inspired Enhancements — Design Specification

**Date:** 2026-03-14
**Status:** Approved
**Depends on:** Rich Skill Format & Infrastructure

## Overview

Five enhancements adopted from analysis of GitHub Spec Kit, BMAD Method, and patterns across the agentic development ecosystem. These add scale-adaptive rigor, project principles, cross-artifact validation, workflow re-entry, and multi-perspective brainstorming to the existing harness engineering toolkit.

## Sources

- **Scale-adaptive rigor** — BMAD's scale-adaptive intelligence (adjusts process depth per task complexity)
- **Constitution/principles** — Spec Kit's `/speckit.constitution` concept (governing principles for a project)
- **Cross-artifact validation** — Spec Kit's `/speckit.analyze` (consistency checks across artifacts)
- **Workflow re-entry** — BMAD's tri-modal workflows (enter at create/validate/edit, not always from start)
- **Party mode** — BMAD's Party Mode (multi-agent perspectives debating in one session)

## Decisions

- Scale-adaptive: hybrid auto-detect with manual override (`--complexity light|full|auto`). Base for auto-detect: `git merge-base HEAD main`.
- Auto-detection signals: file count, change type, directory creation, dependency changes
- Principles live in `docs/principles.md`, referenced from AGENTS.md, loaded by skills
- Cross-artifact validation is heuristic (warns, doesn't block). Checks spec→plan, plan→implementation, staleness. Spec/plan paths configurable in `harness.config.json`, default to `docs/superpowers/specs/` and `docs/superpowers/plans/`.
- Workflow re-entry is state-aware with confirmation: loads prior state if available, asks before proceeding without it. State discovery uses `skill.yaml`'s `state.files` array.
- Party mode selects perspectives based on design topic context, not fixed roles
- Schema changes apply to BOTH `agents/skills/tests/schema.ts` AND `packages/cli/src/skill/schema.ts` (duplicate schemas — consolidation deferred to future cleanup)
- Prerequisite: `harness-debugging/skill.yaml` phases must be updated to match SKILL.md headings (investigate, analyze, hypothesize, fix) before workflow re-entry examples work
- All CLI enhancements (#1, #2, #3) that modify `harness skill run` share a common preamble injection system in `packages/cli/src/commands/skill/run.ts`

---

## Section 1: Scale-Adaptive Rigor

### Phase `required` field

Add `required: boolean` to the `phases` array items in `skill.yaml`:

```yaml
phases:
  - name: red
    description: Write failing test
    required: true          # Always runs
  - name: green
    description: Implement minimal code
    required: true
  - name: refactor
    description: Clean up
    required: false         # Skipped in light mode
  - name: validate
    description: Run harness checks
    required: true
```

Zod schema addition to `SkillPhaseSchema`:

```typescript
const SkillPhaseSchema = z.object({
  name: z.string(),
  description: z.string(),
  required: z.boolean().default(true),
});
```

### Auto-detection signals

```
light (any of):
  - Single file changed
  - Test-only change (all changed files match *.test.* or *.spec.*)
  - Documentation-only change (all changed files in docs/ or *.md)
  - Bug fix with known root cause

full (any of):
  - New directory created
  - 3+ files modified
  - New dependency added (package.json/Cargo.toml/go.mod changed)
  - Architectural change (harness.config.json, layer config modified)
  - First implementation in a new domain
```

Auto-detection runs `git diff --stat` and `git diff --name-only` against the branch base. Base is determined by `git merge-base HEAD main` (or the default branch). If no git context is available (not a git repo, no commits), defaults to `full`.

### CLI integration

```
harness skill run harness-tdd                        # auto-detect (same as --complexity auto)
harness skill run harness-tdd --complexity auto       # explicit auto-detect
harness skill run harness-tdd --complexity light      # override to light
harness skill run harness-tdd --complexity full       # override to full
```

Output preamble injected into SKILL.md:

```markdown
## Active Phases (complexity: light, auto-detected)
- RED (required)
- GREEN (required)
- VALIDATE (required)
- ~~REFACTOR~~ (skipped in light mode)
```

### MCP integration

`run_skill` MCP tool gains optional `complexity` input:

```json
{
  "skill": "harness-tdd",
  "complexity": "light",
  "path": "/project"
}
```

---

## Section 2: Constitution / Principles

### File location

`docs/principles.md` — freeform markdown with recommended structure:

```markdown
# Project Principles

## Code Quality
- Explicit over implicit
- No magic — every behavior traceable through code

## Architecture
- Boundaries enforced by linters, not reviews
- Data flows one direction through layers

## Testing
- Test at boundaries, not internals
- Integration tests over mocks

## Design
- YAGNI ruthlessly
- Depth-first: complete one feature before starting another
```

### AGENTS.md reference

```markdown
## Documentation
- Principles: `docs/principles.md`
```

### Validation

`harness validate` checks:
- Scan AGENTS.md for any line containing a path matching `*principles*` (e.g., `docs/principles.md`). If found, that file must exist on disk.
- If `docs/principles.md` exists, verify it starts with `# ` heading and is not empty.

Detection is a simple regex: `/(?:^|\s)`([^`\s]*principles[^`\s]*)`/gm` against AGENTS.md content. This catches both inline references and markdown links.

No schema validation on principles content — principles are human-authored free text.

### Skill integration

Skills that load principles when the file exists:
- `harness-brainstorming` — design evaluation
- `harness-planning` — decomposition decisions
- `harness-code-review` — review against stated principles
- `harness-refactoring` — refactoring direction

`harness skill run` injects principles into SKILL.md preamble:

```markdown
## Project Principles (from docs/principles.md)
[principles content here]
```

### Template integration

`harness init --level intermediate` and `--level advanced` scaffold a starter `docs/principles.md`. Basic level does not.

---

## Section 3: Cross-Artifact Validation

### CLI integration

```
harness validate --cross-check
```

Extends the existing `validate` command with a new flag.

### Configurable paths

Spec and plan directories are configurable in `harness.config.json`:

```json
{
  "crossCheck": {
    "specsDir": "docs/superpowers/specs",
    "plansDir": "docs/superpowers/plans"
  }
}
```

Defaults to `docs/superpowers/specs/` and `docs/superpowers/plans/` if not configured.

### Four checks

**1. Spec → Plan coverage**
- Scans configured specs directory for spec files
- Scans configured plans directory for plan files
- Matches plans to specs via `**Spec:**` link in plan header
- Parses spec `## Success Criteria` for requirement items
- Warns about spec requirements with no corresponding plan task

**2. Plan → Implementation coverage**
- Parses plan task `**Files:** Create:` / `Modify:` lines
- Checks that listed files exist on disk
- Warns about planned-but-not-built files

**3. Implementation → Plan alignment**
- Detects files modified since the plan was last committed (via `git log`) that aren't listed in any plan
- Warns about unplanned implementation (drift from plan)

**4. Staleness detection**
- Compares git commit timestamps: spec vs. plan vs. implementation files
- Flags specs where implementation files were modified more recently than the spec
- Flags plans where listed files were modified after the plan's last commit

### Output format

```
Cross-artifact validation:

  Spec → Plan coverage:
    v spec-a.md → 25 tasks covered
    ! spec-b.md → 2 requirements with no plan tasks

  Plan → Implementation:
    v plan-a.md → all 47 files exist
    ! plan-b.md → 3 planned files not found

  Staleness:
    ! spec-a.md — spec last modified 2026-03-14, implementation modified 2026-03-15

  3 warnings, 0 errors
```

### Implementation approach

Heuristic tool — warns, does not block. Simple regex parsing for file references and requirement patterns. `git log --format=%ai` for timestamps. False positives acceptable; value is surfacing things worth reviewing.

New module: `packages/cli/src/commands/validate-cross-check.ts`. Invoked by the existing `validate` command when `--cross-check` flag is present.

---

## Section 4: Workflow Re-Entry

### Prerequisite

`harness-debugging/skill.yaml` phases must be updated to match SKILL.md headings:

```yaml
phases:
  - name: investigate
    description: Entropy analysis + root cause search
    required: true
  - name: analyze
    description: Pattern matching against codebase
    required: true
  - name: hypothesize
    description: Test one variable at a time
    required: false
  - name: fix
    description: TDD-style regression test + fix
    required: true
```

### CLI integration

```
harness skill run harness-debugging --phase hypothesize
```

### State discovery

The re-entry feature uses `skill.yaml`'s `state.files` array to locate state:

1. Read `state.files` from the skill's `skill.yaml` (e.g., `[".harness/debug/"]`)
2. For directory paths (ending in `/`): list files in the directory, select the most recently modified
3. For file paths: load directly
4. If multiple state files exist (e.g., multiple debug sessions), load the most recently modified one

### Behavior

1. Validate `--phase` value matches a declared phase name in `skill.yaml`. Error if not.
2. Check if skill has `state.persistent: true`:
   - **If yes:** discover state files using `state.files` array
     - **State exists:** load most recent and inject into preamble
     - **No state:** prompt `"No prior phase data found. Phases investigate and analyze have not been completed. Proceed without prior context? (y/n)"`
   - **If no (stateless skill):** start at requested phase with note: `"Starting at Phase: REFACTOR. Note: Phases RED and GREEN were not executed."`
3. Output SKILL.md starting from the requested phase section, with preamble:

```markdown
## Resuming at Phase: hypothesize
## Prior state loaded from .harness/debug/active/issue-name.md
[state content]
---
[SKILL.md content from Phase 3 onward]
```

### MCP integration

`run_skill` MCP tool gains optional `phase` input:

```json
{
  "skill": "harness-debugging",
  "phase": "hypothesize",
  "path": "/project"
}
```

Same state-aware logic. For MCP (non-interactive), if no state exists and confirmation would be needed, return a warning response instead of blocking:

```json
{
  "content": [{ "type": "text", "text": "Warning: No prior phase data found. Proceeding without context from earlier phases." }]
}
```

---

## Section 5: Party Mode (Multi-Perspective Brainstorming)

### Activation

```
harness skill run harness-brainstorming --party
```

### Context-driven perspective selection

| Design Topic | Perspectives |
|---|---|
| API / backend service | Backend Developer, API Consumer, Operations |
| UI / frontend feature | Developer, Designer, End User |
| Infrastructure / DevOps | Architect, SRE, Developer |
| Data model / schema | Backend Developer, Data Consumer, Migration |
| Library / SDK | Library Author, Library Consumer, Maintainer |
| Cross-cutting (auth, logging) | Architect, Security, Developer |
| Default (unclear topic) | Architect, Developer, User/Consumer |

The skill determines the topic from the brainstorming context and selects perspectives automatically.

### Process modification

Standard: Explore → Questions → Propose approaches → Design → Approve

Party mode: Explore → Questions → Propose approaches → **Each perspective evaluates each approach** → **Synthesize recommendation** → Design → Approve

Evaluation output format:

```markdown
### Approach 1: [name]

**Backend Developer perspective:**
[Assessment]. Concern: [specific concern].

**API Consumer perspective:**
[Assessment]. Concern: [specific concern].

**Operations perspective:**
[Assessment]. No concerns.

**Synthesis:** [Consensus summary. Address raised concerns. Recommend proceed/revise.]
```

### Implementation

SKILL.md content enhancement only. The `harness-brainstorming/SKILL.md` `## Process` section gains a conditional block:

> **If `--party` mode is active**, after proposing approaches, evaluate each approach from the selected perspectives before presenting the design. State each perspective's assessment explicitly. Synthesize into a recommendation that addresses all concerns raised.

The `--party` flag is passed through CLI/MCP preamble injection. The `run_skill` MCP tool gains an optional `party: boolean` input parameter alongside the existing `complexity` and `phase` inputs.

---

## Implementation Summary

| Enhancement | Touches | Scope |
|---|---|---|
| Scale-adaptive rigor | `SkillPhaseSchema` (add `required`), `harness skill run` (add `--complexity`, auto-detect), `run_skill` MCP input, skill.yaml files (add `required` to phases) | Schema + CLI + MCP + skill configs |
| Constitution/principles | `harness validate` (principles check), `harness skill run` (inject principles), `harness init` templates, SKILL.md content for 4 skills | CLI + templates + skill content |
| Cross-artifact validation | New `validate-cross-check.ts` module, `harness validate --cross-check` flag | CLI only |
| Workflow re-entry | `harness skill run` (add `--phase`, state loading, confirmation), `run_skill` MCP input | CLI + MCP |
| Party mode | `harness-brainstorming/SKILL.md` content update | Skill content only |

### Implementation order

1. Scale-adaptive rigor (schema + CLI + MCP changes)
2. Workflow re-entry (CLI + MCP changes, builds on #1's skill run enhancements)
3. Constitution/principles (validation + templates + skill content)
4. Cross-artifact validation (standalone CLI module)
5. Party mode (SKILL.md content update only)

---

## Success Criteria

- `harness skill run harness-tdd --complexity light` outputs SKILL.md with skipped optional phases
- `harness skill run harness-tdd` auto-detects complexity from git diff context
- `docs/principles.md` is scaffolded by `harness init --level intermediate`
- `harness validate` warns if AGENTS.md references a missing principles file
- `harness skill run harness-brainstorming` injects principles into preamble when file exists
- `harness validate --cross-check` reports spec→plan coverage, plan→implementation gaps, and staleness
- `harness skill run harness-debugging --phase hypothesize` loads prior debug state and starts at Phase 3
- `harness skill run harness-debugging --phase hypothesize` prompts for confirmation when no prior state exists
- `harness skill run harness-brainstorming --party` produces multi-perspective evaluation of proposed approaches
