# Plan: Phase 2 — Pause Signal Evaluation

**Date:** 2026-03-28
**Spec:** docs/changes/autopilot-auto-approve-plans/proposal.md
**Estimated tasks:** 2
**Estimated time:** 8 minutes

## Goal

The APPROVE_PLAN phase conditionally auto-approves plans when no concern signals are detected, pauses for human review when any signal fires, emits a structured report in both cases, and records the decision with full signal details.

## Observable Truths (Acceptance Criteria)

1. The APPROVE_PLAN section heading in SKILL.md no longer says "This state always pauses for human input" — it says "Conditional Review Gate" instead of "Human Review Gate".
2. SKILL.md contains a `shouldPauseForReview` evaluation that checks exactly 5 signals: `state.reviewPlans`, high complexity, complexity override, planner concerns, and task count > 15.
3. When all signals are false, SKILL.md instructs the autopilot to emit an auto-approve report (showing signal evaluation), record an `auto_approved_plan` decision with a `signals` object, and transition directly to EXECUTE without pausing.
4. When any signal is true, SKILL.md instructs the autopilot to emit a pause report (showing which signals triggered), then continue with the existing yes/revise/skip/stop human interaction flow.
5. The decision record format in both paths includes a `signals` object with keys: `reviewPlans`, `highComplexity`, `complexityOverride`, `plannerConcerns`, `taskCount`, `taskThreshold`.
6. The existing yes/revise/skip phase/stop flow is preserved verbatim in the pause path.
7. The example in the Examples section (Phase 1 — APPROVE_PLAN) is updated to show the auto-approve report format.

## File Map

- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` (APPROVE_PLAN section replacement, example update)

## Tasks

### Task 1: Replace APPROVE_PLAN section with conditional logic

**Depends on:** none (Phase 1 already committed)
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

This task replaces the entire APPROVE_PLAN section (lines 207-228) with the new conditional gate logic.

1. Open `agents/skills/claude-code/harness-autopilot/SKILL.md`.

2. Replace the entire APPROVE_PLAN section. Find the text from `### APPROVE_PLAN — Human Review Gate` through the `---` separator before `### EXECUTE`. Replace it with:

   ````markdown
   ### APPROVE_PLAN — Conditional Review Gate

   1. **Gather plan metadata:**
      - Phase name and number
      - Task count (from the plan file)
      - Checkpoint count
      - Estimated time (task count x 3 minutes)
      - Effective complexity (original + any override)
      - Concerns array from the planning handoff (`{sessionDir}/handoff.json` field `concerns`)

   2. **Evaluate `shouldPauseForReview`.** Check the following signals in order. If **any** signal is true, pause for human review. If **all** are false, auto-approve.

      | #   | Signal               | Condition                                                              | Description                                                       |
      | --- | -------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
      | 1   | `reviewPlans`        | `state.reviewPlans === true`                                           | Session-level flag set by `--review-plans` CLI arg                |
      | 2   | `highComplexity`     | `phase.complexity === "high"` OR `phase.complexityOverride === "high"` | Phase is marked or overridden as high complexity                  |
      | 3   | `complexityOverride` | `phase.complexityOverride !== null`                                    | Planner produced more tasks than expected for the spec complexity |
      | 4   | `plannerConcerns`    | Handoff `concerns` array is non-empty                                  | Planner flagged specific risks or uncertainties                   |
      | 5   | `taskCount`          | Plan contains > 15 tasks                                               | Plan is large enough to warrant human review                      |

   3. **Build the signal evaluation result** for reporting and recording:

      ```json
      {
        "reviewPlans": false,
        "highComplexity": false,
        "complexityOverride": null,
        "plannerConcerns": [],
        "taskCount": 8,
        "taskThreshold": 15
      }
      ```
   ````

   4. **If auto-approving (no signals fired):**

      a. **Emit structured auto-approve report:**

      ```
      Auto-approved Phase 1: Setup Infrastructure
        Review mode: auto
        Complexity: low (no override)
        Planner concerns: none
        Tasks: 8 (threshold: 15)
      ```

      b. **Record the decision** in state `decisions` array:

      ```json
      {
        "phase": 0,
        "decision": "auto_approved_plan",
        "timestamp": "ISO-8601",
        "signals": {
          "reviewPlans": false,
          "highComplexity": false,
          "complexityOverride": null,
          "plannerConcerns": [],
          "taskCount": 8,
          "taskThreshold": 15
        }
      }
      ```

      c. **Transition to EXECUTE** — no human interaction needed.

   5. **If pausing for review (one or more signals fired):**

      a. **Emit structured pause report** showing which signal(s) triggered:

      ```
      Pausing for review -- Phase 2: Auth Middleware
        Review mode: manual (--review-plans flag set)
        Complexity override: low -> medium (triggered)
        Planner concerns: 2 concern(s)
        Tasks: 12 (threshold: 15)
      ```

      Mark triggered signals explicitly. Non-triggered signals display their normal value without "(triggered)".

      b. **Present the plan summary:** task count, checkpoint count, estimated time, effective complexity, and any concerns from the planning handoff.

      c. **Ask:** "Approve this plan and begin execution? (yes / revise / skip phase / stop)"
      - **yes** — Transition to EXECUTE.
      - **revise** — Tell user to edit the plan file directly, then re-present from step 1.
      - **skip phase** — Mark phase as `skipped` in state, transition to PHASE_COMPLETE.
      - **stop** — Save state and exit. User can resume later.

      d. **Record the decision** in state `decisions` array:

      ```json
      {
        "phase": 0,
        "decision": "approved_plan",
        "timestamp": "ISO-8601",
        "signals": {
          "reviewPlans": true,
          "highComplexity": false,
          "complexityOverride": "medium",
          "plannerConcerns": ["concern text"],
          "taskCount": 12,
          "taskThreshold": 15
        }
      }
      ```

      Use the actual decision value: `approved_plan`, `revised_plan`, `skipped_phase`, or `stopped`.

   6. **Update state** with `currentState: "EXECUTE"` (or appropriate state for skip/stop) and save.

   ```

   ```

