# Plan: Spec & Plan Soundness Review — Verification and Completion

**Date:** 2026-03-21
**Spec:** docs/changes/spec-plan-soundness-review/proposal.md
**Estimated tasks:** 3
**Estimated time:** 10 minutes

## Goal

Verify that all artifacts for the `harness-soundness-review` skill are complete, correct, and integrated, then produce the change delta document.

## Context: What Already Exists

Prior plans decomposed this feature into sub-phases and executed them. The following artifacts already exist:

- `agents/skills/claude-code/harness-soundness-review/skill.yaml` — complete with modes, phases, depends_on
- `agents/skills/claude-code/harness-soundness-review/SKILL.md` — comprehensive (~1200 lines) with all 14 checks (S1-S7, P1-P7), convergence loop, fix procedures, surfacing UX, graph integration, examples
- `agents/skills/gemini-cli/harness-soundness-review/skill.yaml` — byte-identical to claude-code copy
- `agents/skills/gemini-cli/harness-soundness-review/SKILL.md` — byte-identical to claude-code copy
- `agents/skills/claude-code/harness-brainstorming/SKILL.md` line 87 — soundness invocation in Phase 4 step 2
- `agents/skills/claude-code/harness-planning/SKILL.md` line 131 — soundness invocation in Phase 4 step 6
- `agents/skills/claude-code/harness-brainstorming/skill.yaml` depends_on includes `harness-soundness-review`
- `agents/skills/claude-code/harness-planning/skill.yaml` depends_on includes `harness-soundness-review`
- All gemini-cli copies of brainstorming and planning also have the invocation lines and depends_on references

## Observable Truths (Acceptance Criteria)

1. When reading `agents/skills/claude-code/harness-soundness-review/skill.yaml`, the file contains: name, version, description, cognitive_mode, triggers, platforms (claude-code, gemini-cli), tools, cli with `--mode` arg, type: rigid, four phases (check, fix, converge, surface), and empty depends_on.
2. When reading `agents/skills/claude-code/harness-soundness-review/SKILL.md`, the file contains: Finding Schema (JSON with id, check, title, detail, severity, autoFixable, suggestedFix, evidence), all 7 spec-mode checks (S1-S7) with detection procedures and example findings, all 7 plan-mode checks (P1-P7) with detection procedures and example findings, convergence loop with termination guarantee, fix procedures for each auto-fixable check, surfacing UX (group/prioritize, present, user interaction, re-check, clean exit), graph integration table with fallback, and examples.
3. When reading `agents/skills/claude-code/harness-brainstorming/SKILL.md`, Phase 4 step 2 invokes `harness-soundness-review --mode spec` before writing the spec.
4. When reading `agents/skills/claude-code/harness-planning/SKILL.md`, Phase 4 step 6 invokes `harness-soundness-review --mode plan` before writing the plan.
5. When running `diff` between claude-code and gemini-cli copies of the soundness-review skill files, both pairs (skill.yaml and SKILL.md) are byte-identical.
6. When running `harness validate`, the command passes.
7. The file `docs/changes/spec-plan-soundness-review/delta.md` exists documenting the changes to brainstorming and planning skills.

## File Map

- VERIFY agents/skills/claude-code/harness-soundness-review/skill.yaml (exists, complete)
- VERIFY agents/skills/claude-code/harness-soundness-review/SKILL.md (exists, complete)
- VERIFY agents/skills/gemini-cli/harness-soundness-review/skill.yaml (exists, byte-identical)
- VERIFY agents/skills/gemini-cli/harness-soundness-review/SKILL.md (exists, byte-identical)
- VERIFY agents/skills/claude-code/harness-brainstorming/SKILL.md (invocation line present)
- VERIFY agents/skills/claude-code/harness-brainstorming/skill.yaml (depends_on present)
- VERIFY agents/skills/claude-code/harness-planning/SKILL.md (invocation line present)
- VERIFY agents/skills/claude-code/harness-planning/skill.yaml (depends_on present)
- VERIFY agents/skills/gemini-cli/harness-brainstorming/SKILL.md (invocation line present)
- VERIFY agents/skills/gemini-cli/harness-brainstorming/skill.yaml (depends_on present)
- VERIFY agents/skills/gemini-cli/harness-planning/SKILL.md (invocation line present)
- VERIFY agents/skills/gemini-cli/harness-planning/skill.yaml (depends_on present)
- CREATE docs/changes/spec-plan-soundness-review/delta.md

