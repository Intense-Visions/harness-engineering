# Autopilot Final Review Gate

**Keywords:** autopilot, code-review, final-review, state-machine, cross-phase, diff-scope

## Overview

Add a `FINAL_REVIEW` state to the autopilot state machine that runs a project-wide code review after all phases complete and before PR creation is offered. This catches cross-phase issues (inconsistent naming, duplicated utilities, architectural drift) and cumulative scope concerns that per-phase reviews miss.

### Goals

1. Every autopilot session gets a holistic code review of all cumulative changes before the PR offer
2. The review is informed by per-phase findings but evaluates independently
3. Blocking findings must be addressed or explicitly overridden before proceeding to DONE
4. The review scope is precisely the changes autopilot made, tracked via a starting commit hash

### Non-Goals

- Changing per-phase review behavior
- Making the final review optional or configurable (it always runs)
- Generalizing to a post-completion pipeline (YAGNI)

## Decisions

| Decision               | Choice                                            | Rationale                                                                                           |
| ---------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| When to run            | Always automatic                                  | User always runs it manually today; automating removes a manual step                                |
| Position in flow       | Gates PR creation                                 | Review should pass before a PR exists, matching current manual workflow                             |
| Context strategy       | Hybrid — informed but independent                 | Avoids re-flagging resolved issues while not blindly trusting prior reviews                         |
| Diff scope             | Record starting commit at INIT, diff against that | Precise scope of exactly what autopilot changed, regardless of branch state                         |
| Implementation pattern | New FINAL_REVIEW state                            | Follows established state machine pattern; single-responsibility, resumable, visible in state files |

## Technical Design

### State Machine Change

Current flow:

```
... → PHASE_COMPLETE (last phase) → DONE
```

New flow:

```
... → PHASE_COMPLETE (last phase) → FINAL_REVIEW → DONE
```

### INIT Change — Record Starting Commit

When autopilot enters INIT, capture `git rev-parse HEAD` and store as `startingCommit` in `autopilot-state.json`. This is read later by FINAL_REVIEW to scope the diff.

### FINAL_REVIEW State Behavior

1. **Compute diff range:** `startingCommit..HEAD`
2. **Gather per-phase review findings:** Read from session directory — each phase's review output is already stored at `.harness/sessions/<slug>/`
3. **Dispatch `harness-code-reviewer`** with:
   - The full diff range (`startingCommit..HEAD`)
   - Per-phase findings as context with instruction: "These were found and addressed during per-phase reviews. Don't assume they're resolved — verify. Focus extra attention on cross-phase coherence: naming consistency, duplicated utilities, architectural drift across phases."
   - Session context via `gather_context`
4. **Handle findings** (same pattern as per-phase REVIEW state):
   - No blocking findings → transition to DONE
   - Blocking findings → surface to user with options: `fix` / `override` / `stop`
   - If `fix`: dispatch fixes, re-run review (same retry budget as per-phase: 3 attempts)
   - If `override`: record override in decisions, transition to DONE
   - If `stop`: halt, write handoff for resumption

### autopilot-state.json Additions

```json
{
  "startingCommit": "abc123...",
  "currentState": "FINAL_REVIEW",
  "finalReview": {
    "status": "in_progress | passed | overridden",
    "findings": [],
    "retryCount": 0
  }
}
```

### Files Touched

- `agents/skills/claude-code/harness-autopilot/SKILL.md` — Add FINAL_REVIEW state documentation, update state diagram, update DONE state description
- `agents/skills/claude-code/harness-autopilot/skill.yaml` — Add `final_review` phase if phases are enumerated

No new files needed. This extends existing infrastructure only.

## Success Criteria

1. When autopilot completes all phases, FINAL_REVIEW runs automatically — no user prompt to trigger it
2. The review diff covers exactly `startingCommit..HEAD` — no more, no less
3. Per-phase findings are passed as context to the final reviewer
4. The final reviewer can identify cross-phase issues — e.g., inconsistent naming between phase 1 and phase 3 code
5. Blocking findings gate the PR offer — DONE is not reached until findings are clean or overridden
6. Override is recorded — if the user overrides blocking findings, the decision and rationale are captured in `autopilot-state.json` and the final handoff
7. Resumable after context reset — if the session is interrupted during FINAL_REVIEW, resuming restores the state and continues (same as any other state)
8. Retry budget applies — max 3 fix attempts before escalating to user, consistent with per-phase behavior

## Implementation Order

1. **Phase 1 — State machine plumbing:** Add `startingCommit` capture at INIT, add FINAL_REVIEW state and its transitions in SKILL.md, update the state diagram
2. **Phase 2 — FINAL_REVIEW logic:** Implement the dispatch to `harness-code-reviewer` with full diff range and per-phase findings context, handle findings outcomes (pass/fix/override/stop)
3. **Phase 3 — DONE state update:** Adjust DONE to only be reachable from FINAL_REVIEW (not directly from PHASE_COMPLETE), include final review status in the project summary and handoff
