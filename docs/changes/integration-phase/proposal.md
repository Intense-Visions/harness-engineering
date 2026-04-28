# Integration Phase — Knowledge Materialization and System Wiring Gate

## Overview

### Problem

The harness workflow (brainstorm -> plan -> execute -> verify -> review -> ship) produces high-quality, verified code that often remains siloed. Three gaps exist:

1. **Integration is an afterthought.** Brainstorming specs define _what_ to build but not _how it connects_ to the existing system. Planning produces implementation tasks but no integration tasks. By the time code is done, nobody has thought about registration, exports, discoverability, or documentation.
2. **Knowledge evaporates.** Decisions and rationale from brainstorming/planning live in session artifacts (`handoff.json`) that vanish after the conversation ends. The project's self-knowledge — architecture docs, knowledge graph — doesn't update as features land.
3. **Wiring is unchecked.** WIRED verification (Level 3) confirms import-graph usage but not system-level integration: barrel exports, skill tier registration, route discoverability, documentation presence.

### Solution

Shift integration thinking _left_ into brainstorming and planning, then verify it landed with a dedicated INTEGRATE gate after execution.

- **Brainstorming** produces an **"Integration Points"** section in every spec — entry points affected, registrations needed, docs to update, ADRs to write
- **Planning** includes **integration tasks** alongside implementation tasks — barrel export regeneration, skill registration, ADR authoring, AGENTS.md updates
- **INTEGRATE phase** (new, between VERIFY and REVIEW) **verifies** that planned integration tasks actually completed — it's a gate, not a discovery phase

### Goals

1. Every spec includes an Integration Points section defining how the feature connects to the system
2. Every plan includes integration tasks derived from those integration points
3. The INTEGRATE phase mechanically verifies that integration tasks completed (wiring, knowledge, docs)
4. Significant decisions produce durable ADRs in `docs/knowledge/decisions/`, ingested by the knowledge pipeline as graph nodes
5. All decisions (major and minor) enrich the knowledge graph for future AI context
6. Integration rigor is tiered (small/medium/large) — estimated at plan time, confirmed from execution results, higher tier wins

### Assumptions

- The knowledge pipeline supports adding new extractors. If the current architecture doesn't support pluggable extractors, Phase 4 must also add that extension point.
- `generate-barrel-exports` supports a `--check` (dry-run) flag. If not present, the WIRE sub-phase runs regeneration and checks `git diff` for changes — if barrel exports changed, the previous execution missed this step.
- The autopilot state machine is modifiable without breaking existing sessions (schema migration handles the new state).

### Out of Scope

- Deployment/release automation (handled by CI/CD)
- Merge-to-main automation (remains a human decision at Ship step)
- Changes to how brainstorming/planning _implement_ features — only additions for how they _document integration_

---

## Decisions

| #   | Decision                                                         | Rationale                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Unified Integration Phase, not scattered checks                  | Integration is a distinct concern — mixing it into VERIFY (code correctness) or REVIEW (code quality) blurs their purpose. A dedicated phase has a clear retry boundary and single owner.                                               |
| D2  | Shift-left integration design into brainstorming and planning    | Discovery at the end feels like bureaucracy and catches problems too late. Integration designed upfront is intentional and plannable.                                                                                                   |
| D3  | Tiered rigor scaled to change size                               | A typo fix shouldn't require an ADR. A new package absolutely should. Proportional effort matches how real projects work. Small = wiring only. Medium = wiring + project updates. Large = wiring + updates + knowledge materialization. |
| D4  | Dual-estimate tier classification                                | Plan-time estimates set expectations. Execution-time confirmation catches scope creep. "Higher tier wins" prevents under-classification.                                                                                                |
| D5  | ADRs as source of truth, knowledge graph as derived view         | ADRs are durable (just markdown), reviewable in PRs, and survive tooling changes. The graph provides machine-queryable access. All decisions also enrich the graph directly.                                                            |
| D6  | ADRs live under `docs/knowledge/decisions/`                      | Groups knowledge artifacts under a single namespace. Parallels `.harness/knowledge/` (machine data) with `docs/knowledge/` (human-readable).                                                                                            |
| D7  | State machine position: VERIFY -> INTEGRATE -> REVIEW            | VERIFY confirms code works. INTEGRATE confirms it's connected and documented. REVIEW examines everything together including integration artifacts.                                                                                      |
| D8  | WIRE always runs default checks even with zero integration tasks | A barrel export check takes seconds and catches real problems. Small tier with no explicit integration tasks still gets default wiring verification.                                                                                    |

