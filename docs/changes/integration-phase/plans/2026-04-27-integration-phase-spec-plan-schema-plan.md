# Plan: Integration Phase -- Spec and Plan Schema Changes (Phase 1)

**Date:** 2026-04-27 | **Spec:** docs/changes/integration-phase/proposal.md | **Tasks:** 4 | **Time:** ~15 min | **Integration Tier:** small

## Goal

Update the harness-brainstorming and harness-planning skills so that brainstorming produces specs with an Integration Points section and planning produces plans with an `integrationTier` field and integration-tagged tasks derived from that section.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/claude-code/harness-brainstorming/SKILL.md` Phase 4 VALIDATE step 1 lists "Integration points" between "Technical design" and "Success criteria" in the section-by-section presentation list.
2. `agents/skills/claude-code/harness-brainstorming/SKILL.md` contains instructions within VALIDATE describing the five Integration Points subsections (Entry Points, Registrations Required, Documentation Updates, Architectural Decisions, Knowledge Impact) and when to populate them.
3. `agents/skills/claude-code/harness-brainstorming/SKILL.md` Success Criteria lists "integration points" as one of the required sections.
4. `agents/skills/claude-code/harness-planning/SKILL.md` Plan Document Structure template header includes `**Integration Tier:** small | medium | large`.
5. `agents/skills/claude-code/harness-planning/SKILL.md` contains an Integration Tier Heuristics table with small/medium/large tier definitions.
6. `agents/skills/claude-code/harness-planning/SKILL.md` Phase 2 DECOMPOSE contains step 7 for deriving integration tasks from the spec's Integration Points section, with `category: "integration"` tagging.
7. `agents/skills/claude-code/harness-planning/SKILL.md` Phase 3 SEQUENCE step 1 explicitly orders integration tasks after implementation tasks.
8. `pnpm harness validate` passes after all changes.

## File Map

- MODIFY `agents/skills/claude-code/harness-brainstorming/SKILL.md` (add Integration Points to VALIDATE section list, add population instructions, update Success Criteria)
- MODIFY `agents/skills/claude-code/harness-planning/SKILL.md` (add integrationTier to plan template header, add tier heuristics section, add integration task derivation to DECOMPOSE, update SEQUENCE ordering)

## Skeleton

_Not produced -- task count (4) below threshold (8) for standard rigor._

## Changes

- [ADDED] Integration Points section template to brainstorming VALIDATE phase
- [ADDED] `integrationTier` field to planning plan document header
- [ADDED] Integration Tier Heuristics table to planning SKILL.md
- [ADDED] Step 7 in planning DECOMPOSE for deriving integration tasks from spec
- [MODIFIED] Planning SEQUENCE step 1 to order integration tasks after implementation tasks
- [MODIFIED] Brainstorming Success Criteria to include "integration points"

## Uncertainties

- [ASSUMPTION] The `integrationTier` field belongs in the plan document header metadata line. The spec says "The plan's `integrationTier` field is set here" but does not specify exactly where in the plan document. Placing it in the header metadata line is the natural location alongside Date, Spec, Tasks, and Time.
- [ASSUMPTION] The Integration Points section template (5 subsections with comment placeholders) from the spec is the exact format to embed in instructions. The spec provides this template explicitly.
- [DEFERRABLE] Whether the existing brainstorming example (notification system) should be updated to show an Integration Points section. The spec only asks to add to the template and instructions. Example updates can happen in a follow-up.

## Tasks

### Task 1: Add Integration Points section to brainstorming VALIDATE phase

**Depends on:** none | **Files:** `agents/skills/claude-code/harness-brainstorming/SKILL.md` | **Category:** implementation

**Edit 1 -- Add "Integration points" to the section-by-section list (line 110-112).**

Find:

```
   - Technical design (data structures, APIs, file layout)
   - Success criteria (observable, testable outcomes)
   - Implementation order (high-level phases, not detailed tasks)
```

Replace with:

```
   - Technical design (data structures, APIs, file layout)
   - Integration points (entry points, registrations, docs, decisions, knowledge impact)
   - Success criteria (observable, testable outcomes)
   - Implementation order (high-level phases, not detailed tasks)
