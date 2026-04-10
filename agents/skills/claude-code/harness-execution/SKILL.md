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

Deviating mid-execution introduces untested assumptions, breaks atomicity, and makes progress untraceable. If a task cannot be completed as written, that is a blocker. Record it and stop.

---

### Phase 1: PREPARE — Load State and Verify Prerequisites

1. **Load the plan.** Read from `docs/plans/`. Identify total task count and checkpoints.

2. **Gather context in one call.** Use `gather_context` to load all working context:

   ```json
   gather_context({
     path: "<project-root>",
     intent: "Execute plan tasks starting from current position",
     skill: "harness-execution",
     session: "<session-slug-if-known>",
     include: ["state", "learnings", "handoff", "validation"]
   })
   ```

   If session slug is known, include `session` to scope reads/writes to `.harness/sessions/<slug>/`. If unknown, omit it — falls back to `.harness/`. Returns `state` (current position, null = fresh start), `learnings` (prior insights — do not ignore), `handoff` (context from previous skill), `validation` (project health). Failed constituents return null with errors in `meta.errors`.

3. **Load session summary for cold start.** If resuming (session slug known):
   - Call `listActiveSessions()` to read the session index.
   - Call `loadSessionSummary()` for the target session.
   - If ambiguous, present the index and ask which session to resume.

4. **Check for known dead ends.** Review `learnings` tagged `[outcome:failure]`. Warn if any match current plan approaches.

5. **Verify prerequisites** for the current task:
   - Dependency tasks marked complete in state?
   - Referenced files exist?
   - Test suite passes? Run `harness validate` for clean baseline.

6. **If prerequisites fail,** do not proceed. Report what is missing and which task is blocked.

### Graph-Enhanced Context (when available)

When a knowledge graph exists at `.harness/graph/`:

- `query_graph` — check file overlap between tasks for conflict detection
- `get_impact` — understand blast radius before executing a task

Fall back to file-based commands if no graph is available.

---

### Phase 2: EXECUTE — Implement Tasks Atomically

Report progress with: `**[Phase N/M]** Task N — <description>`

For each task, starting from current position:

1. **Read task instructions completely** before writing any code.

2. **Follow instructions exactly.** The plan contains exact file paths, code, and commands. Execute as written.

3. **TDD rhythm:**
   - Write the test as specified
   - Run test — observe it fail (for the right reason)
   - Write the implementation as specified
   - Run test — observe it pass
   - Run `harness validate`

4. **Commit atomically.** One commit per task. Use the plan's commit message, or write a descriptive one.

5. **Run mechanical gate.** After each commit, run `assess_project`:

   ```json
   assess_project({ path: "<project-root>", checks: ["validate", "deps", "lint"], mode: "summary" })
   ```

   Then run the test suite. Binary pass/fail:
   - **All pass** → proceed to next task.
   - **Any fail** → retry with error context (max 2 attempts).
   - **Still failing** → record in `.harness/failures.md`, escalate, stop.

6. **Update state after each task.** Write to `.harness/state.json`:

   ```json
   {
     "schemaVersion": 1,
     "position": { "phase": "execute", "task": "Task N" },
     "progress": { "Task 1": "complete", "Task 2": "complete", "Task 3": "in_progress" },
     "lastSession": { "date": "YYYY-MM-DD", "summary": "Completed Tasks 1-2, starting Task 3" }
   }
   ```

7. **Handle checkpoints** per the checkpoint protocol below.

---

### Checkpoint Protocol

Three checkpoint types. Each requires pausing execution.

**`[checkpoint:human-verify]` — Show and Confirm**

Stop. Present via `emit_interaction`:

```json
emit_interaction({
  path: "<project-root>",
  type: "confirmation",
  confirmation: {
    text: "Task N complete. Output: <summary>. Continue to Task N+1?",
    context: "<test output or diff summary>",
    impact: "Continuing proceeds to next task. Declining pauses for review.",
    risk: "low"
  }
})
```

Wait for human confirmation.

**`[checkpoint:decision]` — Present Options and Wait**

Stop. Present via `emit_interaction`:

