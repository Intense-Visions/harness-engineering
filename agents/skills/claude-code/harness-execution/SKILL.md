# Harness Execution

> Execute a plan task by task with atomic commits, checkpoint protocol, and persistent knowledge capture. Stop on blockers. Do not guess.

## When to Use
- When an approved plan exists (output of harness-planning) and implementation should begin
- When resuming execution of a previously started plan after a context reset
- When `on_new_feature` or `on_bug_fix` triggers fire and a plan is already in place
- NOT when no plan exists (use harness-planning first)
- NOT when the plan needs revision (update the plan first, then resume execution)
- NOT when exploring or brainstorming (use harness-brainstorming)
- NOT for ad-hoc single-task work that does not follow a plan

## Process

### Iron Law

**Execute the plan as written. If the plan is wrong, stop and fix the plan — do not improvise.**

Deviating from the plan mid-execution introduces untested assumptions, breaks task atomicity, and makes progress untraceable. If a task cannot be completed as written, that is a blocker. Record it and stop.

---

### Phase 1: PREPARE — Load State and Verify Prerequisites

1. **Load the plan.** Read the plan document from `docs/plans/`. Identify the total task count and any checkpoints.

2. **Load state.** Read `.harness/state.json` to determine current position. If the file does not exist, this is a fresh start — position is Task 1.

3. **Load learnings.** Read `.harness/learnings.md` for context from previous sessions. These are hard-won insights — do not ignore them.

4. **Load failures.** Read `.harness/failures.md` for known dead ends. If any entries match approaches in the current plan, surface warnings before proceeding.

5. **Load handoff.** Read `.harness/handoff.json` if it exists. Contains structured context from the previous skill (e.g., harness-planning passing context to harness-execution). Use this to prime session state.

6. **Verify prerequisites.** For the current task:
   - Are dependency tasks marked complete in state?
   - Do the files referenced in the task exist as expected?
   - Does the test suite pass? Run `harness validate` to confirm a clean baseline.

7. **If prerequisites fail,** do not proceed. Report what is missing and which task is blocked.

---

### Phase 2: EXECUTE — Implement Tasks Atomically

For each task, starting from the current position:

1. **Read the task instructions completely** before writing any code. Understand what files to touch, what tests to write, what the expected outcome is.

2. **Follow the task instructions exactly.** The plan contains exact file paths, exact code, and exact commands. Execute them as written.

3. **TDD rhythm within each task:**
   - Write the test as specified in the task
   - Run the test — observe it fail (for the right reason)
   - Write the implementation as specified in the task
   - Run the test — observe it pass
   - Run `harness validate`

4. **Commit atomically.** Each task produces exactly one commit. Use the commit message specified in the plan. If no message is specified, write a descriptive message in the project's convention.

5. **Run mechanical gate.** After each task commit, run the full gate check: test suite, linter, type checker, build, and `harness validate`. This is binary pass/fail.
   - **All pass →** proceed to the next task.
   - **Any fail →** retry with error context (max 2 attempts).
   - **Still failing after retries →** record the failure in `.harness/failures.md`, escalate, and stop.

6. **Update state after each task.** Write to `.harness/state.json`:
   ```json
   {
     "schemaVersion": 1,
     "position": { "phase": "execute", "task": "Task N" },
     "progress": { "Task 1": "complete", "Task 2": "complete", "Task 3": "in_progress" },
     "lastSession": { "date": "YYYY-MM-DD", "summary": "Completed Tasks 1-2, starting Task 3" }
   }
   ```

7. **Handle checkpoints** according to the checkpoint protocol (see below).

---

### Checkpoint Protocol

Plans contain three types of checkpoints. Each requires pausing execution.

**`[checkpoint:human-verify]` — Show and Confirm**
1. Stop execution.
2. Show the human what was just completed (test output, file diff, running application).
3. State: "Task N complete. Output: [summary]. Continue to Task N+1?"
4. Wait for the human to confirm before proceeding.

**`[checkpoint:decision]` — Present Options and Wait**
1. Stop execution.
2. Present the decision with options exactly as described in the plan.
3. State: "Task N requires a decision: [options]. Which do you prefer?"
4. Wait for the human to choose.
5. Record the decision in `.harness/state.json` under `decisions`.

**`[checkpoint:human-action]` — Instruct and Wait**
1. Stop execution.
2. Tell the human exactly what they need to do (e.g., "Create an API key at [URL] and paste it here").
3. State: "Task N requires your action: [instructions]. Let me know when done."
4. Wait for the human to complete the action and confirm.

---

