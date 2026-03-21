# Autopilot: Autonomous Phase Execution Loop

> Single-invocation orchestration that chains planning, execution, verification, and review across multi-phase projects, pausing only at human decision points.

**Date:** 2026-03-19
**Status:** Proposed
**Keywords:** autopilot, orchestration, phase-loop, state-machine, adaptive-complexity, retry-budget

## Overview

Multi-phase plans require users to manually invoke 4-5 skills per phase, remember validation commands between tasks, and manage transitions between phases. For a 3-phase project, that's ~15 manual invocations with no orchestration.

`/harness:autopilot` is a new skill that reduces this to a single invocation. The user provides a spec reference, and the loop executes all phases through to completion — autonomous within phases, interactive between phases.

### Goals

1. Reduce manual invocations for a multi-phase project to one: `/harness:autopilot`
2. Maintain human oversight at meaningful decision points (plan approval, complex phase design, unrecoverable failures)
3. Preserve the quality of existing skills — autopilot delegates, never reimplements
4. Enable resume from any point after context reset, terminal close, or user choice to pause

### Non-Goals

- Automating brainstorming (design quality requires human thought)
- Replacing individual skills (they remain independently usable)
- Parallel phase execution (sequential phases with optional parallel tasks within a phase)
- CI/headless mode (this is a conversational skill)

## Decisions

| #   | Decision                                                   | Rationale                                                                                                                                                                |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Plan-to-done scope with multi-phase awareness**          | Brainstorming is inherently interactive and shouldn't be automated. The pain is post-approval tedium. The loop checks for next phases and prompts the user between them. |
| 2   | **Adaptive phase transitions based on complexity**         | Low-complexity phases auto-plan and present for approval. High-complexity phases pause for interactive planning. Balances automation with design quality.                |
| 3   | **Complexity metadata in spec, with planning override**    | Human judgment at spec time is the primary signal. Planning skill can bump complexity upward if task count/checkpoint density disagrees. Never bumps downward.           |
| 4   | **Retry with budget (3 attempts, escalating context)**     | Matches developer behavior — try the obvious fix, gather more context, try again, then ask for help. Avoids both over-interrupting and spinning on unfixable issues.     |
| 5   | **New standalone skill, conversation-based**               | Checkpoints map naturally to conversation turns. State persistence handles session breaks. Existing skills remain untouched.                                             |
| 6   | **Named `/harness:autopilot`**                             | Clear intent. Distinguishes from manual skill invocation. No overloading of existing skills.                                                                             |
| 7   | **Hybrid approach — skill with lightweight state machine** | Explicit transitions without framework overhead. State file enables resume. Easy to evolve. Extract to workflow runner later if more consumers emerge.                   |

## Technical Design

### State Machine

```
INIT → ASSESS → PLAN → APPROVE_PLAN → EXECUTE → VERIFY → REVIEW → PHASE_COMPLETE
                                                                         ↓
                                                                   [next phase?]
                                                                    ↓         ↓
                                                                 ASSESS      DONE
```

#### States

| State            | Action                                                                                                                  | Pauses for human?                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `INIT`           | Read spec, identify phases, load existing state if resuming                                                             | No                                    |
| `ASSESS`         | Read phase complexity from spec. If planning override applies, bump up. Decide auto-plan vs interactive.                | No                                    |
| `PLAN`           | Low/medium: auto-invoke `harness-planning` via subagent, present result. High: tell user to run planning interactively. | **High complexity: yes**              |
| `APPROVE_PLAN`   | Present plan summary, ask for approval.                                                                                 | **Always yes**                        |
| `EXECUTE`        | Dispatch `harness-execution` via subagent. On failure: decrement retry budget, gather context, retry or escalate.       | **On checkpoint or budget exhausted** |
| `VERIFY`         | Run `harness-verification` via subagent. Surface results.                                                               | **On failure**                        |
| `REVIEW`         | Run `harness-code-review` via subagent. Surface findings.                                                               | **If blocking findings**              |
| `PHASE_COMPLETE` | Summarize phase results. Check for next phase. Ask user to continue or stop.                                            | **Always yes**                        |
| `DONE`           | Final summary across all phases. Offer to create PR.                                                                    | **Yes (PR confirmation)**             |

### State File: `.harness/autopilot-state.json`

```json
{
  "schemaVersion": 1,
  "specPath": "docs/changes/feature-x/proposal.md",
  "currentState": "EXECUTE",
  "currentPhase": 1,
  "phases": [
    {
      "name": "core-scanner",
      "complexity": "low",
      "complexityOverride": null,
      "planPath": "docs/plans/2026-03-19-core-scanner.md",
      "status": "complete"
    },
    {
      "name": "rule-engine",
      "complexity": "high",
      "complexityOverride": null,
      "planPath": null,
      "status": "in-progress"
    }
  ],
  "retryBudget": {
    "maxAttempts": 3,
    "currentTask": {
      "name": "Task 4: wire parser",
      "attemptsUsed": 1,
      "attempts": [
        {
          "timestamp": "2026-03-19T14:30:00Z",
          "error": "Type error in parser.ts:42",
          "fix": "Added missing generic parameter",
          "result": "failed"
        }
      ]
    }
  },
  "history": [
    {
      "phase": 0,
      "startedAt": "2026-03-19T10:00:00Z",
      "completedAt": "2026-03-19T12:30:00Z",
      "tasksCompleted": 8,
      "retriesUsed": 1
    }
  ]
}
```

