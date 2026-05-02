# Plan: DONE State Update (Autopilot Final Review Gate -- Phase 3)

**Date:** 2026-03-28
**Spec:** docs/changes/autopilot-final-review-gate/proposal.md
**Estimated tasks:** 2
**Estimated time:** 6 minutes

## Goal

Update the DONE state section to surface final review results in the project summary and handoff, align per-phase REVIEW option labels with FINAL_REVIEW for consistency, and add FINAL_REVIEW to the example flow.

## Observable Truths (Acceptance Criteria)

1. The DONE section's "Present project summary" bullet list includes a bullet for final review status (`finalReview.status`: passed or overridden) and final review findings count.
2. The DONE section's handoff JSON template includes a `"finalReview"` field with `status` and `findingsCount` sub-fields.
3. No location in the file contains a direct PHASE_COMPLETE -> DONE transition (already clean from Phase 1 -- confirm only).
4. The per-phase REVIEW section's blocking findings prompt reads `(fix / override / stop)` instead of `(yes / override / stop)`, and the `fix` option description says "Re-enter EXECUTE with review fixes."
5. The "3-Phase Security Scanner" example includes a `**FINAL_REVIEW:**` block between the last phase completion and `**DONE:**`, showing the cross-phase review running.

## File Map

- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` -- 4 edits across DONE summary, DONE handoff JSON, REVIEW options, and example section

## Tasks

### Task 1: Update DONE project summary and handoff JSON

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Open `agents/skills/claude-code/harness-autopilot/SKILL.md`.

2. In the DONE section (line ~446), locate the "Present project summary" bullet list. Replace:

   ```markdown
   1. **Present project summary:**
      - Total phases completed
      - Total tasks across all phases
      - Total retries used
      - Total time (first phase start to last phase completion)
      - Any overridden review findings
   ```

   With:

   ```markdown
   1. **Present project summary:**
      - Total phases completed
      - Total tasks across all phases
      - Total retries used
      - Total time (first phase start to last phase completion)
      - Final review result: `finalReview.status` (passed / overridden) and total findings count from `finalReview.findings`
      - Any overridden review findings (per-phase and final)
   ```

3. In the same DONE section, locate the handoff JSON template (line ~459). Replace:

   ```json
   {
     "fromSkill": "harness-autopilot",
     "phase": "DONE",
     "summary": "Completed {N} phases with {M} total tasks",
     "completed": ["Phase 1: ...", "Phase 2: ..."],
     "pending": [],
     "concerns": [],
     "decisions": ["<all decisions from all phases>"],
     "contextKeywords": ["<merged from spec>"]
   }
   ```

   With:

   ```json
   {
     "fromSkill": "harness-autopilot",
     "phase": "DONE",
     "summary": "Completed {N} phases with {M} total tasks",
     "completed": ["Phase 1: ...", "Phase 2: ..."],
     "pending": [],
     "concerns": [],
     "decisions": ["<all decisions from all phases>"],
     "contextKeywords": ["<merged from spec>"],
     "finalReview": {
       "status": "<passed | overridden>",
       "findingsCount": "<number of findings from final review>"
     }
   }
   ```

4. Verify: no direct PHASE_COMPLETE -> DONE transition exists in the file. Search for any mention of transitioning from PHASE_COMPLETE to DONE. Phase 1 already updated PHASE_COMPLETE step 6 to route to FINAL_REVIEW -- confirm this is intact. If any stale reference is found, update it.

5. Commit: `feat(autopilot): add final review status to DONE summary and handoff`

### Task 2: Align REVIEW option label and update example

**Depends on:** none (parallel with Task 1)
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Open `agents/skills/claude-code/harness-autopilot/SKILL.md`.

2. In the REVIEW section (line ~332), locate:

   ```markdown
   - **Blocking findings:** Surface to user. Ask: "Address blocking findings before completing this phase? (yes / override / stop)"
     - **yes** — Re-enter EXECUTE with review fixes.
   ```

   Replace with:

   ```markdown
   - **Blocking findings:** Surface to user. Ask: "Address blocking findings before completing this phase? (fix / override / stop)"
     - **fix** — Re-enter EXECUTE with review fixes.
   ```

3. In the Examples section, locate the "3-Phase Security Scanner" example. Find the line (around line 604):

   ```markdown
   **Phase 3 — [auto-plans, executes, completes]**

   **DONE:**
   ```

   Replace with:

   ```markdown
   **Phase 3 — [auto-plans, executes, completes]**

   **FINAL_REVIEW:**
   ```

   [harness-code-reviewer runs cross-phase review on startingCommit..HEAD]
   Final review: 0 blocking, 1 warning. Passed.

   ```

   **DONE:**
   ```

   (Note: the example DONE block already exists and stays as-is.)

4. Commit: `feat(autopilot): align REVIEW options to fix/override/stop and add FINAL_REVIEW to example`