### Phase 3: VERIFY — Two-Tier Validation

**Quick gate (default):** The mechanical gate in Phase 2 Step 5 IS the standard verification. Every task commit must pass it before proceeding. No additional verification step is needed for normal execution.

**Deep audit (on-demand):** When `--deep` is passed or at milestone boundaries (e.g., end of a phase, final task), invoke the full `harness-verification` skill for 3-level audit:
1. **EXISTS** — Do the artifacts the task claims to produce actually exist?
2. **SUBSTANTIVE** — Do those artifacts contain meaningful, correct content (not stubs or placeholders)?
3. **WIRED** — Are those artifacts integrated into the system (imported, routed, tested, reachable)?

If the deep audit fails at any level, treat it as a blocker. Record it and stop.

---

### Phase 4: PERSIST — Save Progress and Learnings

Between tasks (especially between sessions):

1. **Update `.harness/state.json`** with current position, progress, and `lastSession` context:
   ```json
   {
     "lastSession": {
       "lastSkill": "harness-execution",
       "pendingTasks": ["Task 4", "Task 5"]
     }
   }
   ```

2. **Append tagged learnings to `.harness/learnings.md`.** Tag every entry with skill and outcome:
   ```markdown
   ## YYYY-MM-DD — Task N: <task name>
   - [skill:harness-execution] [outcome:success] What was accomplished
   - [skill:harness-execution] [outcome:gotcha] What was surprising or non-obvious
   - [skill:harness-execution] [outcome:decision] What was decided and why
   ```

3. **Record failures in `.harness/failures.md`** if any task was escalated after retry exhaustion (from Phase 2 Step 5). Include the approach attempted and why it failed, so future sessions avoid the same dead end.

4. **Write `.harness/handoff.json`** with structured context for the next skill or session:
   ```json
   {
     "fromSkill": "harness-execution",
     "timestamp": "YYYY-MM-DDTHH:MM:SSZ",
     "summary": "Completed Tasks 1-3. Task 4 blocked on missing API endpoint.",
     "pendingTasks": ["Task 4", "Task 5"],
     "blockers": ["Task 4: /api/notifications endpoint not implemented"],
     "learnings": ["Date comparison needs UTC normalization"]
   }
   ```

5. **Learnings are append-only.** Never edit or delete previous learnings. They are a chronological record.

---

### Stopping Conditions

These are non-negotiable. When any condition is met, stop immediately.

- **Hit a blocker.** The task cannot be completed as written. Something is missing, broken, or wrong. Do not guess at a fix. Do not improvise. Record the blocker in state and report it: "Blocked on Task N: [specific issue]. The plan needs to be updated."

- **Test failure after implementation.** The test was supposed to pass but does not. Do not retry blindly. Read the failure. Diagnose the root cause. If the fix is within the current task scope, fix it. If not, stop — the plan may be wrong.

- **Unclear instruction.** The task says something ambiguous or contradictory. Do not interpret it. Ask: "Task N says [quote]. I interpret this as [interpretation]. Is that correct?"

- **Harness validation failure.** `harness validate` fails after a task. Do not proceed. The task introduced an architectural violation or constraint breach. Fix it before moving on.

- **Three consecutive failures on the same task.** After 3 attempts, the task design is likely wrong. Stop. Report: "Task N has failed 3 times. Root cause: [analysis]. The plan may need revision."

## Harness Integration

- **`harness validate`** — Run after every task completion. Mandatory. No task is complete without a passing validation.
- **`harness check-deps`** — Run when tasks add new imports or modules. Catches boundary violations early.
- **`harness state show`** — View current execution position and progress.
- **`harness state learn "<message>"`** — Append a learning from the command line.
- **`.harness/state.json`** — Read at session start to resume position. Updated after every task.
- **`.harness/learnings.md`** — Append-only knowledge capture. Read at session start for prior context.

## Success Criteria

- Every task in the plan is executed in order, atomically, with one commit per task
- `.harness/state.json` accurately reflects current position and progress
- `.harness/learnings.md` contains entries for every session with non-trivial discoveries
- `harness validate` passes after every task
- Checkpoints were honored: execution paused at every `[checkpoint:*]` marker
- No improvisation: tasks were executed as written, or execution was stopped and the blocker was reported
- All stopping conditions were respected (no guessing past blockers, no blind retries)

## Examples

### Example: Executing a 5-Task Notification Plan

**Session Start (fresh):**
```
Read plan: docs/plans/2026-03-14-notifications-plan.md (5 tasks)
Read state: .harness/state.json — file not found (fresh start, position: Task 1)
Read learnings: .harness/learnings.md — file not found (no prior context)
Run: harness validate — passes. Clean baseline confirmed.
```