---

## Technical Design

### Changes to Brainstorming (spec schema)

The brainstorming skill's VALIDATE phase currently writes specs with sections: Overview, Decisions, Technical Design, Success Criteria, Implementation Order. Add a required **Integration Points** section between Technical Design and Success Criteria.

**Integration Points section template:**

```markdown
## Integration Points

### Entry Points

<!-- Which system entry points does this feature touch or create? -->
<!-- e.g., new CLI command, new MCP tool, new skill, new API route, new barrel export -->

### Registrations Required

<!-- What registrations are needed for the feature to be discoverable? -->
<!-- e.g., barrel export regeneration, skill tier assignment, route registration -->

### Documentation Updates

<!-- What docs need updating to reflect the new capability? -->
<!-- e.g., AGENTS.md section, API docs, README, guides -->

### Architectural Decisions

<!-- What decisions warrant ADRs? List the decision and a one-line rationale. -->
<!-- Only for medium/large tier — omit for small changes -->

### Knowledge Impact

<!-- What domain concepts, patterns, or relationships should enter the knowledge graph? -->
```

Brainstorming already asks clarifying questions — this adds integration as one of the things it must clarify before proposing approaches. The section is populated during spec writing, not as a separate step.

### Changes to Planning (integration tasks)

The planning skill currently produces a task list from the spec's Technical Design and Implementation Order. It must now also derive **integration tasks** from the spec's Integration Points section.

Integration tasks are normal plan tasks but tagged with `category: "integration"` to distinguish them from implementation tasks. They appear at the end of the task list (after implementation, before any checkpoint).

**Examples of integration tasks derived from Integration Points:**

| Integration Point                             | Derived Task                                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| "New CLI command `harness check-integration`" | "Regenerate barrel exports via `pnpm run generate-barrel-exports`. Verify new command appears in `_registry.ts`." |
| "New skill at tier 2"                         | "Add skill to tier 2 list in `AGENTS.md`. Generate slash commands."                                               |
| "AGENTS.md capabilities section"              | "Update AGENTS.md to describe the integration phase."                                                             |
| "ADR for tiered integration approach"         | "Write ADR `docs/knowledge/decisions/NNNN-tiered-integration-rigor.md` documenting the tiering decision."         |
| "Domain concept: integration tier"            | "Enrich knowledge graph with `integration-tier` concept node linked to relevant source files."                    |

The plan's `integrationTier` field is set here (planner's estimate), reviewed during plan approval.

### Integration Tier Heuristics

**Plan-time estimate** (set by planner based on spec scope):

| Tier       | Signal                                                               | Integration Requirements                                                 |
| ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **small**  | Bug fix, config change, < 3 files, no new exports                    | Wiring checks only (defaults always run)                                 |
| **medium** | New feature within existing package, new exports, 3-15 files         | Wiring + project updates (roadmap, changelog, graph enrichment)          |
| **large**  | New package, new skill, new public API surface, architectural change | Wiring + project updates + knowledge materialization (ADRs, doc updates) |

**Execution-time confirmation** (derived from git diff after EXECUTE):

```
newPackages > 0                    -> large
newPublicExports > 5               -> large (minimum)
filesChanged > 15 AND newExports   -> medium (minimum)
else                               -> keep plan estimate
```

