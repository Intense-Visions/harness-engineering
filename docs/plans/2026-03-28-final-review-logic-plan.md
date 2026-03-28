# Plan: FINAL_REVIEW Logic (Phase 2)

**Date:** 2026-03-28
**Spec:** docs/changes/autopilot-final-review-gate/proposal.md
**Estimated tasks:** 2
**Estimated time:** 6 minutes

## Goal

Replace the FINAL_REVIEW stub in SKILL.md with full behavior: dispatch `harness-code-reviewer` with cumulative diff range and per-phase findings context, handle findings outcomes, and track `finalReview` state in `autopilot-state.json`.

## Observable Truths (Acceptance Criteria)

1. When the FINAL_REVIEW state is entered, the SKILL.md instructions dispatch `harness-code-reviewer` with diff scope `startingCommit..HEAD` (not per-phase diff).
2. The dispatch prompt includes instructions to gather per-phase review findings from the session directory and pass them as context.
3. The dispatch prompt includes the exact hybrid context instruction: "These were found and addressed during per-phase reviews. Don't assume they're resolved -- verify. Focus extra attention on cross-phase coherence: naming consistency, duplicated utilities, architectural drift across phases."
4. When the reviewer returns no blocking findings, the system shall transition to DONE.
5. When the reviewer returns blocking findings, the system shall surface them with options: fix / override / stop.
6. If fix is chosen, the system shall re-dispatch the reviewer (up to 3 retry attempts) before escalating to the user.
7. If override is chosen, the system shall record the override decision and transition to DONE.
8. The `autopilot-state.json` schema in INIT includes a `finalReview` field with `status`, `findings`, and `retryCount` sub-fields.
9. The FINAL_REVIEW section updates `finalReview` tracking in `autopilot-state.json` at each step.

## File Map

- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` (INIT schema: add `finalReview` field)
- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` (FINAL_REVIEW section: replace stub with full behavior)

## Tasks

### Task 1: Add `finalReview` field to autopilot-state.json schema in INIT

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Open `agents/skills/claude-code/harness-autopilot/SKILL.md`.
2. Locate the `autopilot-state.json` schema in the INIT section (lines ~75-98).
3. Add the `finalReview` field after the `history` field (before the closing `}`), so the schema becomes:

   Replace:

   ```json
         "history": []
       }
   ```

   With:

   ```json
         "history": [],
         "finalReview": {
           "status": "pending",
           "findings": [],
           "retryCount": 0
         }
       }
   ```

4. Verify the JSON block is well-formed (opening/closing braces match).
5. Commit: `feat(autopilot): add finalReview field to autopilot-state.json schema`

### Task 2: Replace FINAL_REVIEW stub with full behavior

**Depends on:** none (edits a different section of the same file)
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1.  Open `agents/skills/claude-code/harness-autopilot/SKILL.md`.
2.  Locate the FINAL_REVIEW section (lines ~388-401).
3.  Replace the entire content between `### FINAL_REVIEW — Project-Wide Code Review` and the `---` separator before `### DONE` with the following:

    ```markdown
    ### FINAL_REVIEW — Project-Wide Code Review

    > Runs automatically after the last phase completes. Reviews the cumulative diff (`startingCommit..HEAD`) across all phases to catch cross-phase issues before the PR offer.

    1. **Update state** with `currentState: "FINAL_REVIEW"` and save.

    2. **Update `finalReview` tracking** in `autopilot-state.json`: set `finalReview.status` to `"in_progress"`.

    3. **Gather per-phase review findings.** Read from `{sessionDir}/` — each phase's review output is stored alongside the phase handoff. Collect all review findings across phases into a single context block.

    4. **Dispatch review agent using the Agent tool:**
    ```

    Agent tool parameters:
    subagent_type: "harness-code-reviewer"
    description: "Final review: cross-phase coherence check"
    prompt: |
    You are running harness-code-review as a final project-wide review.

           Diff scope: startingCommit..HEAD (use `git diff {startingCommit}..HEAD`)
           Starting commit: {startingCommit}
           Session directory: {sessionDir}
           Session slug: {sessionSlug}

           On startup, call gather_context({ session: "{sessionSlug}" }) to load
           session-scoped learnings, state, and validation context.

           ## Per-Phase Review Findings

           {collected per-phase findings}

           These were found and addressed during per-phase reviews. Don't assume
           they're resolved — verify. Focus extra attention on cross-phase coherence:
           naming consistency, duplicated utilities, architectural drift across phases.

           Review the FULL diff (startingCommit..HEAD), not just the last phase.
           Report findings with severity (blocking / warning / note).

    ```

    5. **When the agent returns:**
    - **No blocking findings:** Update `finalReview.status` to `"passed"`, report summary, transition to DONE.
    - **Blocking findings:** Store findings in `finalReview.findings`. Surface to user. Ask: "Address blocking findings before completing? (fix / override / stop)"
      - **fix** — Increment `finalReview.retryCount`. If `retryCount < 3`: dispatch fixes via `harness-task-executor`, then re-run FINAL_REVIEW from step 4. If `retryCount >= 3`: stop — present all attempts to user, record in `.harness/failures.md`, ask: "How should we proceed? (fix manually and continue / stop)"
      - **override** — Record override decision (rationale from user) in state `decisions` array. Update `finalReview.status` to `"overridden"`. Transition to DONE.
      - **stop** — Save state and exit. Resumable from FINAL_REVIEW.

    6. **Update state** and save after each step.
    ```

4.  Verify:
    - The section starts with `### FINAL_REVIEW` and ends before `---` / `### DONE`.
    - The dispatch block uses `startingCommit..HEAD` (not per-phase diff).
    - The hybrid context instruction appears verbatim.
    - Fix/override/stop options are present with correct transitions.
    - Retry budget of 3 is documented.
    - `finalReview` tracking updates are present at each decision point.
5.  Commit: `feat(autopilot): implement FINAL_REVIEW dispatch and findings handling`