**Task 1: Define notification types**
```
1. Create src/types/notification.ts with Notification interface
2. Run: harness validate — passes
3. Commit: "feat(notifications): define Notification type"
4. Update state: { position: Task 2, progress: { "Task 1": "complete" } }
```

**Task 2: Create notification service (TDD)**
```
1. Write test: src/services/notification-service.test.ts
2. Run test: FAIL — NotificationService is not defined (correct failure)
3. Implement: src/services/notification-service.ts
4. Run test: PASS
5. Run: harness validate — passes
6. Commit: "feat(notifications): add NotificationService.create"
7. Update state: { position: Task 3, progress: { "Task 1": "complete", "Task 2": "complete" } }
```

**Task 3: Add list and expiry (TDD) — has checkpoint**
```
[checkpoint:human-verify] — "Tasks 1-2 complete. NotificationService can create
notifications. Tests pass. Continue to Task 3 (list and expiry methods)?"
Human: "Continue."

1. Write tests: list by userId, filter expired
2. Run tests: FAIL (methods not implemented)
3. Implement list() and isExpired()
4. Run tests: PASS
5. Run: harness validate — passes
6. Commit: "feat(notifications): add list and expiry to NotificationService"
7. Update state, append learning:
   "## 2026-03-14 — Task 3: list and expiry
   - [gotcha]: Date comparison needed UTC normalization — used Date.now() not new Date()"
```

**Context reset mid-plan (resume at Task 4):**
```
Read plan: docs/plans/2026-03-14-notifications-plan.md
Read state: .harness/state.json — position: Task 4, Tasks 1-3 complete
Read learnings: .harness/learnings.md — "Date comparison needed UTC normalization"
Run: harness validate — passes. Resume from Task 4.
```

## Gates

These are hard stops. Violating any gate means the process has broken down.

- **No execution without a plan.** If no plan document exists, do not start. Use harness-planning to create one.
- **No improvisation.** Execute the plan as written. If the plan says "create file X with code Y," create file X with code Y. Do not add "improvements" or "optimizations" that are not in the plan.
- **No skipping tasks.** Tasks are ordered by dependency. Skipping a task means later tasks may fail. Execute in order.
- **No skipping validation.** `harness validate` runs after every task. No exceptions. A task that passes its tests but fails validation is not complete.
- **No ignoring checkpoints.** If a task has a `[checkpoint:*]` marker, execution must pause. Do not auto-continue past checkpoints.
- **No guessing past blockers.** If a task cannot be completed as written, stop. Report the blocker. Do not invent a workaround.
- **State must be updated.** After every task, `.harness/state.json` must reflect the new position. Skipping state updates makes resume impossible.

## Escalation

- **When a task fails and the fix is outside task scope:** Report: "Task N failed because [reason]. The fix requires changes to [files/tasks outside scope]. The plan needs to be updated at Tasks [X, Y] before I can continue."
- **When the plan references files that do not exist:** The plan is out of date or was written against a different branch. Report: "Task N references [file] which does not exist. Plan may need regeneration."
- **When tests pass but behavior seems wrong:** Do not ignore your instinct, but also do not act on it unilaterally. Report: "Task N passes all tests, but I notice [observation]. Should I investigate before proceeding?"
- **When state is corrupted or inconsistent:** If `.harness/state.json` says Task 5 is complete but the code for Task 5 does not exist, the state is wrong. Report the inconsistency. Do not trust corrupted state — re-verify from Task 1 if needed.
- **When the human wants to skip ahead:** Explain the risk: "Skipping Task N means Tasks [X, Y] that depend on it may fail. If you want to skip, we should update the plan to remove the dependency." Get explicit approval before skipping.

## Trace Output (Optional)

When `.harness/gate.json` has `"trace": true` or `--verbose` is passed, append one-sentence reasoning at each phase boundary to `.harness/trace.md`.

**Format:** `**[PHASE HH:MM:SS]** summary`

Example:
```markdown
**[PREPARE 14:32:07]** Loaded plan with 5 tasks, resuming from Task 3 per state.json.
**[EXECUTE 14:32:15]** Task 3 committed; mechanical gate passed on first attempt.
**[VERIFY 14:35:42]** Deep audit requested at milestone; all 3 levels passed.
**[PERSIST 14:35:50]** State updated, handoff.json written with 2 pending tasks.
```

This is for human debugging only. Not required for normal execution.