Higher tier wins. Human is notified of any tier escalation: "Tier escalated from `small` to `medium`: 8 new exports detected."

### New Skill: `harness-integration`

**Location:** `agents/skills/claude-code/harness-integration/`

**Persona agent:** `subagent_type: "harness-verifier"` (reuses the verification agent — integration checking is a form of verification)

**Sub-phases:**

#### WIRE (all tiers)

1. Run default checks regardless of explicit integration tasks:
   - Barrel exports: run `pnpm run generate-barrel-exports --check` (or regenerate + `git diff` if `--check` not supported). If exports changed, previous execution missed this step.
   - `harness validate` passes (architectural constraints met).
2. Read the plan's integration tasks tagged `category: "integration"` that relate to wiring.
3. For each: verify the task's outcome is present in the codebase:
   - Entry point reachability: trace from known entry points (CLI `createProgram()`, MCP `getToolDefinitions()`, skill discovery globs) to new code.
   - Skill registration: if new skill, verify `skill.yaml` + `SKILL.md` exist and skill appears in discovery.
   - Route registration: if new API route, verify it's mounted.
4. Produce a wiring report: `{sessionDir}/integration-wiring.json`.

#### MATERIALIZE (medium + large tiers)

1. Read `handoff.json` decisions from all phases in this session.
2. For large tier: auto-draft ADRs from decisions marked as architectural. Write to `docs/knowledge/decisions/NNNN-<slug>.md`. Present drafts for human approval.
3. For all medium+: enrich knowledge graph — call `ingest_source` with decision metadata so decisions become queryable graph nodes.
4. Verify integration tasks tagged `category: "integration"` that relate to documentation are complete (AGENTS.md updated, guides written, etc.).
5. Produce a materialization report: `{sessionDir}/integration-materialization.json`.

#### UPDATE (medium + large tiers)

1. Roadmap status sync (moved from PHASE_COMPLETE for medium/large tiers).
2. Changelog entry: if `CHANGELOG.md` exists, verify a new entry is present for this feature.
3. Spec cross-reference: annotate the spec's Implementation Order with links to implementation files.
4. Produce an update report: `{sessionDir}/integration-updates.json`.

**Output:** Combined integration report at `{sessionDir}/phase-{N}-integration.json` with pass/fail per sub-phase. On failure, report which integration tasks are incomplete with specific fix instructions.

### Autopilot State Machine Changes

**New state machine:**

```
INIT -> ASSESS -> PLAN -> APPROVE_PLAN -> EXECUTE -> VERIFY -> INTEGRATE -> REVIEW -> PHASE_COMPLETE
                                                                                       |
                                                                                [next phase?]
                                                                                 |           |
                                                                              ASSESS   FINAL_REVIEW -> DONE
```

**INTEGRATE state behavior:**

1. Resolve tier: `max(plan.integrationTier, derived-from-execution)`.
2. If tier escalated: notify human.
3. Dispatch harness-integration skill:
   ```
   subagent_type: "harness-verifier"
   prompt: "Phase {N}: {name}. Session: {sessionSlug}. Tier: {tier}.
            Plan: {planPath}. Verify integration per harness-integration skill."
   ```
4. Pass -> REVIEW.
5. Fail -> report incomplete items. Ask "fix / skip integration / stop":
   - **fix:** re-enter EXECUTE with integration-specific fix tasks, then re-VERIFY, re-INTEGRATE.
   - **skip:** record decision in `decisions[]`, proceed to REVIEW (human override).
   - **stop:** save state and exit.

**Rigor level interaction:**

| Rigor      | INTEGRATE behavior                                                               |
| ---------- | -------------------------------------------------------------------------------- |
| `fast`     | WIRE only (defaults), auto-approve, no ADR drafting                              |
| `standard` | Full tier-appropriate checks                                                     |
| `thorough` | Full checks + human reviews every ADR draft + force knowledge graph verification |

