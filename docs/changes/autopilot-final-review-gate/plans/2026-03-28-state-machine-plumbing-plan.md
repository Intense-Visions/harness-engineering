# Plan: State Machine Plumbing (Autopilot Final Review Gate — Phase 1)

**Date:** 2026-03-28
**Spec:** docs/changes/autopilot-final-review-gate/proposal.md
**Estimated tasks:** 3
**Estimated time:** 9 minutes

## Goal

Add `startingCommit` capture at INIT and a `FINAL_REVIEW` state stub to the autopilot SKILL.md, updating the state diagram and transitions so Phase 2 can implement the review logic.

## Observable Truths (Acceptance Criteria)

1. The INIT section's `autopilot-state.json` schema (the JSON code block in step 4) includes a `"startingCommit"` field set to `null` on fresh start.
2. When autopilot enters INIT on a fresh start, step 4 includes a sub-step to capture `git rev-parse HEAD` and store the result as `startingCommit` in `autopilot-state.json`.
3. The ASCII state diagram shows: `PHASE_COMPLETE` transitions to `ASSESS` (next phase exists) or `FINAL_REVIEW` (no more phases), and `FINAL_REVIEW` transitions to `DONE`.
4. A `### FINAL_REVIEW — Project-Wide Code Review` section exists between the `PHASE_COMPLETE` and `DONE` sections, containing a stub note that behavior is defined in Phase 2.
5. The PHASE_COMPLETE section step 6 ("Check for next phase") says "Transition to FINAL_REVIEW" instead of "Transition to DONE" when no more phases remain.

## File Map

- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` — 5 edits across INIT, state diagram, PHASE_COMPLETE, and new FINAL_REVIEW stub

## Tasks

### Task 1: Add startingCommit to INIT section

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. In the INIT section step 4 ("If no existing state (fresh start)"), add a sub-step after parsing phases and before creating the JSON:
   - After the bullet "Complexity annotation..." and before "Create `{sessionDir}/autopilot-state.json`:", insert:
     ```
     - Capture the starting commit: run `git rev-parse HEAD` and store the result as `startingCommit`.
     ```

2. In the same step 4, update the `autopilot-state.json` JSON schema to include `startingCommit`. Add it after the `"specPath"` line:

   Before:

   ```json
   "specPath": "<path to spec>",
   "currentState": "ASSESS",
   ```

   After:

   ```json
   "specPath": "<path to spec>",
   "startingCommit": "<git rev-parse HEAD output>",
   "currentState": "ASSESS",
   ```

3. Verify: read the modified section and confirm both the prose step and the JSON field are present.
4. Commit: `feat(autopilot): add startingCommit capture to INIT section of SKILL.md`

### Task 2: Update state diagram and PHASE_COMPLETE transition

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Replace the ASCII state diagram (lines 40-46) with:

   Before:

   ```
   INIT → ASSESS → PLAN → APPROVE_PLAN → EXECUTE → VERIFY → REVIEW → PHASE_COMPLETE
                                                                            ↓
                                                                      [next phase?]
                                                                       ↓         ↓
                                                                    ASSESS      DONE
   ```

   After:

   ```
   INIT → ASSESS → PLAN → APPROVE_PLAN → EXECUTE → VERIFY → REVIEW → PHASE_COMPLETE
                                                                            ↓
                                                                      [next phase?]
                                                                       ↓         ↓
                                                                    ASSESS   FINAL_REVIEW → DONE
   ```

2. In the PHASE_COMPLETE section step 6 ("Check for next phase"), change:

   Before:

   ```
   - If no more phases: Transition to DONE.
   ```

   After:

   ```
   - If no more phases: Transition to FINAL_REVIEW.
   ```

3. Verify: read both the diagram and the PHASE_COMPLETE section to confirm the transitions are correct.
4. Commit: `feat(autopilot): route last phase through FINAL_REVIEW before DONE`

### Task 3: Add FINAL_REVIEW stub section

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Insert a new section between the PHASE_COMPLETE `---` divider and the `### DONE` heading. The exact insertion point is after line 384 (`---`) and before line 386 (`### DONE — Final Summary`).

   Insert:

   ```markdown
   ### FINAL_REVIEW — Project-Wide Code Review

   > Runs automatically after the last phase completes. Reviews the cumulative diff (`startingCommit..HEAD`) across all phases to catch cross-phase issues before the PR offer.

   **Behavior:** Defined in Phase 2 of the autopilot-final-review-gate spec. This state dispatches `harness-code-reviewer` with the full diff range and per-phase findings as context. Blocking findings gate the transition to DONE.

   **Transitions:**

   - No blocking findings (or overridden) → DONE
   - Blocking findings with fix → re-run FINAL_REVIEW (retry budget: 3)
   - User stops → save state and exit (resumable)

   ---
   ```

2. Verify: read the area around PHASE_COMPLETE and DONE to confirm the new section is correctly placed.
3. Commit: `feat(autopilot): add FINAL_REVIEW stub section to SKILL.md`

## Traceability

| Observable Truth                              | Delivered By |
| --------------------------------------------- | ------------ |
| 1. JSON schema includes startingCommit        | Task 1       |
| 2. INIT step captures git rev-parse HEAD      | Task 1       |
| 3. State diagram shows FINAL_REVIEW           | Task 2       |
| 4. FINAL_REVIEW stub section exists           | Task 3       |
| 5. PHASE_COMPLETE transitions to FINAL_REVIEW | Task 2       |
