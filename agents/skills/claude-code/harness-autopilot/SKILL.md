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