```

**Edit 2 -- Add Integration Points population instructions after the section list and before step 2.**

Find:

```
   - Implementation order (high-level phases, not detailed tasks)

2. **Run soundness review.** Invoke `harness-soundness-review --mode spec` against the draft. Do not write to `docs/` until the review converges with no remaining issues.
```

Replace with:

```
   - Implementation order (high-level phases, not detailed tasks)

   The **Integration Points** section is required in every spec. It defines how the feature connects to the existing system. Populate it with five subsections:

   - **Entry Points** -- Which system entry points does this feature touch or create? (e.g., new CLI command, new MCP tool, new skill, new API route, new barrel export)
   - **Registrations Required** -- What registrations are needed for the feature to be discoverable? (e.g., barrel export regeneration, skill tier assignment, route registration)
   - **Documentation Updates** -- What docs need updating to reflect the new capability? (e.g., AGENTS.md section, API docs, README, guides)
   - **Architectural Decisions** -- What decisions warrant ADRs? List the decision and a one-line rationale. Only for medium/large tier changes -- omit for small changes.
   - **Knowledge Impact** -- What domain concepts, patterns, or relationships should enter the knowledge graph?

   If the feature is a small change (bug fix, config tweak, < 3 files), the section may contain only Entry Points and Registrations Required with "None" for the others. The section must still be present.

2. **Run soundness review.** Invoke `harness-soundness-review --mode spec` against the draft. Do not write to `docs/` until the review converges with no remaining issues.
```

**Edit 3 -- Update Success Criteria to include "integration points".**

Find:

```
- Spec exists in `docs/` with all required sections (overview, decisions, technical design, success criteria, implementation order)
```

Replace with:

```
- Spec exists in `docs/` with all required sections (overview, decisions, technical design, integration points, success criteria, implementation order)
```

Steps:

1. Apply Edit 1
2. Apply Edit 2
3. Apply Edit 3
4. Run: `pnpm harness validate`
5. Commit: `feat(brainstorming): add Integration Points section to spec writing template`

---

### Task 2: Add integrationTier field and tier heuristics to planning SKILL.md

**Depends on:** none (parallelizable with Task 1) | **Files:** `agents/skills/claude-code/harness-planning/SKILL.md` | **Category:** implementation

**Edit 1 -- Add `integrationTier` to Plan Document Structure header.**

Find:

```
**Date:** YYYY-MM-DD | **Spec:** (if applicable) | **Tasks:** N | **Time:** N min
```

Replace with:

```
**Date:** YYYY-MM-DD | **Spec:** (if applicable) | **Tasks:** N | **Time:** N min | **Integration Tier:** small | medium | large
```

**Edit 2 -- Add Integration Tier Heuristics subsection after Plan Document Structure code block and before Session State.**

Find:

```
[checkpoint:human-verify] ...
```

## Session State

```

Replace with:
```

[checkpoint:human-verify] ...

```

### Integration Tier Heuristics

When a spec contains an **Integration Points** section, set the plan's `integrationTier` field based on scope:

| Tier | Signal | Integration Requirements |
|---|---|---|
| **small** | Bug fix, config change, < 3 files, no new exports | Wiring checks only (defaults always run) |
| **medium** | New feature within existing package, new exports, 3-15 files | Wiring + project updates (roadmap, changelog, graph enrichment) |
| **large** | New package, new skill, new public API surface, architectural change | Wiring + project updates + knowledge materialization (ADRs, doc updates) |

If the spec has no Integration Points section, omit the `integrationTier` field from the plan header.

## Session State
```

Steps:

1. Apply Edit 1
2. Apply Edit 2
3. Run: `pnpm harness validate`
4. Commit: `feat(planning): add integrationTier field and tier heuristics to plan schema`

---

### Task 3: Add integration task derivation instructions to planning DECOMPOSE phase

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/harness-planning/SKILL.md` | **Category:** implementation

**Edit 1 -- Add step 7 to Phase 2 DECOMPOSE for deriving integration tasks.**

