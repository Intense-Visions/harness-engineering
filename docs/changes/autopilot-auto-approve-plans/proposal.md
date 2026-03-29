# Autopilot Auto-Approve Plans

**Keywords:** autopilot, plan-approval, auto-approve, gating, concern-signals, review-mode

## Overview

Change the autopilot APPROVE_PLAN gate from a mandatory human pause to a conditional gate that auto-approves plans when no concern signals are detected. When concerns are present, the gate pauses for human review as it does today. A `--review-plans` session flag forces all plans to pause.

### Goals

1. Reduce friction in the autopilot happy path by eliminating unnecessary pauses on straightforward plans
2. Preserve safety by pausing when concrete signals indicate a plan needs human attention
3. Provide transparency via a structured auto-approve report showing which signals were evaluated
4. Allow users to opt into full review mode per-session when desired

### Non-goals

- Changing verification, review, or checkpoint gates
- Adding auto-approve behavior to any gate other than APPROVE_PLAN
- Making the task count threshold configurable (hardcoded at 15 for now)

## Decisions

| Decision             | Choice                                           | Rationale                                                                     |
| -------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| Gating strategy      | Concern-based auto-approve                       | Balances speed with safety — only pauses when there's an actual signal        |
| Pause signals        | Existing signals + task threshold + session flag | Covers smart gating, size gating, and manual override without complexity      |
| Task count threshold | 15 tasks, universal                              | Single number, easy to reason about; separate from complexity override logic  |
| Default behavior     | Auto-approve ON for all sessions                 | Reduces friction by default; `--review-plans` flag for when control is needed |
| Transparency         | Structured auto-approve report                   | Near-zero cost, makes gating decisions legible and auditable                  |

## Technical Design

### Pause signal evaluation

A `shouldPauseForReview` check is added to the APPROVE_PLAN phase. It evaluates these signals in order:

1. **Session flag:** `state.reviewPlans === true` (set by `--review-plans` CLI arg)
2. **High complexity:** `phase.complexity === "high"` or `phase.complexityOverride === "high"`
3. **Complexity override triggered:** `phase.complexityOverride !== null` (planner produced more tasks than expected)
4. **Planner concerns:** Handoff JSON contains non-empty `concerns` array
5. **Task count:** Plan contains >15 tasks

If **any** signal is true, pause for human review (existing APPROVE_PLAN flow).
If **all** signals are false, auto-approve with structured report.

### Auto-approve report

Emitted to the conversation and recorded in `state.decisions`:

```
Auto-approved Phase 1: Setup Infrastructure
  Review mode: auto
  Complexity: low (no override)
  Planner concerns: none
  Tasks: 8 (threshold: 15)
```

When pausing, the report shows which signal(s) triggered it:

```
Pausing for review -- Phase 2: Auth Middleware
  Complexity override: low -> medium (triggered)
  Planner concerns: none
  Tasks: 12 (threshold: 15)
```

### Decision record

Both auto-approve and human-approve are recorded in `state.decisions`:

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

### CLI arg addition

`skill.yaml` gains a new arg:

```yaml
args:
  - name: spec
    description: Path to approved spec document
    required: false
  - name: review-plans
    description: Force human review of all plans (overrides auto-approve)
    required: false
```

Parsed during INIT: if present, set `state.reviewPlans: true`.

### State schema change

Add `reviewPlans: boolean` (default: `false`) to the autopilot state. No schema version bump needed — backward-compatible addition with a safe default. Existing sessions without the field behave as auto-approve (the new default).

### Files modified

- `agents/skills/claude-code/harness-autopilot/SKILL.md` — APPROVE_PLAN phase logic, INIT phase (flag parsing), state schema docs
- `agents/skills/claude-code/harness-autopilot/skill.yaml` — new CLI arg

## Success Criteria

1. When no concern signals fire, autopilot transitions from PLAN to EXECUTE without pausing, and a structured auto-approve report is printed
2. When any concern signal fires, autopilot pauses at APPROVE_PLAN with the existing yes/revise/skip/stop flow, and the report shows which signal(s) triggered the pause
3. `--review-plans` flag forces all plans to pause for the entire session, regardless of signals
4. Resuming a session preserves the `reviewPlans` setting from when the session was started
5. Decision records distinguish `auto_approved_plan` from `approved_plan` in `state.decisions`, with full signal details
6. Existing behavior is preserved for all other gates (verification failures, review findings, checkpoints, phase-complete continuation)

## Implementation Order

### Phase 1: State and Flag Plumbing

<!-- complexity: low -->

Add `reviewPlans` to state schema, add `--review-plans` CLI arg to skill.yaml, parse flag during INIT.

### Phase 2: Pause Signal Evaluation

<!-- complexity: low -->

Implement `shouldPauseForReview` logic in APPROVE_PLAN phase, emit structured report, record decision with signal details.

### Phase 3: Update Iron Law Documentation

<!-- complexity: low -->

Revise the "Human always approves plans" iron law to reflect conditional behavior, update examples and gate descriptions.