## Tasks

### Task 1: Verify soundness-review skill artifacts against spec

**Depends on:** none
**Files:** agents/skills/claude-code/harness-soundness-review/skill.yaml, agents/skills/claude-code/harness-soundness-review/SKILL.md

Verify every spec requirement is satisfied by the existing artifacts.

1. Read `agents/skills/claude-code/harness-soundness-review/skill.yaml` and confirm:
   - `name: harness-soundness-review`
   - `version: "1.0.0"`
   - `cognitive_mode: meticulous-verifier`
   - `platforms` includes `claude-code` and `gemini-cli`
   - `cli.args` includes `mode` with `required: true`
   - `type: rigid`
   - Four phases: check, fix, converge, surface
   - `depends_on: []`

2. Read `agents/skills/claude-code/harness-soundness-review/SKILL.md` and confirm presence of:
   - Finding Schema section with JSON structure matching spec's `SoundnessFinding` interface (id, check, title, detail, severity, autoFixable, suggestedFix, evidence)
   - All 7 spec-mode checks: S1 Internal coherence, S2 Goal-criteria traceability, S3 Unstated assumptions, S4 Requirement completeness, S5 Feasibility red flags, S6 YAGNI re-scan, S7 Testability
   - All 7 plan-mode checks: P1 Spec-plan coverage, P2 Task completeness, P3 Dependency correctness, P4 Ordering sanity, P5 Risk coverage, P6 Scope drift, P7 Task-level feasibility
   - Each check has: What to analyze, How to detect, Finding classification, Example findings
   - Convergence loop: Phase 1 CHECK, Phase 2 FIX, Phase 3 CONVERGE, Phase 4 SURFACE
   - Termination guarantee section
   - Fix procedures for auto-fixable checks (S2, S3, S4, S7, P1, P2, P3, P4, P5)
   - Silent vs Surfaced classification table
   - Graph detection and fallback procedure
   - Clean Exit conditions
   - Worked examples for both spec-mode and plan-mode convergence

3. Verify platform parity:

   ```bash
   diff agents/skills/claude-code/harness-soundness-review/skill.yaml agents/skills/gemini-cli/harness-soundness-review/skill.yaml
   diff agents/skills/claude-code/harness-soundness-review/SKILL.md agents/skills/gemini-cli/harness-soundness-review/SKILL.md
   ```

   Both diffs must produce no output (byte-identical).

4. Run: `harness validate`
5. Commit: `chore(soundness-review): verify skill artifacts against spec`

---

### Task 2: Verify parent skill integration

**Depends on:** Task 1
**Files:** agents/skills/claude-code/harness-brainstorming/SKILL.md, agents/skills/claude-code/harness-planning/SKILL.md, agents/skills/claude-code/harness-brainstorming/skill.yaml, agents/skills/claude-code/harness-planning/skill.yaml

Confirm that the brainstorming and planning skills have the soundness review invocation lines and dependency declarations as specified in the proposal.

1. Read `agents/skills/claude-code/harness-brainstorming/SKILL.md` and confirm:
   - Phase 4 VALIDATE contains a step that invokes `harness-soundness-review --mode spec`
   - The step is positioned after section-by-section review and before writing the spec to `docs/`
   - The step says not to proceed until the soundness review converges

2. Read `agents/skills/claude-code/harness-planning/SKILL.md` and confirm:
   - Phase 4 VALIDATE contains a step that invokes `harness-soundness-review --mode plan`
   - The step is positioned after completeness verification and before writing the plan
   - The step says not to proceed until the soundness review converges

3. Read `agents/skills/claude-code/harness-brainstorming/skill.yaml` and confirm:
   - `depends_on` array includes `harness-soundness-review`

4. Read `agents/skills/claude-code/harness-planning/skill.yaml` and confirm:
   - `depends_on` array includes `harness-soundness-review`

5. Verify gemini-cli copies have the same integration:

   ```bash
   grep -n "soundness-review" agents/skills/gemini-cli/harness-brainstorming/SKILL.md
   grep -n "soundness-review" agents/skills/gemini-cli/harness-planning/SKILL.md
   grep -n "soundness-review" agents/skills/gemini-cli/harness-brainstorming/skill.yaml
   grep -n "soundness-review" agents/skills/gemini-cli/harness-planning/skill.yaml
   ```

   All four must return matching lines.

