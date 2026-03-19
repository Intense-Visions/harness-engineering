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

| Skill                | Persona Agent (`subagent_type`) | Role in Autopilot                            |
| -------------------- | ------------------------------- | -------------------------------------------- |
| harness-planning     | `harness-planner`               | Delegated to for phase plan creation         |
| harness-execution    | `harness-task-executor`         | Delegated to for task-by-task implementation |
| harness-verification | `harness-verifier`              | Delegated to for post-execution validation   |
| harness-code-review  | `harness-code-reviewer`         | Delegated to for post-verification review    |

Autopilot orchestrates these persona agents — it never reimplements their logic. Each agent is dispatched via the Agent tool with the corresponding `subagent_type`, which isolates it to the harness methodology and prevents it from using unrelated skills.

## Iron Law

**Autopilot delegates, never reimplements.** If you find yourself writing planning logic, execution logic, or review logic inside the autopilot loop, STOP. Delegate to the dedicated persona agent.

**Always use dedicated persona agents, never general-purpose agents.** Every dispatch MUST target the specific harness persona (`harness-planner`, `harness-task-executor`, `harness-verifier`, `harness-code-reviewer`). General-purpose agents see all globally registered skills and may use unrelated workflows instead of the harness methodology.

- **Claude Code:** Use the Agent tool with `subagent_type` set to the persona name.
- **Gemini CLI:** Use the `run_agent` tool targeting the persona by name, or dispatch via `harness persona run <name>`.

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
   - Read the spec file (provided as argument or found via `.harness/handoff.json`). If neither is available, ask the user for the spec path.
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
     | `low`                | Auto-plan via `harness-planner` agent. Proceed to PLAN.                                                                                                                                                                              |
     | `medium`             | Auto-plan via `harness-planner` agent. Proceed to PLAN. Present with extra scrutiny note.                                                                                                                                            |
     | `high`               | Pause. Tell the user: "Phase {N}: {name} is marked high-complexity. Run `/harness:planning` interactively for this phase, then re-invoke `/harness:autopilot` to continue." Transition to PLAN with `awaitingInteractivePlan: true`. |

4. **Update state** with `currentState: "PLAN"` and save.

---

### PLAN — Generate or Await Plan

**If auto-planning (low/medium complexity):**

1. Dispatch a planning agent using the Agent tool:

   ```
   Agent tool parameters:
     subagent_type: "harness-planner"
     description: "Plan phase {N}: {name}"
     prompt: |
       You are running harness-planning for phase {N}: {name}.

       Spec: {specPath}
       Phase description: {phase description from spec}
       Previous phase learnings: {relevant learnings from .harness/learnings.md}
       Known failures to avoid: {relevant entries from .harness/failures.md}

       Follow the harness-planning skill process exactly. Write the plan to
       docs/plans/{date}-{phase-name}-plan.md. Write .harness/handoff.json when done.
   ```

2. When the agent returns:
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

---

### APPROVE_PLAN — Human Review Gate

**This state always pauses for human input.**

1. **Present the plan summary:**
   - Phase name and number
   - Task count
   - Checkpoint count
   - Estimated time (task count × 3 minutes)
   - Effective complexity (original + any override)
   - Any concerns from the planning handoff

2. **Ask:** "Approve this plan and begin execution? (yes / revise / skip phase / stop)"
   - **yes** — Transition to EXECUTE.
   - **revise** — Tell user to edit the plan file directly, then re-present.
   - **skip phase** — Mark phase as `skipped` in state, transition to PHASE_COMPLETE.
   - **stop** — Save state and exit. User can resume later.

3. **Record the decision** in state: `decisions` array.

4. **Update state** with `currentState: "EXECUTE"` and save.

---

### EXECUTE — Run the Plan