```json
emit_interaction({
  path: "<project-root>",
  type: "question",
  question: {
    text: "Task N requires a decision: <description>",
    options: [
      { label: "<option A>", pros: ["..."], cons: ["..."], risk: "low", effort: "low" },
      { label: "<option B>", pros: ["..."], cons: ["..."], risk: "medium", effort: "medium" }
    ],
    recommendation: { optionIndex: 0, reason: "<why>", confidence: "medium" }
  }
})
```

Wait for human choice.

**`[checkpoint:human-action]` — Instruct and Wait**

Stop. Tell the human exactly what to do (e.g., "Create an API key at [URL] and paste it here"). State: "Task N requires your action: [instructions]. Let me know when done." Wait for confirmation.

---

### Phase 3: VERIFY — Two-Tier Validation

**Quick gate (default):** The mechanical gate in Phase 2 Step 5 IS the standard verification. Every task commit must pass it. No additional step needed for normal execution.

**Deep audit (on-demand):** When `--deep` is passed or at milestone boundaries, invoke `harness-verification` for 3-level audit:

1. **EXISTS** — Do claimed artifacts actually exist?
2. **SUBSTANTIVE** — Do they contain meaningful, correct content (not stubs)?
3. **WIRED** — Are they integrated (imported, routed, tested, reachable)?

If deep audit fails, treat as blocker. Record and stop.

After all tasks pass:

```json
emit_interaction({
  path: "<project-root>",
  type: "transition",
  transition: {
    completedPhase: "execution",
    suggestedNext: "verification",
    reason: "All plan tasks executed and verified",
    artifacts: ["<created/modified files>"],
    qualityGate: {
      checks: [
        { name: "all-tasks-complete", passed: true, detail: "<N>/<N> tasks" },
        { name: "harness-validate", passed: true },
        { name: "tests-pass", passed: true }
      ],
      allPassed: true
    }
  }
})
```

---

### Phase 4: PERSIST — Save Progress and Learnings

All session-scoped files use `{sessionDir}/` when session is known, otherwise `.harness/`. Session-scoped files include: `handoff.json`, `state.json`, `learnings.md`, `artifacts.json`.

1. **Update state** with current position, progress, and `lastSession`:

   ```json
   { "lastSession": { "lastSkill": "harness-execution", "pendingTasks": ["Task 4", "Task 5"] } }
   ```

**Graph Refresh:** If `.harness/graph/` exists, run `harness scan [path]` after code changes. Skipping causes stale graph query results.

2. **Append tagged learnings** to `learnings.md`. Tag every entry:

   ```markdown
   ## YYYY-MM-DD — Task N: <task name>

   - [skill:harness-execution] [outcome:success] What was accomplished
   - [skill:harness-execution] [outcome:gotcha] What was surprising
   - [skill:harness-execution] [outcome:decision] What was decided and why
   ```

3. **Record failures** in `failures.md` if any task was escalated after retry exhaustion. Include approach attempted and why it failed.

4. **Write handoff.** Write to the session-scoped path when session slug is known, otherwise fall back to global:
   - Session-scoped (preferred): `.harness/sessions/<session-slug>/handoff.json`
   - Global (fallback, **deprecated**): `.harness/handoff.json`

   > **[DEPRECATED]** Writing to `.harness/handoff.json` is deprecated. In autopilot sessions, always write to `.harness/sessions/<slug>/handoff.json`.

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

5. **Write session summary** for cold-start restoration via `writeSessionSummary(projectPath, sessionSlug, { session, lastActive, skill, phase, status, spec, plan, keyContext, nextStep })`.

6. **Sync roadmap (mandatory when present).** If `docs/roadmap.md` exists, call `manage_roadmap` with `sync` and `apply: true`. Do not use `force_sync: true`. If unavailable, fall back to `syncRoadmap()` from core and warn. If no roadmap, skip silently.

7. **Learnings are append-only.** Never edit or delete previous learnings.