**Updated persona agent table:**

| Skill                   | `subagent_type`         | State(s)             |
| ----------------------- | ----------------------- | -------------------- |
| harness-planning        | `harness-planner`       | PLAN                 |
| harness-execution       | `harness-task-executor` | EXECUTE              |
| harness-verification    | `harness-verifier`      | VERIFY               |
| **harness-integration** | **`harness-verifier`**  | **INTEGRATE**        |
| harness-code-review     | `harness-code-reviewer` | REVIEW, FINAL_REVIEW |

### `harness.orchestrator.md` Changes

Both the project's `harness.orchestrator.md` and the template at `templates/orchestrator/harness.orchestrator.md` update the prompt template's Standard Workflow section:

```markdown
## Standard Workflow

Follow these steps exactly, using the corresponding slash commands to ensure
high-quality, architecturally sound delivery:

1. **Brainstorming:** Use `/harness:brainstorming` to explore the problem space
   and draft a technical proposal in `docs/changes/`. The spec MUST include an
   Integration Points section defining how the feature connects to the system.
2. **Planning:** Use `/harness:planning` to create a detailed implementation plan.
   The plan MUST include integration tasks derived from the spec's Integration Points.
3. **Execution:** Use `/harness:execution` to implement the changes task-by-task,
   including integration tasks (registrations, ADRs, doc updates).
4. **Verification:** Use `/harness:verification` to ensure the implementation is
   complete, wired correctly, and meets all requirements.
5. **Integration:** Use `/harness:integration` to verify that system wiring,
   knowledge materialization, and documentation updates are complete per the
   integration tier.
6. **Code Review:** Use `/harness:code-review` and `/harness:pre-commit-review`
   to perform a final quality check before completing the task.
7. **Ship:** When the review is clean, you are pre-authorized to ship without asking:
   - Create a topic branch if you are still on `main`/`master`.
   - Stage your changes and create a descriptive commit (Conventional Commits style).
   - Push the branch with `git push -u origin HEAD`.
   - Open a pull request.
   - Report the PR URL as your final output, then stop.
```

### ADR Format

```markdown
---
number: NNNN
title: <decision title>
date: <ISO date>
status: accepted | superseded | deprecated
tier: large
source: <spec path or session slug>
supersedes: <prior ADR number, if any>
---

## Context

<What situation prompted this decision? What constraints existed?>

## Decision

<What was decided and why?>

## Consequences

<What follows from this decision -- positive, negative, and neutral?>
```

ADR numbering is sequential. The INTEGRATE phase auto-assigns the next number by scanning `docs/knowledge/decisions/`.

### Knowledge Pipeline Ingestion

The knowledge pipeline gains a new extractor: `decision-extractor`. It:

1. Scans `docs/knowledge/decisions/*.md` for ADR files.
2. Parses frontmatter + sections.
3. Creates graph nodes of type `decision` with edges to affected files/modules.
4. On re-extraction, detects ADRs marked `superseded` or `deprecated` and updates graph accordingly.

Minor decisions (not warranting an ADR) are enriched directly via `ingest_source` during the MATERIALIZE sub-phase, creating lightweight `decision` nodes with the handoff.json decision text as content.

---

## Integration Points

### Entry Points

- New skill: `harness-integration` (discoverable via `/harness:integration`)
- Modified skills: `harness-brainstorming` (Integration Points section), `harness-planning` (integration tasks + `integrationTier`)
- Modified skill: `harness-autopilot` (INTEGRATE state)
- Modified config: `harness.orchestrator.md` and `templates/orchestrator/harness.orchestrator.md`

### Registrations Required

- Skill registration: `harness-integration` at tier 1 (workflow skill, always-loaded)
- Slash command generation: `/harness:integration` must appear in generated commands
- Persona agent table in autopilot SKILL.md updated