1. **Dispatch execution agent using the Agent tool:**

   ```
   Agent tool parameters:
     subagent_type: "harness-task-executor"
     description: "Execute phase {N}: {name}"
     prompt: |
       You are running harness-execution for phase {N}: {name}.

       Plan: {planPath}
       State: .harness/state.json
       Learnings: .harness/learnings.md
       Failures: .harness/failures.md

       Follow the harness-execution skill process exactly.
       Update .harness/state.json after each task.
       Write .harness/handoff.json when done or when blocked.
   ```

2. **When the agent returns, check the outcome:**
   - **All tasks complete:** Transition to VERIFY.
   - **Checkpoint reached:** Surface the checkpoint to the user in the main conversation. Handle the checkpoint type:
     - `[checkpoint:human-verify]` — Show output, ask for confirmation, then resume execution agent.
     - `[checkpoint:decision]` — Present options, record choice, resume execution agent.
     - `[checkpoint:human-action]` — Instruct user, wait for confirmation, resume execution agent.
   - **Task failed:** Enter retry logic (see below).

3. **Retry logic on failure:**
   - Read `retryBudget` from state.
   - If `attemptsUsed < maxAttempts`:
     - Increment `attemptsUsed`.
     - Record the attempt (timestamp, error, fix attempted, result).
     - **Attempt 1:** Read error output, apply obvious fix, re-dispatch execution agent for the failed task only.
     - **Attempt 2:** Expand context — read related files, check `learnings.md` for similar failures, re-dispatch with additional context.
     - **Attempt 3:** Full context gather — read test output, imports, plan instructions for ambiguity. Re-dispatch with maximum context.
   - If budget exhausted:
     - **Stop.** Present all 3 attempts with full context to the user.
     - Record failure in `.harness/failures.md`.
     - Ask: "How should we proceed? (fix manually and continue / revise plan / stop)"
     - Save state. User's choice determines next transition.

4. **Update state** after each execution cycle and save.

---

### VERIFY — Post-Execution Validation

1. **Dispatch verification agent using the Agent tool:**

   ```
   Agent tool parameters:
     subagent_type: "harness-verifier"
     description: "Verify phase {N}: {name}"
     prompt: |
       You are running harness-verification for phase {N}: {name}.

       Follow the harness-verification skill process exactly.
       Report pass/fail with findings.
   ```

2. **When the agent returns:**
   - **All checks pass:** Transition to REVIEW.
   - **Failures found:** Surface findings to the user. Ask: "Fix these issues before review? (yes / skip verification / stop)"
     - **yes** — Re-enter EXECUTE with targeted fixes (retry budget resets for verification fixes).
     - **skip** — Proceed to REVIEW with verification warnings noted.
     - **stop** — Save state and exit.

3. **Update state** with `currentState: "REVIEW"` and save.

---

### REVIEW — Code Review

1. **Dispatch review agent using the Agent tool:**

   ```
   Agent tool parameters:
     subagent_type: "harness-code-reviewer"
     description: "Review phase {N}: {name}"
     prompt: |
       You are running harness-code-review for phase {N}: {name}.

       Follow the harness-code-review skill process exactly.
       Report findings with severity (blocking / warning / note).
   ```

2. **When the agent returns:**
   - **No blocking findings:** Report summary, transition to PHASE_COMPLETE.
   - **Blocking findings:** Surface to user. Ask: "Address blocking findings before completing this phase? (yes / override / stop)"
     - **yes** — Re-enter EXECUTE with review fixes.
     - **override** — Record override decision, transition to PHASE_COMPLETE.
     - **stop** — Save state and exit.

3. **Update state** with `currentState: "PHASE_COMPLETE"` and save.

---

### PHASE_COMPLETE — Summary and Transition

1. **Present phase summary:**
   - Phase name and number
   - Tasks completed
   - Retries used
   - Verification result (pass/fail/skipped)
   - Review findings count (blocking/warning/note)
   - Time from phase start to completion (from history timestamps)