8. **Auto-transition to verification.** When ALL tasks complete (not mid-plan), call:

   ```json
   emit_interaction({ type: "transition", transition: { completedPhase: "execution", suggestedNext: "verification", requiresConfirmation: false, summary: "<tasks completed summary>", qualityGate: { checks: [{ name: "all-tasks-complete", passed: true }, { name: "harness-validate", passed: true }, { name: "tests-pass", passed: true }, { name: "no-blockers", passed: true }], allPassed: true } } })
   ```

   Immediately invoke harness-verification without waiting for user input.

   **Important:** Only emit when all tasks complete. If stopped due to blocker/checkpoint/partial completion, write handoff and stop instead.

---

### Stopping Conditions

Non-negotiable. When any condition is met, stop immediately.

- **Hit a blocker.** Task cannot be completed as written. Do not guess or improvise. Record and report: "Blocked on Task N: [issue]. The plan needs to be updated."
- **Test failure after implementation.** Do not retry blindly. Diagnose root cause. Fix if within task scope; otherwise stop.
- **Unclear instruction.** Do not interpret ambiguity. Ask: "Task N says [quote]. I interpret this as [interpretation]. Correct?"
- **Harness validation failure.** Do not proceed. Fix the violation before moving on.
- **Three consecutive failures.** Task design is likely wrong. Report: "Task N failed 3 times. Root cause: [analysis]. Plan may need revision."

## Session State

This skill reads/writes session sections via `manage_state`:

| Section       | R/W  | Purpose                                                                         |
| ------------- | ---- | ------------------------------------------------------------------------------- |
| terminology   | both | Domain terms for consistent naming; adds terms discovered during implementation |
| decisions     | both | Planning decisions for context; records implementation decisions                |
| constraints   | both | Constraints to respect boundaries; adds constraints discovered during coding    |
| risks         | both | Risks for awareness; updates status as mitigated or realized                    |
| openQuestions | both | Questions for context; resolves questions answered by implementation            |
| evidence      | both | Prior evidence; writes file:line citations, test outputs, diff references       |

**Write:** After each task, append relevant entries. Write evidence for every significant technical assertion. Mark openQuestions as resolved when answered.

**Read:** During PREPARE, read all sections via `gather_context` with `include: ["sessions"]`.

## Evidence Requirements

Claims about task completion, test results, or code behavior MUST cite evidence:

1. **File reference:** `file:line` format (e.g., `src/services/notification-service.ts:42`)
2. **Test output:** Actual command and output (e.g., `$ npx vitest run ... → PASS (8 tests)`)
3. **Diff evidence:** Before/after with file path for modifications
4. **Harness output:** `harness validate` output as project health evidence
5. **Session evidence:** Write to `evidence` section via `manage_state` after each task

**When to cite:** After every task completion. Every commit claim must be backed by test output or file reference.

**Uncited claims:** Prefix with `[UNVERIFIED]`. Uncited claims are flagged during review.

## Harness Integration

- **`harness validate`** — Run after every task. Mandatory. No task complete without passing.
- **`gather_context`** — PREPARE phase: load state, learnings, handoff, validation in one call.
- **`harness check-deps`** — Run when tasks add new imports/modules.
- **`harness state show`** — View current position and progress.
- **`harness state learn "<message>"`** — Append a learning from CLI.
- **State/Learnings files** — Session-scoped when session known, otherwise `.harness/`. State updated after every task; learnings append-only.
- **Roadmap sync** — After plan completion, `manage_roadmap sync` with `apply: true`. Mandatory when roadmap exists. No `force_sync: true`.
- **`emit_interaction`** — Auto-transition to harness-verification at plan completion.

## Success Criteria

- Every task executed in order, atomically, one commit per task
- `.harness/state.json` accurately reflects position and progress
- `.harness/learnings.md` has entries for sessions with non-trivial discoveries
- `harness validate` passes after every task
- Checkpoints honored: execution paused at every `[checkpoint:*]` marker
- No improvisation: tasks executed as written, or stopped with blocker reported
- All stopping conditions respected

## Rationalizations to Reject