### Documentation Updates

- AGENTS.md: describe the integration phase, its position in the workflow, and the tiering model
- Orchestrator guide (`docs/guides/orchestrator.md`): update workflow description

### Architectural Decisions

- ADR: Tiered integration rigor approach
- ADR: Shift-left integration design into brainstorming and planning

### Knowledge Impact

- Domain concepts: integration tier (small/medium/large), integration phase, knowledge materialization, system wiring verification
- Relationships: integration phase -> verification phase (depends on), integration phase -> review phase (feeds into)

---

## Success Criteria

1. **Every spec produced by brainstorming contains an Integration Points section.** The section includes at minimum: Entry Points, Registrations Required, and Knowledge Impact subsections. Brainstorming that omits this section fails its own gate.
2. **Every plan produced by planning contains integration tasks.** Tasks tagged `category: "integration"` appear in the plan, derived from the spec's Integration Points. Plans with zero integration tasks for medium/large tier changes fail plan approval signals.
3. **The autopilot state machine includes INTEGRATE between VERIFY and REVIEW.** The state machine is `INIT -> ASSESS -> PLAN -> APPROVE_PLAN -> EXECUTE -> VERIFY -> INTEGRATE -> REVIEW -> PHASE_COMPLETE -> DONE`. State transitions are recorded in `autopilot-state.json`.
4. **Tier classification works end-to-end.** Planner sets `integrationTier` in the plan. After execution, the system re-derives the tier from actual changes. The effective tier is `max(planned, derived)`. Tier escalation notifies the human.
5. **WIRE sub-phase catches unregistered code.** For a feature that adds a new CLI command but skips barrel export regeneration, WIRE fails with a specific message identifying the unregistered command.
6. **MATERIALIZE sub-phase produces ADRs for large-tier changes.** ADRs are written to `docs/knowledge/decisions/NNNN-<slug>.md` with valid frontmatter. The knowledge pipeline can ingest them as graph nodes.
7. **ADRs are reviewable in PRs.** Since they're markdown files under `docs/knowledge/decisions/`, they appear in the PR diff alongside code changes.
8. **Knowledge graph is enriched with decisions.** After INTEGRATE, `ask_graph` queries about decisions return results. Both ADR-sourced decisions (major) and handoff-sourced decisions (minor) are queryable.
9. **`harness.orchestrator.md` and its template include the Integration step.** The prompt template's Standard Workflow lists 7 steps (brainstorming through ship) with Integration as step 5. Both the project-root file and `templates/orchestrator/harness.orchestrator.md` are updated.
10. **Tiered rigor is proportional.** A small-tier change (bug fix) passes INTEGRATE with only wiring checks — no ADR required, no doc update required. A large-tier change (new package) requires wiring + materialization + project updates.
11. **Fast rigor skips gracefully.** At `rigorLevel: "fast"`, INTEGRATE runs WIRE only, auto-approves, and produces no ADR drafts. The phase adds minimal latency.
12. **Integration failure has a clear fix path.** When INTEGRATE fails, the report identifies exactly which integration tasks are incomplete with actionable fix instructions. The "fix" option re-enters EXECUTE with those specific tasks.

---

## Implementation Order

### Phase 1: Spec and Plan Schema Changes

<!-- complexity: low -->

Update brainstorming and planning skills to produce integration-aware artifacts.

- Add Integration Points section template to `harness-brainstorming` SKILL.md's VALIDATE phase (spec writing instructions)
- Add `integrationTier` field to plan schema in `harness-planning` SKILL.md
- Add `category: "integration"` task tag support to planning's task breakdown instructions
- Add instructions to planning for deriving integration tasks from the spec's Integration Points section

**Verification:** A brainstorming session produces a spec with an Integration Points section. A planning session produces a plan with `integrationTier` set and integration-tagged tasks.

### Phase 2: Integration Skill and Tier Engine