2. **Record phase in history:**

   ```json
   {
     "phase": 0,
     "name": "<phase name>",
     "startedAt": "<timestamp>",
     "completedAt": "<now>",
     "tasksCompleted": 8,
     "retriesUsed": 1,
     "verificationPassed": true,
     "reviewFindings": { "blocking": 0, "warning": 1, "note": 3 }
   }
   ```

3. **Mark phase as `complete`** in state.

4. **Check for next phase:**
   - If more phases remain: "Phase {N} complete. Next: Phase {N+1}: {name} (complexity: {level}). Continue? (yes / stop)"
     - **yes** — Increment `currentPhase`, reset `retryBudget`, transition to ASSESS.
     - **stop** — Save state and exit.
   - If no more phases: Transition to DONE.

---

### DONE — Final Summary

1. **Present project summary:**
   - Total phases completed
   - Total tasks across all phases
   - Total retries used
   - Total time (first phase start to last phase completion)
   - Any overridden review findings

2. **Offer next steps:**
   - "Create a PR? (yes / no)"
   - If yes: assemble commit history, suggest PR title and description.

3. **Write final handoff:**

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

4. **Append learnings** to `.harness/learnings.md`:

   ```
   ## {date} — Autopilot: {spec name}
   - [skill:harness-autopilot] [outcome:complete] Executed {N} phases, {M} tasks, {R} retries
   - [skill:harness-autopilot] [outcome:observation] {any notable patterns from the run}
   ```

5. **Clean up state:** Set `currentState: "DONE"` in `autopilot-state.json`. Do not delete the file — it serves as a record.

## Harness Integration

- **`harness validate`** — Run during INIT to verify project health. Included in every execution task via harness-execution delegation.
- **`harness check-deps`** — Delegated to harness-execution (included in task steps).
- **State file** — `.harness/autopilot-state.json` tracks the orchestration state machine. `.harness/state.json` tracks task-level execution state (managed by harness-execution).
- **Handoff** — `.harness/handoff.json` is written by each delegated skill and read by the next. Autopilot writes a final handoff on DONE.
- **Learnings** — `.harness/learnings.md` is appended by both delegated skills and autopilot itself.

## Success Criteria

- Single `/harness:autopilot` invocation executes all phases through to completion
- Resume from any state after context reset via `.harness/autopilot-state.json`
- Low-complexity phases auto-plan; high-complexity phases pause for interactive planning
- Planning override bumps complexity upward when task signals disagree
- Retry budget (3 attempts) with escalating context before surfacing failures
- Existing skills (planning, execution, verification, review) are unchanged
- Human approves every plan before execution begins
- Phase completion summary shown between every phase

## Examples

### Example: 3-Phase Security Scanner

**User invokes:** `/harness:autopilot docs/specs/2026-03-19-security-scanner.md`

**INIT:**

```
Read spec — found 3 phases:
  Phase 1: Core Scanner (complexity: low)
  Phase 2: Rule Engine (complexity: high)
  Phase 3: CLI Integration (complexity: low)
Created .harness/autopilot-state.json. Starting Phase 1.
```

**Phase 1 — ASSESS:**

```
Phase 1: Core Scanner — complexity: low. Auto-planning.
```

**Phase 1 — PLAN:**

```
[harness-planner agent runs harness-planning]
Plan generated: docs/plans/2026-03-19-core-scanner-plan.md (8 tasks, ~24 min)
```

**Phase 1 — APPROVE_PLAN:**

```
Phase 1: Core Scanner
Tasks: 8 | Checkpoints: 1 | Est. time: 24 min | Complexity: low
Approve this plan and begin execution? (yes / revise / skip / stop)
→ User: "yes"
```

**Phase 1 — EXECUTE → VERIFY → REVIEW:**

```
[harness-task-executor agent executes 8 tasks... all pass]
[harness-verifier agent runs verification... pass]
[harness-code-reviewer agent runs code review... 0 blocking, 2 notes]
```

**Phase 1 — PHASE_COMPLETE:**

