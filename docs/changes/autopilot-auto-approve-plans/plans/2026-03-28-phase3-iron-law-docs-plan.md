# Plan: Phase 3 — Update Iron Law Documentation

**Date:** 2026-03-28
**Spec:** docs/changes/autopilot-auto-approve-plans/proposal.md
**Estimated tasks:** 3
**Estimated time:** 10 minutes

## Goal

The Iron Law, Success Criteria, and Gates sections of the autopilot SKILL.md accurately describe the conditional auto-approve model instead of asserting mandatory human approval. The signal overlap between `highComplexity` and `complexityOverride` is resolved.

## Observable Truths (Acceptance Criteria)

1. The Iron Law section (line ~34) no longer says "Human always approves plans" unconditionally. It describes the conditional model: auto-approve when no signals fire, human review when signals fire, `--review-plans` forces review.
2. The Success Criteria section (line ~637) no longer says "Human approves every plan before execution begins." It describes that plans are auto-approved when no concern signals fire and paused for human review when signals fire.
3. The Gates section (line ~782) no longer says "Every plan must be explicitly approved by the human before execution begins. No exceptions, regardless of complexity level." It describes the conditional gate with auto-approve and the `--review-plans` override.
4. Signal #2 (`highComplexity`) in the APPROVE_PLAN signal table checks `phase.complexity === "high"` only -- no OR clause for `complexityOverride === "high"`.
5. The signal evaluation JSON schema uses consistent value types: `highComplexity` stores the actual complexity string (not boolean), matching the pattern of `complexityOverride`.

## File Map

- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` (Iron Law, signal table, signal JSON, Success Criteria, Gates)

## Tasks

### Task 1: Fix signal overlap and asymmetric types in APPROVE_PLAN

**Depends on:** none (Phase 2 already committed)
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

This task addresses the two "important" findings from the Phase 2 review: the signal overlap between #2 and #3, and the asymmetric value types in the signal JSON.

1. Open `agents/skills/claude-code/harness-autopilot/SKILL.md`.

2. In the signal table (line ~222), replace Signal #2's condition. Find:

   ```
   | 2   | `highComplexity`     | `phase.complexity === "high"` OR `phase.complexityOverride === "high"` | Phase is marked or overridden as high complexity                  |
   ```

   Replace with:

   ```
   | 2   | `highComplexity`     | `phase.complexity === "high"`                                          | Phase is marked as high complexity in the spec                    |
   ```

3. In the signal evaluation JSON (line ~229-237), replace the boolean `highComplexity` with a string value. Find:

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

   Replace with:

   ```json
   {
     "reviewPlans": false,
     "highComplexity": "low",
     "complexityOverride": null,
     "plannerConcerns": [],
     "taskCount": 8,
     "taskThreshold": 15
   }
   ```

4. In the auto-approve decision record JSON (line ~259), find:

   ```json
       "reviewPlans": false,
       "highComplexity": false,
   ```

   Replace with:

   ```json
       "reviewPlans": false,
       "highComplexity": "low",
   ```

5. In the pause decision record JSON (line ~299), find:

   ```json
       "reviewPlans": true,
       "highComplexity": false,
   ```

   Replace with:

   ```json
       "reviewPlans": true,
       "highComplexity": "low",
   ```

6. Verify: Signal #2 condition now says `phase.complexity === "high"` only. Signal #3 condition still says `phase.complexityOverride !== null`. The two signals are now distinct -- #2 fires only on spec-declared high complexity, #3 fires on any planner override.

7. Verify: All four `highComplexity` values in JSON blocks are strings (matching `complexityOverride`'s pattern of storing the actual value).

8. Commit: `fix(autopilot): resolve signal overlap and asymmetric types in APPROVE_PLAN`

### Task 2: Update Iron Law section

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Open `agents/skills/claude-code/harness-autopilot/SKILL.md`.

2. Find the Iron Law paragraph (line ~34):

   ```markdown
   **Human always approves plans.** No plan executes without explicit human sign-off, regardless of complexity level. The difference is whether autopilot generates the plan automatically or asks the human to drive planning interactively.
   ```

   Replace with:

   ```markdown
   **Plans are gated by concern signals.** When no concern signals fire (low complexity, no planner concerns, task count within threshold), plans are auto-approved with a structured report and execution proceeds immediately. When any signal fires, the plan pauses for human review with the standard yes/revise/skip/stop flow. The `--review-plans` session flag forces all plans to pause regardless of signals.
   ```

3. Verify: The Iron Law section now has three bold-prefixed laws: "Autopilot delegates, never reimplements," "Always use dedicated persona agents, never general-purpose agents," and "Plans are gated by concern signals."

4. Commit: `docs(autopilot): update Iron Law to reflect conditional plan approval`

### Task 3: Update Success Criteria and Gates sections

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Open `agents/skills/claude-code/harness-autopilot/SKILL.md`.

2. In the Success Criteria section (line ~637), find:

   ```markdown
   - Human approves every plan before execution begins
   ```

   Replace with:

   ```markdown
   - Plans auto-approve when no concern signals fire; plans pause for human review when any signal fires
   - `--review-plans` flag forces human review for all plans in a session
   ```

3. In the Gates section (line ~782), find:

   ```markdown
   - **No executing without plan approval.** Every plan must be explicitly approved by the human before execution begins. No exceptions, regardless of complexity level.
   ```

   Replace with:

   ```markdown
   - **No executing without plan approval.** Every plan passes through the APPROVE_PLAN gate. When no concern signals fire, the plan is auto-approved with a structured report. When any signal fires, the plan pauses for human review. The `--review-plans` flag forces all plans to pause. No plan reaches EXECUTE without passing this gate.
   ```

4. Verify: The Success Criteria bullet no longer says "Human approves every plan." The Gates bullet no longer says "No exceptions, regardless of complexity level."

5. Verify: Read through the full SKILL.md to confirm no other sentences assert unconditional mandatory human approval. The APPROVE_PLAN section (updated in Phase 2) should be the authoritative description; Iron Law, Success Criteria, and Gates should be consistent with it.

6. Commit: `docs(autopilot): update Success Criteria and Gates for conditional approval`