### Complexity Assessment Logic

```
spec_complexity = read from spec frontmatter (default: "medium")

if planning produces a plan:
  task_count = number of tasks
  checkpoint_count = number of [checkpoint:*] markers
  cross_system = tasks touching 3+ top-level directories

  if spec_complexity == "low" AND (task_count > 10 OR checkpoint_count > 3 OR cross_system):
    effective_complexity = "medium"  # override upward
  elif spec_complexity == "low" AND (task_count > 20 OR checkpoint_count > 6):
    effective_complexity = "high"    # override upward
  else:
    effective_complexity = spec_complexity

# Never override downward
```

### Retry Escalation

| Attempt   | Strategy                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| 1         | Read error output, apply obvious fix, re-validate                                                                  |
| 2         | Expand context — read related files, check learnings.md for similar failures, try alternative fix                  |
| 3         | Full context gather — read test output, check imports, review the plan's instructions for ambiguity, try once more |
| Exhausted | Stop. Surface all 3 attempts with full context. Ask human for guidance. Record in `.harness/failures.md`.          |

### Subagent Delegation

The skill dispatches execution-heavy work to subagents to keep the main conversation context lean:

- **Planning subagent:** Runs `harness-planning` with spec + handoff context. Returns plan document.
- **Execution subagent:** Runs `harness-execution` with plan + state. Returns updated state + completion status.
- **Verification subagent:** Runs `harness-verification`. Returns pass/fail + findings.
- **Review subagent:** Runs `harness-code-review`. Returns findings list.

Main conversation handles: state machine transitions, human interaction, decision tracking.

### Spec Frontmatter Addition

Specs gain an optional `phases` block using HTML comments for complexity annotations:

```markdown
## Implementation Order

### Phase 1: Core Scanner

<!-- complexity: low -->

Build the file walker and pattern matcher.

### Phase 2: Rule Engine

<!-- complexity: high -->

Design the rule DSL and evaluation pipeline.

### Phase 3: CLI Integration

<!-- complexity: low -->

Wire scanner into harness CLI commands.
```

The `<!-- complexity: X -->` HTML comment is parsed by autopilot but invisible when rendered. Defaults to `medium` if omitted.

### File Layout

```
agents/skills/claude-code/harness-autopilot/
  SKILL.md          # Full skill definition with state machine logic
  skill.yaml        # Metadata, triggers, dependencies
```

No new packages. No changes to existing skills. State file lives alongside existing `.harness/` files.

## Success Criteria

1. **Single invocation:** User runs `/harness:autopilot` once and the loop executes all phases of an approved spec through to completion, pausing only at defined human checkpoints.

2. **Resume works:** After context reset, terminal close, or user-initiated pause, re-invoking `/harness:autopilot` resumes from the exact state (same phase, same task, same retry count).

3. **Adaptive complexity gates:** A spec with `complexity: low` phases auto-plans and presents for approval. A spec with `complexity: high` phases pauses for interactive planning. Planning override bumps low to medium when task count exceeds threshold.

4. **Retry budget enforced:** Failed tasks get up to 3 attempts with escalating context. On budget exhaustion, the loop stops with a full failure report and all attempts visible to the user.

5. **Existing skills unchanged:** `harness-planning`, `harness-execution`, `harness-verification`, and `harness-code-review` continue to work independently with no behavioral changes.

6. **State file is the source of truth:** All progress, decisions, and retry history are in `.harness/autopilot-state.json`. A fresh session with only the state file and the spec can fully resume.

7. **Human always approves plans:** No plan executes without explicit human approval, regardless of complexity level. The difference is whether the loop generates the plan automatically or asks the human to drive planning.

8. **Phase completion summary:** After each phase, the user sees a summary of tasks completed, retries used, verification results, and review findings before being asked to continue.

## Implementation Order

### Phase 1: Skill skeleton and state machine

<!-- complexity: low -->

Create the skill files, define the state machine transitions, implement INIT and ASSESS states, and build the state file read/write logic.

### Phase 2: Core loop — plan through execute

<!-- complexity: medium -->

Implement PLAN, APPROVE_PLAN, and EXECUTE states with subagent delegation. Wire up the complexity assessment logic and planning override.

### Phase 3: Verification and review integration

<!-- complexity: low -->

Implement VERIFY, REVIEW, and PHASE_COMPLETE states. Wire subagent delegation for verification and review skills.

### Phase 4: Retry budget and failure handling

<!-- complexity: medium -->

Implement the 3-attempt retry escalation in the EXECUTE state. Track attempts in state file. Wire failure recording to `.harness/failures.md`.

### Phase 5: Resume and multi-phase transitions

<!-- complexity: medium -->

Implement resume-from-state logic for all states. Implement PHASE_COMPLETE → ASSESS transition for next phase. Handle the DONE state with PR offering.