Find:

```
6. **Include checkpoints.** Mark tasks requiring human input:
   - `[checkpoint:human-verify]` — Pause, show result, wait for confirmation
   - `[checkpoint:decision]` — Pause, present options, wait for choice
   - `[checkpoint:human-action]` — Pause, instruct human on required action

---

### Phase 3: SEQUENCE — Order Tasks and Identify Dependencies
```

Replace with:

```
6. **Include checkpoints.** Mark tasks requiring human input:
   - `[checkpoint:human-verify]` — Pause, show result, wait for confirmation
   - `[checkpoint:decision]` — Pause, present options, wait for choice
   - `[checkpoint:human-action]` — Pause, instruct human on required action

7. **Derive integration tasks from the spec's Integration Points section.** If the spec contains an Integration Points section, create tasks for each integration point. Integration tasks are normal plan tasks but tagged with `category: "integration"` in their description. They appear at the end of the task list, after all implementation tasks.

   For each subsection of Integration Points, derive tasks:

   | Integration Point | Example Derived Task |
   |---|---|
   | Entry Points: "New CLI command" | "Regenerate barrel exports. Verify new command appears in `_registry.ts`." |
   | Registrations Required: "Skill at tier 2" | "Add skill to tier list in `AGENTS.md`. Generate slash commands." |
   | Documentation Updates: "AGENTS.md capabilities" | "Update AGENTS.md to describe the feature." |
   | Architectural Decisions: "ADR for approach X" | "Write ADR `docs/knowledge/decisions/NNNN-<slug>.md`." |
   | Knowledge Impact: "Domain concept Y" | "Enrich knowledge graph with concept node." |

   Integration tasks follow the same atomic task rules (2-5 minutes, exact file paths, exact code). Tag each with `**Category:** integration` in the task header.

   If the spec has no Integration Points section, skip this step.

---

### Phase 3: SEQUENCE — Order Tasks and Identify Dependencies
```

**Edit 2 -- Update Phase 3 SEQUENCE ordering guidance.**

Find:

```
1. **Order by dependency.** Types before implementations. Implementations before integrations. Tests alongside implementations (same task, TDD style).
```

Replace with:

```
1. **Order by dependency.** Types before implementations. Implementations before integrations. Integration tasks (tagged `category: "integration"`) after all implementation tasks. Tests alongside implementations (same task, TDD style).
```

Steps:

1. Apply Edit 1
2. Apply Edit 2
3. Run: `pnpm harness validate`
4. Commit: `feat(planning): add integration task derivation from spec Integration Points`

---

### Task 4: Verify end-to-end `[checkpoint:human-verify]`

**Depends on:** Tasks 1, 2, 3 | **Files:** both SKILL.md files (read-only verification)

1. Read `agents/skills/claude-code/harness-brainstorming/SKILL.md` and verify:
   - Phase 4 VALIDATE step 1 lists "Integration points" between "Technical design" and "Success criteria"
   - Step 1 includes the 5-subsection population instructions
   - Success Criteria includes "integration points" in the required sections list
2. Read `agents/skills/claude-code/harness-planning/SKILL.md` and verify:
   - Plan Document Structure header includes `**Integration Tier:** small | medium | large`
   - Integration Tier Heuristics table exists between Plan Document Structure and Session State
   - Phase 2 step 7 contains integration task derivation instructions with the example table
   - Phase 3 step 1 mentions integration tasks ordered after implementation tasks
3. Run: `pnpm harness validate`
4. Present both files for human review

No commit -- verification-only task.

## Task Sequence

| Task                                           | Depends On    | Parallelizable With |
| ---------------------------------------------- | ------------- | ------------------- |
| Task 1 (brainstorming Integration Points)      | none          | Task 2              |
| Task 2 (planning integrationTier + heuristics) | none          | Task 1              |
| Task 3 (planning DECOMPOSE + SEQUENCE)         | Task 2        | --                  |
| Task 4 (verify end-to-end)                     | Tasks 1, 2, 3 | --                  |

**Estimated total:** 4 tasks, ~15 minutes
