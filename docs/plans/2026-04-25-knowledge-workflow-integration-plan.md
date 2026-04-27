# Plan: Knowledge Workflow Integration (Phase 4)

**Date:** 2026-04-25 | **Spec:** docs/changes/knowledge-doc-materialization/proposal.md (Phase 4) | **Tasks:** 3 | **Time:** ~12 min

## Goal

Update the planning, execution, and autopilot SKILL.md files to integrate the knowledge pipeline at the right workflow moments: materialize before decomposition, verify before execution, reconcile after implementation, and surface gaps as an approval signal.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/claude-code/harness-planning/SKILL.md` contains a "Phase 1.5: KNOWLEDGE BASELINE" section between Phase 1 SCOPE and Phase 2 DECOMPOSE, instructing the planner to run `harness knowledge-pipeline` in detect mode, optionally fix, cross-check uncertainties, and reference knowledge docs in Phase 2.
2. The Rigor Levels table in planning SKILL.md includes a `KNOWLEDGE` row: fast skips, standard/thorough run.
3. `agents/skills/claude-code/harness-autopilot/SKILL.md` APPROVE_PLAN signals list includes a knowledge gap signal checking `totalGaps > 0`.
4. `agents/skills/claude-code/harness-execution/SKILL.md` Phase 1 PREPARE contains step 5b "Knowledge health check" with detect-only mode, critical contradictions as blockers, gaps as warnings.
5. `agents/skills/claude-code/harness-execution/SKILL.md` Phase 4 PERSIST contains a knowledge reconciliation step after graph refresh.
6. All additions are optional (skip when no knowledge directory or graph exists) and do not break existing flow.
7. Formatting matches each SKILL.md's existing style.

## File Map

- MODIFY `agents/skills/claude-code/harness-planning/SKILL.md` (add Phase 1.5 section + update Rigor Levels table)
- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` (add knowledge gap signal to APPROVE_PLAN)
- MODIFY `agents/skills/claude-code/harness-execution/SKILL.md` (add step 5b in PREPARE + reconciliation in PERSIST)

## Tasks

### Task 1: Add Phase 1.5 KNOWLEDGE BASELINE and update Rigor Levels in planning SKILL.md

**Depends on:** none | **Files:** `agents/skills/claude-code/harness-planning/SKILL.md`

1. Open `agents/skills/claude-code/harness-planning/SKILL.md`.

2. **Update the Rigor Levels table** (lines 29-34). Add a `KNOWLEDGE` row between `SCOPE` and `DECOMPOSE`. The updated table should be:

   ```markdown
   | Phase     | `fast`                                             | `standard` (default)                       | `thorough`                                          |
   | --------- | -------------------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
   | SCOPE     | No change.                                         | No change.                                 | No change.                                          |
   | KNOWLEDGE | Skip entirely.                                     | Run detect; fix if gaps found.             | Run detect; fix if gaps found.                      |
   | DECOMPOSE | Skip skeleton. Full tasks directly after file map. | Skeleton if tasks >= 8; full tasks if < 8. | Always skeleton. Require approval before expanding. |
   | SEQUENCE  | No change.                                         | No change.                                 | No change.                                          |
   | VALIDATE  | No change.                                         | No change.                                 | No change.                                          |
   ```

3. **Insert Phase 1.5 section** after the "Graph-Enhanced Context" subsection (ends at line 164 with `Fall back to file-based commands if no graph is available.`) and before `### Phase 2: DECOMPOSE` (line 168). Insert the following block, preceded by a `---` separator:

   ```markdown
   ---

   ### Phase 1.5: KNOWLEDGE BASELINE — Materialize Domain Knowledge

   Before decomposing into tasks, ensure domain knowledge from PRDs and specs is documented. **Skip this phase** when no PRDs, specs, or business domain documents exist in the project, or when rigor level is `fast`.

   1. **Run knowledge pipeline in detect mode.** Execute `harness knowledge-pipeline --domain <feature-domain>` to produce a differential gap report comparing extracted business rules against documented knowledge in `docs/knowledge/`.

   2. **If gaps exist and `--fix` is appropriate,** run `harness knowledge-pipeline --fix --domain <feature-domain>` to materialize `docs/knowledge/{domain}/*.md` files from extracted findings. This creates the knowledge baseline from PRDs before any tasks are written.

   3. **Cross-check uncertainties against materialized knowledge:**
      - Remove "assumptions" from the uncertainty list that are now documented facts in `docs/knowledge/`
      - Escalate if contradictions exist between PRDs and existing knowledge docs

   4. **Reference materialized knowledge in Phase 2 task decomposition.** Tasks should reference specific knowledge docs they implement. Observable truths should map back to documented business rules.
   ```

4. Commit: `docs(planning): add Phase 1.5 KNOWLEDGE BASELINE to planning skill`

### Task 2: Add knowledge gap signal to autopilot APPROVE_PLAN

**Depends on:** none | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Open `agents/skills/claude-code/harness-autopilot/SKILL.md`.

2. **Insert a new signal** in the APPROVE_PLAN signals list (line 95, after `- Task count > 15`). Add:

   ```markdown
   - Knowledge gaps: `harness knowledge-pipeline --domain <phase-domain>` reports `totalGaps > 0` and `--fix` was not run during planning
   ```

3. Commit: `docs(autopilot): add knowledge gap signal to APPROVE_PLAN`

### Task 3: Add knowledge health check and reconciliation to execution SKILL.md

**Depends on:** none | **Files:** `agents/skills/claude-code/harness-execution/SKILL.md`

1. Open `agents/skills/claude-code/harness-execution/SKILL.md`.

2. **Insert step 5b** in Phase 1 PREPARE, after step 5 "Verify prerequisites" (line 65, after `- Test suite passes? Run `harness validate` for clean baseline.`) and before step 6 "If prerequisites fail" (line 67). Add:

   ```markdown
   5b. **Knowledge health check.** If `docs/knowledge/` exists and the knowledge graph is available, run the knowledge pipeline in detect-only mode for domains touched by the current plan. If contradictions exist (severity: critical), treat as a blocker — knowledge must be reconciled before implementation. If gaps exist, surface as a warning but do not block execution.
   ```

3. **Insert knowledge reconciliation step** in Phase 4 PERSIST, after the "Graph Refresh" paragraph (line 239, after `**Graph Refresh:** If `.harness/graph/`exists, run`harness scan [path]` after code changes. Skipping causes stale graph query results.`) and before step 2 "Append tagged learnings" (line 241). Add:

   ```markdown
   1b. **Knowledge reconciliation.** After code changes committed and graph refreshed, run the knowledge pipeline in extract-only mode to stage any new business signals discovered in the code (validation rules, API contracts, test descriptions) for future materialization. This keeps the knowledge graph current with what was actually implemented. Skip if no `docs/knowledge/` directory exists.
   ```

4. Commit: `docs(execution): add knowledge health check and reconciliation steps`
