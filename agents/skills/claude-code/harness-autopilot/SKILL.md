# Harness Autopilot

> Autonomous phase execution loop — chains planning, execution, verification, and review across multi-phase projects, pausing only at human decision points.

## When to Use

- After a multi-phase spec is approved and you want automated execution across all phases
- When a project has 2+ implementation phases that would require repeated manual skill invocations
- When you want the Ralph Loop pattern (fresh context per iteration, append-only learnings) applied at the phase level
- NOT for single-phase work (use harness-execution directly)
- NOT when the spec is not yet approved (use harness-brainstorming first)
- NOT for CI/headless execution (this is a conversational skill)

## Relationship to Other Skills

| Skill                | Role in Autopilot                            |
| -------------------- | -------------------------------------------- |
| harness-planning     | Delegated to for phase plan creation         |
| harness-execution    | Delegated to for task-by-task implementation |
| harness-verification | Delegated to for post-execution validation   |
| harness-code-review  | Delegated to for post-verification review    |

Autopilot orchestrates these skills — it never reimplements their logic.

## Iron Law

**Autopilot delegates, never reimplements.** If you find yourself writing planning logic, execution logic, or review logic inside the autopilot loop, STOP. Delegate to the appropriate skill via subagent.

**Human always approves plans.** No plan executes without explicit human sign-off, regardless of complexity level. The difference is whether autopilot generates the plan automatically or asks the human to drive planning interactively.

## Process

### State Machine

```
INIT → ASSESS → PLAN → APPROVE_PLAN → EXECUTE → VERIFY → REVIEW → PHASE_COMPLETE
                                                                         ↓
                                                                   [next phase?]
                                                                    ↓         ↓
                                                                 ASSESS      DONE
```

---

### Phase 1: INIT — Load Spec and Restore State

1. **Check for existing state.** Read `.harness/autopilot-state.json`. If it exists and `currentState` is not `DONE`:
   - Report: "Resuming autopilot from state `{currentState}`, phase {currentPhase}: {phaseName}."
   - Skip to the recorded `currentState` and continue from there.

2. **If no existing state (fresh start):**
   - Read the spec file (provided as argument or found via `.harness/handoff.json`).
   - Parse the `## Implementation Order` section to extract phases.
   - For each phase heading (`### Phase N: Name`), extract:
     - Phase name
     - Complexity annotation (`<!-- complexity: low|medium|high -->`, default: `medium`)
   - Create `.harness/autopilot-state.json`:
     ```json
     {
       "schemaVersion": 1,
       "specPath": "<path to spec>",
       "currentState": "ASSESS",
       "currentPhase": 0,
       "phases": [
         {
           "name": "<phase name>",
           "complexity": "<low|medium|high>",
           "complexityOverride": null,
           "planPath": null,
           "status": "pending"
         }
       ],
       "retryBudget": {
         "maxAttempts": 3,
         "currentTask": null
       },
       "history": []
     }
     ```

3. **Load context.** Read `.harness/learnings.md` and `.harness/failures.md` if they exist. Note any relevant learnings or known dead ends for the current phase.

4. **Transition to ASSESS.**

---

### ASSESS — Determine Phase Approach

1. **Read the current phase** from `autopilot-state.json` at index `currentPhase`.

2. **Check if plan already exists.** If `planPath` is set and the file exists, skip to `APPROVE_PLAN`.

3. **Evaluate complexity:**
   - Read the phase's `complexity` field from state.
   - If `complexityOverride` is set, use it instead.
   - Decision matrix:

     | Effective Complexity | Action                                                                                                                                                                                                                               |
     | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
     | `low`                | Auto-plan via subagent. Proceed to PLAN.                                                                                                                                                                                             |
     | `medium`             | Auto-plan via subagent. Proceed to PLAN. Present with extra scrutiny note.                                                                                                                                                           |
     | `high`               | Pause. Tell the user: "Phase {N}: {name} is marked high-complexity. Run `/harness:planning` interactively for this phase, then re-invoke `/harness:autopilot` to continue." Transition to PLAN with `awaitingInteractivePlan: true`. |

4. **Update state** with `currentState: "PLAN"` and save.

---

### PLAN — Generate or Await Plan

**If auto-planning (low/medium complexity):**

1. Dispatch a subagent with the following prompt:

   ```
   You are running harness-planning for phase {N}: {name}.

   Spec: {specPath}
   Phase description: {phase description from spec}
   Previous phase learnings: {relevant learnings from .harness/learnings.md}
   Known failures to avoid: {relevant entries from .harness/failures.md}

   Follow the harness-planning skill process exactly. Write the plan to
   docs/plans/{date}-{phase-name}-plan.md. Write .harness/handoff.json when done.
   ```

2. When the subagent returns:
   - Read the generated plan path from `.harness/handoff.json`.
   - **Apply complexity override check:**
     - Count tasks in the plan.
     - Count `[checkpoint:*]` markers.
     - If `spec_complexity == "low"` AND (`task_count > 10` OR `checkpoint_count > 3`):
       Set `complexityOverride: "medium"` in state. Note to user: "Planning produced {N} tasks — more than expected for low complexity. Reviewing with extra scrutiny."
     - If `spec_complexity == "low"` AND (`task_count > 20` OR `checkpoint_count > 6`):
       Set `complexityOverride: "high"` in state. Note to user: "This phase is significantly larger than expected. Consider breaking it down."
   - Update state: set `planPath` for the current phase.
   - Transition to `APPROVE_PLAN`.

**If awaiting interactive plan (high complexity):**

1. Check if a plan file now exists for this phase (user ran planning separately).
   - Look for files matching `docs/plans/*{phase-name}*` or check `.harness/handoff.json` for a planning handoff.
2. If found: update `planPath` in state, transition to `APPROVE_PLAN`.
3. If not found: remind the user and wait.