6. Run: `harness validate`

---

### Task 3: Create change delta document

**Depends on:** Task 2
**Files:** docs/changes/spec-plan-soundness-review/delta.md

Document the changes made to existing skills as a delta from their prior state.

1. Create `docs/changes/spec-plan-soundness-review/delta.md`:

   ```markdown
   # Change Delta: Spec & Plan Soundness Review

   **Date:** 2026-03-21
   **Spec:** docs/changes/spec-plan-soundness-review/proposal.md

   ## New Artifacts

   - [ADDED] `agents/skills/claude-code/harness-soundness-review/skill.yaml` — skill manifest with two modes (spec, plan), four phases (check, fix, converge, surface), cognitive_mode meticulous-verifier
   - [ADDED] `agents/skills/claude-code/harness-soundness-review/SKILL.md` — full skill definition with 14 checks (S1-S7 spec mode, P1-P7 plan mode), SoundnessFinding schema, convergence loop, auto-fix procedures, surfacing UX, graph integration with fallback
   - [ADDED] `agents/skills/gemini-cli/harness-soundness-review/skill.yaml` — byte-identical platform copy
   - [ADDED] `agents/skills/gemini-cli/harness-soundness-review/SKILL.md` — byte-identical platform copy

   ## Changes to harness-brainstorming

   - [MODIFIED] `agents/skills/claude-code/harness-brainstorming/SKILL.md` — Phase 4 VALIDATE: added step 2 invoking `harness-soundness-review --mode spec` after section review and before writing spec to docs/
   - [MODIFIED] `agents/skills/claude-code/harness-brainstorming/skill.yaml` — added `harness-soundness-review` to `depends_on` array
   - [MODIFIED] `agents/skills/gemini-cli/harness-brainstorming/SKILL.md` — same change as claude-code copy
   - [MODIFIED] `agents/skills/gemini-cli/harness-brainstorming/skill.yaml` — same change as claude-code copy

   ## Changes to harness-planning

   - [MODIFIED] `agents/skills/claude-code/harness-planning/SKILL.md` — Phase 4 VALIDATE: added step 6 invoking `harness-soundness-review --mode plan` after completeness verification and before writing plan
   - [MODIFIED] `agents/skills/claude-code/harness-planning/skill.yaml` — added `harness-soundness-review` to `depends_on` array
   - [MODIFIED] `agents/skills/gemini-cli/harness-planning/SKILL.md` — same change as claude-code copy
   - [MODIFIED] `agents/skills/gemini-cli/harness-planning/skill.yaml` — same change as claude-code copy

   ## No Changes

   - No existing checks, validation commands, or harness CLI behavior modified
   - No new user-facing commands added (soundness review is invoked automatically by parent skills)
   - No changes to `harness validate` or `harness check-deps`
   ```

2. Run: `harness validate`
3. Commit: `docs(soundness-review): add change delta document`

## Spec Criteria Traceability

| Spec Criterion                                                  | Task(s)                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Automatic invocation (no user command needed)                | Task 2 — verifies invocation lines in brainstorming and planning     |
| 2. Spec coherence caught (contradictions detected)              | Task 1 — verifies S1 check exists with detection procedures          |
| 3. Traceability enforced (goals to criteria, criteria to tasks) | Task 1 — verifies S2 and P1 checks exist                             |
| 4. Silent fixes don't require user attention                    | Task 1 — verifies Silent vs Surfaced classification table            |
| 5. Design decisions always surface                              | Task 1 — verifies S1, S5, S6, P6, P7 are never auto-fixable          |
| 6. Convergence terminates                                       | Task 1 — verifies termination guarantee section                      |
| 7. Works without graph                                          | Task 1 — verifies graph detection and fallback procedure             |
| 8. Graph enhances when available                                | Task 1 — verifies graph integration table with With/Without variants |
| 9. No new user commands                                         | Task 2 — verifies invocation is embedded in existing skill flows     |
| 10. Parent skills unmodified except one invocation line each    | Task 2 — verifies minimal additions to brainstorming and planning    |