| Rationalization                                                                                                | Reality                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The plan says to do X, but doing Y would be cleaner -- I will improvise"                                      | The Iron Law states: execute the plan as written. If the plan is wrong, stop and fix the plan. Improvising mid-execution introduces untested assumptions. |
| "This task depends on Task 3 which I know is done, so I can skip verifying prerequisites"                      | Prerequisites must be verified mechanically, not from memory. Check that dependency tasks are marked complete in state and that referenced files exist.   |
| "The checkpoint is just a confirmation step and the output looks correct, so I will auto-continue"             | Checkpoints are non-negotiable pause points. If a task has a checkpoint marker, execution must pause.                                                     |
| "Harness validate passed on the previous task and nothing changed structurally, so I can skip it for this one" | Validation runs after every task with no exceptions. Each task may introduce subtle architectural drift that only harness validate catches.               |

## Examples

### Example: Executing a 5-Task Notification Plan

**Session Start (fresh):**

```
Read plan: docs/plans/2026-03-14-notifications-plan.md (5 tasks)
Read state: .harness/state.json — not found (fresh start, Task 1)
Read learnings: .harness/learnings.md — not found
Run: harness validate — passes. Clean baseline.
```

**Task 1: Define notification types**

```
1. Create src/types/notification.ts with Notification interface
2. harness validate — passes
3. Commit: "feat(notifications): define Notification type"
4. Update state: { position: Task 2, progress: { "Task 1": "complete" } }
```

**Task 2: Create notification service (TDD)**

```
1. Write test: src/services/notification-service.test.ts
2. Run test: FAIL — NotificationService not defined (correct)
3. Implement: src/services/notification-service.ts
4. Run test: PASS
5. harness validate — passes
6. Commit: "feat(notifications): add NotificationService.create"
7. Update state: { position: Task 3, Tasks 1-2 complete }
```

**Task 3: Add list and expiry (TDD) — has checkpoint**

```
[checkpoint:human-verify] — "Tasks 1-2 complete. Tests pass. Continue to Task 3?"
Human: "Continue."
1. Write tests: list by userId, filter expired
2. Run tests: FAIL (not implemented)
3. Implement list() and isExpired()
4. Run tests: PASS
5. harness validate — passes
6. Commit: "feat(notifications): add list and expiry"
7. Append learning: [gotcha] Date comparison needed UTC normalization
```

**Context reset (resume at Task 4):**

```
Read state: position Task 4, Tasks 1-3 complete
Read learnings: "Date comparison needed UTC normalization"
harness validate — passes. Resume Task 4.
```

## Gates

Hard stops. Violating any gate means the process has broken down.

- **No execution without a plan.** If no plan exists, do not start. Use harness-planning.
- **No improvisation.** Execute as written. Do not add "improvements" not in the plan.
- **No skipping tasks.** Tasks are dependency-ordered. Execute in order.
- **No skipping validation.** `harness validate` after every task. No exceptions.
- **No ignoring checkpoints.** `[checkpoint:*]` markers require pausing. No auto-continue.
- **No guessing past blockers.** Cannot complete as written? Stop. Report. Do not invent workarounds.
- **State must be updated.** After every task, state must reflect new position.

## Escalation

- **Task fails, fix outside scope:** "Task N failed because [reason]. Fix requires changes to [outside scope]. Plan needs updating at Tasks [X, Y]."
- **Plan references missing files:** "Task N references [file] which does not exist. Plan may need regeneration."
- **Tests pass but behavior seems wrong:** "Task N passes all tests, but I notice [observation]. Should I investigate?"
- **State corrupted:** If state says Task 5 complete but code missing, report inconsistency. Re-verify from Task 1 if needed.
- **Human wants to skip ahead:** "Skipping Task N means Tasks [X, Y] may fail. Update the plan to remove the dependency?" Get explicit approval.

## Trace Output (Optional)

When `.harness/gate.json` has `"trace": true` or `--verbose` is passed, append to `.harness/trace.md`:

```markdown
**[PREPARE 14:32:07]** Loaded plan with 5 tasks, resuming from Task 3.
**[EXECUTE 14:32:15]** Task 3 committed; gate passed first attempt.
**[VERIFY 14:35:42]** Deep audit at milestone; all 3 levels passed.
**[PERSIST 14:35:50]** State updated, handoff written with 2 pending tasks.
```

For human debugging only. Not required for normal execution.