3. Verify the edit is clean: the section starts with `### APPROVE_PLAN — Conditional Review Gate` and ends with `---` before `### EXECUTE — Run the Plan`.

4. Run: `npx turbo run build lint test` to confirm nothing breaks.

5. Commit: `feat(autopilot): replace APPROVE_PLAN mandatory pause with conditional signal-based gate`

### Task 2: Update the APPROVE_PLAN example to show auto-approve flow

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

This task updates the example in the Examples section to show the new auto-approve report format instead of the old mandatory pause.

1. Open `agents/skills/claude-code/harness-autopilot/SKILL.md`.

2. Find the Phase 1 APPROVE_PLAN example block (around line 584-589). The current text is:

   ```markdown
   **Phase 1 — APPROVE_PLAN:**
   ```

   Phase 1: Core Scanner
   Tasks: 8 | Checkpoints: 1 | Est. time: 24 min | Complexity: low
   Approve this plan and begin execution? (yes / revise / skip / stop)
   → User: "yes"

   ```

   ```

3. Replace it with:

   ```markdown
   **Phase 1 — APPROVE_PLAN:**
   ```

   Auto-approved Phase 1: Core Scanner
   Review mode: auto
   Complexity: low (no override)
   Planner concerns: none
   Tasks: 8 (threshold: 15)

   ```

   ```

   This shows the auto-approve path since the example phase is low complexity with no concerns.

4. Run: `npx turbo run build lint test` to confirm nothing breaks.

5. Commit: `feat(autopilot): update APPROVE_PLAN example to show auto-approve report`

## Traceability

| Observable Truth                              | Delivered By                  |
| --------------------------------------------- | ----------------------------- |
| 1. Section heading updated                    | Task 1, step 2                |
| 2. shouldPauseForReview with 5 signals        | Task 1, step 2 (signal table) |
| 3. Auto-approve path with report and decision | Task 1, step 2 (step 4a-4c)   |
| 4. Pause path with triggered signals          | Task 1, step 2 (step 5a-5d)   |
| 5. Decision record format with signals object | Task 1, step 2 (steps 4b, 5d) |
| 6. Existing yes/revise/skip/stop preserved    | Task 1, step 2 (step 5c)      |
| 7. Example updated                            | Task 2                        |