```
Phase 1: Core Scanner — COMPLETE
Tasks: 8/8 | Retries: 0 | Verification: pass | Review: 0 blocking
Next: Phase 2: Rule Engine (complexity: high). Continue? (yes / stop)
→ User: "yes"
```

**Phase 2 — ASSESS:**

```
Phase 2: Rule Engine — complexity: high.
This phase requires interactive planning. Run /harness:planning with the
Rule Engine section of the spec, then re-invoke /harness:autopilot to continue.
```

**[User runs /harness:planning interactively, produces plan]**

**User re-invokes:** `/harness:autopilot`

**INIT (resume):**

```
Resuming autopilot from state PLAN, phase 2: Rule Engine.
Found plan: docs/plans/2026-03-19-rule-engine-plan.md
```

**Phase 2 — APPROVE_PLAN → EXECUTE → VERIFY → REVIEW → PHASE_COMPLETE**

```
[Same flow as Phase 1, with checkpoint pauses as needed]
Phase 2: Rule Engine — COMPLETE
Tasks: 14/14 | Retries: 1 | Verification: pass | Review: 0 blocking
Next: Phase 3: CLI Integration (complexity: low). Continue? (yes / stop)
→ User: "yes"
```

**Phase 3 — [auto-plans, executes, completes]**

**DONE:**

```
All phases complete.
Total: 3 phases, 30 tasks, 1 retry
Create a PR? (yes / no)
→ User: "yes"
```

### Example: Retry Budget Exhaustion

**During Phase 1 — EXECUTE:**

```
Task 4: wire parser — FAILED
Error: Type error in parser.ts:42 — missing generic parameter

Retry 1/3: Added generic parameter to parseRule<T>. Re-running...
Task 4: wire parser — FAILED
Error: Test assertion failure — expected 3 rules, got 0

Retry 2/3: Expanded context — read rule-loader.ts, checked learnings. Fixed import path. Re-running...
Task 4: wire parser — FAILED
Error: Test timeout after 5000ms

Retry 3/3: Full context — re-read plan instructions, checked for ambiguity. Found test was missing async/await. Re-running...
Task 4: wire parser — PASSED

Continuing execution...
```

**If all 3 retries fail:**

```
Task 4: wire parser — FAILED (budget exhausted)

Attempt 1: Added generic parameter → Type error persists
Attempt 2: Fixed import path → Tests still timeout
Attempt 3: Added async/await → New error: connection refused

Recorded in .harness/failures.md.
How should we proceed? (fix manually and continue / revise plan / stop)
```

## Gates

- **No reimplementing delegated skills.** Autopilot orchestrates. If you are writing planning logic, execution logic, verification logic, or review logic, STOP. Delegate to the appropriate persona agent via `subagent_type`.
- **No executing without plan approval.** Every plan must be explicitly approved by the human before execution begins. No exceptions, regardless of complexity level.
- **No skipping VERIFY or REVIEW.** Every phase goes through verification and review. The human can override findings, but the steps cannot be skipped.
- **No infinite retries.** The retry budget is 3 attempts. If exhausted, STOP and surface to the human. Do not extend the budget without explicit human instruction.
- **No modifying autopilot-state.json manually.** The state file is managed by the skill. If the state appears corrupted, start fresh rather than patching it.

## Escalation

- **When the spec has no Implementation Order section:** Cannot identify phases. Ask the user to add phase annotations to the spec or provide a roadmap file.
- **When a delegated skill fails to produce expected output:** Check that handoff.json was written correctly. If the agent failed, report the failure and ask the user whether to retry the entire phase step or stop.
- **When the user wants to reorder phases mid-run:** Update the phases array in autopilot-state.json (mark skipped phases, adjust currentPhase). Do not re-run completed phases.
- **When context limits are approaching:** Persist state immediately and inform the user: "Context limit approaching. State saved. Re-invoke /harness:autopilot to continue from this point."
- **When multiple phases fail in sequence:** After 2 consecutive phase failures (retry budget exhausted in both), suggest the user review the spec for systemic issues rather than continuing.