<!-- complexity: medium -->

Build the `harness-integration` skill and the tier classification logic.

- Create `agents/skills/claude-code/harness-integration/skill.yaml` and `SKILL.md`
- Implement the three sub-phases: WIRE, MATERIALIZE, UPDATE
- WIRE: barrel export check, entry point reachability trace, skill discovery verification, route mount verification
- MATERIALIZE: ADR auto-drafting from handoff decisions, knowledge graph enrichment via `ingest_source`, documentation task verification
- UPDATE: roadmap sync, changelog verification, spec cross-reference annotation
- Implement tier derivation from execution results (new packages, new exports, files changed)
- Implement `max(planned, derived)` tier resolution with escalation notification
- Implement rigor level interaction (fast: WIRE only, standard: full, thorough: full + human review)

**Verification:** The skill can be invoked standalone via `/harness:integration`. Given a completed execution with a plan containing integration tasks, it produces a pass/fail report per sub-phase. Tier derivation correctly escalates when execution exceeds plan estimates.

### Phase 3: Autopilot State Machine and Orchestrator Template

<!-- complexity: medium -->

Wire the integration skill into the autopilot and update the orchestrator config.

- Add INTEGRATE state to autopilot SKILL.md between VERIFY and REVIEW
- Add dispatch logic: resolve tier, dispatch harness-integration, handle pass/fail/fix/skip/stop
- Add INTEGRATE to the persona agent table
- Update the Process summary section
- Add INTEGRATE to the Gates section ("No skipping INTEGRATE")
- Update rigor level table with INTEGRATE column
- Update `harness.orchestrator.md` (project root) prompt template: 7-step workflow with Integration as step 5
- Update `templates/orchestrator/harness.orchestrator.md` prompt template identically
- Update autopilot state persistence: `autopilot-state.json` records INTEGRATE transitions
- Add integration report path to PHASE_COMPLETE summary

**Verification:** Autopilot run traverses `VERIFY -> INTEGRATE -> REVIEW`. State file records the INTEGRATE transition. Orchestrator prompt template shows 7 steps. Template file matches project-root file.

### Phase 4: ADR System and Knowledge Pipeline Integration

<!-- complexity: low -->

Establish the ADR directory, format, and knowledge pipeline ingestion.

- Create `docs/knowledge/decisions/` directory with a README explaining the format and numbering scheme
- Implement auto-numbering logic in the integration skill (scan directory, assign next number)
- Add `decision-extractor` to the knowledge pipeline: scan `docs/knowledge/decisions/*.md`, parse frontmatter + sections, create `decision` graph nodes with edges to affected modules
- Add minor decision enrichment: handoff.json decisions that don't warrant ADRs become lightweight graph nodes via `ingest_source`
- Verify round-trip: write ADR -> run knowledge pipeline -> query via `ask_graph` returns the decision

**Verification:** An ADR written to `docs/knowledge/decisions/0001-test-decision.md` is ingested by the knowledge pipeline and queryable via `ask_graph`. Minor decisions from handoff.json also appear as graph nodes.

### Phase 5: Integration of This Feature

<!-- complexity: low -->

This feature eats its own cooking — use the integration phase to integrate itself.

- Write ADR for the tiered integration approach: `docs/knowledge/decisions/0001-tiered-integration-rigor.md`
- Write ADR for shift-left integration design: `docs/knowledge/decisions/0002-shift-left-integration-into-brainstorming.md`
- Regenerate slash commands to include `/harness:integration`
- Update AGENTS.md to describe the integration phase, its position in the workflow, and the tiering model
- Verify the new skill appears in skill discovery at the correct tier
- Run the integration skill against itself as a final smoke test
- Enrich knowledge graph with integration-phase concepts

**Verification:** `/harness:integration` is discoverable. AGENTS.md describes the integration phase. ADRs exist and are queryable. The feature passes its own INTEGRATE gate.
