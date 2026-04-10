# Harness Autopilot

> Autonomous phase execution loop — chains planning, execution, verification, and review across multi-phase projects, pausing only at human decision points.

## When to Use

- After a multi-phase spec is approved and you want automated execution across all phases
- When a project has 2+ implementation phases that would require repeated manual skill invocations
- When you want the Ralph Loop pattern (fresh context per iteration, append-only learnings) at the phase level
- NOT for single-phase work (use harness-execution directly)
- NOT when the spec is not yet approved (use harness-brainstorming first)
- NOT for CI/headless execution (this is a conversational skill)

## Relationship to Other Skills

| Skill                | Persona (`subagent_type`) | Role                        |
| -------------------- | ------------------------- | --------------------------- |
| harness-planning     | `harness-planner`         | Phase plan creation         |
| harness-execution    | `harness-task-executor`   | Task-by-task implementation |
| harness-verification | `harness-verifier`        | Post-execution validation   |
| harness-code-review  | `harness-code-reviewer`   | Post-verification review    |

Autopilot orchestrates these persona agents — it never reimplements their logic. Each agent is dispatched via the Agent tool with the corresponding `subagent_type`, isolating it to the harness methodology.

## Iron Law

**Autopilot delegates, never reimplements.** If you find yourself writing planning logic, execution logic, or review logic inside the autopilot loop, STOP. Delegate to the dedicated persona agent.

**Always use dedicated persona agents, never general-purpose agents.** Every dispatch MUST target the specific harness persona. General-purpose agents see all globally registered skills and may use unrelated workflows.

- **Claude Code:** Use the Agent tool with `subagent_type` set to the persona name.
- **Gemini CLI:** Use `run_agent` targeting the persona by name, or `harness persona run <name>`.

**Plans are gated by concern signals.** When no signals fire, plans auto-approve with a structured report. When any signal fires, the plan pauses for human review (yes/revise/skip/stop). The `--review-plans` flag forces all plans to pause.

## Rigor Levels

Set during INIT via `--fast` or `--thorough` flags; persists for the entire session. Default: `standard`.

| State          | `fast`                                   | `standard`                         | `thorough`                              |
| -------------- | ---------------------------------------- | ---------------------------------- | --------------------------------------- |
| PLAN           | Skip skeleton pass                       | Default behavior                   | Always produce skeleton for approval    |
| APPROVE_PLAN   | Auto-approve all plans, skip signals     | Signal-based approval              | Force human review (= `--review-plans`) |
| EXECUTE        | Skip scratchpad; checkpoint commits fire | Scratchpad for research >500 words | Verbose scratchpad for all research     |
| VERIFY         | `harness validate` only, skip agent      | Default verification pipeline      | Full verification with expanded checks  |
| PHASE_COMPLETE | Scratchpad clear is a no-op              | Clear scratchpad                   | Clear scratchpad                        |

## Process

### State Machine

```
INIT -> ASSESS -> PLAN -> APPROVE_PLAN -> EXECUTE -> VERIFY -> REVIEW -> PHASE_COMPLETE
                                                                         |
                                                                   [next phase?]
                                                                    |         |
                                                                 ASSESS   FINAL_REVIEW -> DONE
```

---

### INIT — Load Spec and Restore State

1. **Resolve spec path.** Provided as argument, or ask the user.

2. **Derive session slug and directory:**
   - Strip `docs/` prefix if present, drop `.md`, replace `/` and `.` with `--`, lowercase.
   - Set `sessionDir = .harness/sessions/<slug>/`. Create if needed.

3. **Check for existing state.** Read `{sessionDir}/autopilot-state.json`. If it exists and `currentState` is not `DONE`:
   - **Schema migration:** If `schemaVersion < 3`, backfill: `startingCommit` from earliest commit in `history` (or HEAD), `decisions: []`, `finalReview: { "status": "pending", "findings": [], "retryCount": 0 }`. If `< 4`, set `reviewPlans: false`. If `< 5`, set `rigorLevel: "standard"`. Update `schemaVersion` to `5`.
   - Report: "Resuming autopilot from state `{currentState}`, phase {currentPhase}: {phaseName}."
   - Skip steps 4-5 (fresh start only). Jump to recorded `currentState`.

4. **Fresh start (no existing state):**
   - Read spec. Parse `## Implementation Order` for phases (`### Phase N: Name`).
   - Extract phase name and complexity annotation (`<!-- complexity: low|medium|high -->`, default: `medium`).
   - Capture `startingCommit` via `git rev-parse HEAD`.
   - Create `{sessionDir}/autopilot-state.json`:
     ```json
     {
       "schemaVersion": 5,
       "sessionDir": ".harness/sessions/<slug>",
       "specPath": "<path>",
       "startingCommit": "<HEAD>",
       "reviewPlans": false,
       "rigorLevel": "standard",
       "currentState": "ASSESS",
       "currentPhase": 0,
       "phases": [
         {
           "name": "<name>",
           "complexity": "<level>",
           "complexityOverride": null,
           "planPath": null,
           "status": "pending"
         }
       ],
       "retryBudget": { "maxAttempts": 3, "currentTask": null },
       "history": [],
       "decisions": [],
       "finalReview": { "status": "pending", "findings": [], "retryCount": 0 }
     }
     ```

5. **Parse session flags** (fresh start only; resume preserves original settings):
   - `--review-plans`: Set `state.reviewPlans: true`.
   - `--fast`: Set `rigorLevel: "fast"`. Skips skeleton approval, scratchpad, forces auto-approve, minimal verification.
   - `--thorough`: Set `rigorLevel: "thorough"`. Requires skeleton approval, verbose scratchpad, forces plan review, full verification.
   - Default: `"standard"`. If both `--fast` and `--thorough` passed, reject with error.

6. **Load context via gather_context:**

   ```json
   gather_context({ path: "<project-root>", intent: "Autopilot for <spec>", skill: "harness-autopilot", session: "<slug>", include: ["state", "learnings", "handoff", "validation"] })
   ```

   Loads session-scoped learnings, handoff, state, and validation in one call. Note relevant learnings or dead ends for the current phase.

7. **Cold start orientation.** If resuming, call `loadSessionSummary()` for quick context (~200 tokens). Skip on first run.

8. **Load roadmap context.** If `docs/roadmap.md` exists, read for current priorities, blockers, and milestone status. Skip if absent.

9. **Transition to ASSESS.**

---

### ASSESS — Determine Phase Approach

1. Read current phase from state at index `currentPhase`.
2. If `planPath` is set and file exists, skip to `APPROVE_PLAN`.
3. **Evaluate complexity** (use `complexityOverride` if set):

   | Complexity | Action                                                                               |
   | ---------- | ------------------------------------------------------------------------------------ |
   | `low`      | Auto-plan via `harness-planner`. Proceed to PLAN.                                    |
   | `medium`   | Auto-plan via `harness-planner`. Proceed to PLAN with extra scrutiny note.           |
   | `high`     | Pause. Tell user to run `/harness:planning` interactively, then re-invoke autopilot. |

4. Update state: `currentState: "PLAN"`.

---

### PLAN — Generate or Await Plan

**Auto-planning (low/medium):**

1. Dispatch planning agent:

   ```
   Agent tool parameters:
     subagent_type: "harness-planner"
     description: "Plan phase {N}: {name}"
     prompt: |
       You are running harness-planning for phase {N}: {name}.
       Spec: {specPath}  Session: {sessionDir} / {sessionSlug}
       Phase description: {from spec}  Rigor level: {rigorLevel}

       On startup, call gather_context({ session: "{sessionSlug}" }).

       ## Scratchpad (if rigorLevel is not "fast")
       For bulky research (>500 words), write to scratchpad:
         writeScratchpad({ session: "{sessionSlug}", phase: "{phaseName}", projectPath: "{projectPath}" }, "research-{topic}.md", content)
       Reference the scratchpad file path in your conversation instead of inlining the content.

       Follow harness-planning exactly. Write plan to docs/plans/{date}-{phase-name}-plan.md.
       Write {sessionDir}/handoff.json when done.
   ```

2. When agent returns:
   - Read plan path from `{sessionDir}/handoff.json`.
   - **Complexity override check:** Count tasks and `[checkpoint:*]` markers. If `low` AND (`tasks > 10` OR `checkpoints > 3`): override to `"medium"`. If `low` AND (`tasks > 20` OR `checkpoints > 6`): override to `"high"`.
   - Update state: set `planPath`. Transition to `APPROVE_PLAN`.

**Awaiting interactive plan (high):**

1. Check for plan file matching `docs/plans/*{phase-name}*` or `{sessionDir}/handoff.json`.
2. If found: update `planPath`, transition to `APPROVE_PLAN`.
3. If not: remind user and wait.

---

### APPROVE_PLAN — Conditional Review Gate

1. **Gather plan metadata:** phase name/number, task count, checkpoint count, estimated time (tasks x 3 min), effective complexity, concerns from handoff (`{sessionDir}/handoff.json` `concerns` field, default `[]`).

2. **Rigor override:**
   - `"fast"`: Skip signal evaluation. Auto-approve. Record `"auto_approved_plan_fast"`. Go to EXECUTE.
   - `"thorough"`: Force `shouldPauseForReview = true`.
   - `"standard"`: Normal signal evaluation below.

3. **Evaluate `shouldPauseForReview`.** If **any** signal is true, pause. If **all** false, auto-approve.

   | #   | Signal               | Condition                           | Description                          |
   | --- | -------------------- | ----------------------------------- | ------------------------------------ |
   | 1   | `reviewPlans`        | `state.reviewPlans === true`        | `--review-plans` flag                |
   | 2   | `highComplexity`     | `phase.complexity === "high"`       | High complexity in spec              |
   | 3   | `complexityOverride` | `phase.complexityOverride !== null` | Planner exceeded expected complexity |
   | 4   | `plannerConcerns`    | Handoff `concerns` non-empty        | Planner flagged risks                |
   | 5   | `taskCount`          | Plan has > 15 tasks                 | Large plan                           |

4. **Signal evaluation result** (for reporting):

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

5. **Auto-approve (no signals fired):**
   - Emit report: `Auto-approved Phase N: {name}` with review mode, complexity, concerns, task count.
   - Record decision in `decisions` array with signal snapshot.
   - Transition to EXECUTE.

6. **Pause for review (signals fired):**
   - Emit report showing triggered signals.
   - Present plan summary. Ask: "Approve? (yes / revise / skip phase / stop)"
     - **yes** -> EXECUTE. **revise** -> user edits, re-present. **skip phase** -> mark `skipped`, PHASE_COMPLETE. **stop** -> save and exit.
   - Record decision with actual value: `approved_plan`, `revised_plan`, `skipped_phase`, `stopped`.

7. Update state with next `currentState` and save.

---

### EXECUTE — Run the Plan

1. **Dispatch execution agent:**

   ```
   Agent tool parameters:
     subagent_type: "harness-task-executor"
     description: "Execute phase {N}: {name}"
     prompt: |
       You are running harness-execution for phase {N}: {name}.
       Plan: {planPath}  Session: {sessionDir} / {sessionSlug}
       State: {sessionDir}/state.json  Rigor level: {rigorLevel}

       On startup, call gather_context({ session: "{sessionSlug}" }).

       ## Scratchpad (if rigorLevel is not "fast")
       For bulky output (>500 words), write to scratchpad:
         writeScratchpad({ session: "{sessionSlug}", phase: "{phaseName}", projectPath: "{projectPath}" }, "task-{N}-{topic}.md", content)
       Reference the scratchpad file path in your conversation instead of inlining the content.

       Follow harness-execution exactly. Update {sessionDir}/state.json after each task.
       Write {sessionDir}/handoff.json when done or blocked.
   ```

2. **Check outcome:**
   - **After each checkpoint passes**, commit: `commitAtCheckpoint({ projectPath, session, checkpointLabel })`. If `committed: false`, continue silently.
   - **All tasks complete:** Transition to VERIFY.
   - **Checkpoint reached:** Surface to user. Handle by type:
     - `[checkpoint:human-verify]` — Show output, ask for confirmation, then resume execution agent.
     - `[checkpoint:decision]` — Present options, record choice, resume execution agent.
     - `[checkpoint:human-action]` — Instruct user, wait for confirmation, resume execution agent.
   - **Task failed:** Enter retry logic.

3. **Retry logic (3 attempts):**
   - Increment `attemptsUsed`. Record the attempt (timestamp, error, fix attempted, result).
   - **Attempt 1:** Read error, apply obvious fix, re-dispatch for failed task.
   - **Attempt 2:** Expand context — read related files, check `learnings.md`, re-dispatch.
   - **Attempt 3:** Full context gather — test output, imports, plan instructions. Re-dispatch.
   - **Budget exhausted:**
     - Recovery commit: `commitAtCheckpoint({ ..., checkpointLabel: "Phase {N}: {name} — recovery at task {T}", isRecovery: true })`. Preserves work before failure. `[autopilot][recovery]` prefix distinguishes from normal commits.
     - Stop. Present all 3 attempts. Record in `.harness/failures.md`.
     - Ask: "How to proceed? (fix manually and continue / revise plan / stop)"

4. Update state after each execution cycle.

---

### VERIFY — Post-Execution Validation

1. **Rigor branching:**
   - `"fast"`: Skip agent. Run `harness validate` only. Pass -> REVIEW. Fail -> surface to user.
   - `"standard"` / `"thorough"`: Dispatch verification agent.

2. **Dispatch verification agent:**

   ```
   Agent tool parameters:
     subagent_type: "harness-verifier"
     description: "Verify phase {N}: {name}"
     prompt: |
       You are running harness-verification for phase {N}: {name}.
       Session: {sessionDir} / {sessionSlug}
       On startup, call gather_context({ session: "{sessionSlug}" }).
       Follow harness-verification exactly. Report pass/fail with findings.
   ```

3. **Outcome:**
   - **Pass:** Transition to REVIEW.
   - **Failures:** Surface to user. Ask: "Fix before review? (fix / skip verification / stop)"
     - **fix** -> re-enter EXECUTE (retry budget resets). **skip** -> record in `decisions`, proceed with warnings. **stop** -> save and exit.

4. Update state: `currentState: "REVIEW"`.

---

### REVIEW — Code Review

1. **Dispatch review agent:**

   ```
   Agent tool parameters:
     subagent_type: "harness-code-reviewer"
     description: "Review phase {N}: {name}"
     prompt: |
       You are running harness-code-review for phase {N}: {name}.
       Session: {sessionDir} / {sessionSlug}
       On startup, call gather_context({ session: "{sessionSlug}" }).
       Follow harness-code-review exactly. Report findings (blocking / warning / note).
   ```

2. **Outcome:**
   - **Persist findings** to `{sessionDir}/phase-{N}-review.json` (consumed by FINAL_REVIEW).
   - **No blocking:** Report summary, transition to PHASE_COMPLETE.
   - **Blocking:** Surface to user. Ask: "Address before completing? (fix / override / stop)"
     - **fix** -> re-enter EXECUTE. **override** -> record decision, PHASE_COMPLETE. **stop** -> save and exit.

3. Update state: `currentState: "PHASE_COMPLETE"`.

---

### PHASE_COMPLETE — Summary and Transition

1. **Present phase summary:** name, tasks completed, retries used, verification result, review findings count, elapsed time.

2. **Record in history:**

   ```json
   {
     "phase": 0,
     "name": "<name>",
     "startedAt": "<ts>",
     "completedAt": "<now>",
     "tasksCompleted": 8,
     "retriesUsed": 1,
     "verificationPassed": true,
     "reviewFindings": { "blocking": 0, "warning": 1, "note": 3 }
   }
   ```

3. Mark phase `complete` in state.

4. **Clear scratchpad:** `clearScratchpad({ session, phase, projectPath })`. Frees disk space and prevents stale data leaking into future phases.

5. **Sync roadmap.** If `docs/roadmap.md` exists, call `manage_roadmap` with `sync` and `apply: true`. If unavailable, fall back to `syncRoadmap()` from core and warn. Skip if no roadmap. Never use `force_sync: true`.

6. **Write session summary:**

   ```json
   writeSessionSummary(projectPath, sessionSlug, { session: "<slug>", lastActive: "<ts>", skill: "harness-autopilot", phase: "<N> of <total>", status: "Phase <N> complete. <done>/<total> tasks.", spec: "<path>", plan: "<plan path>", keyContext: "<summary>", nextStep: "<next>" })
   ```

7. **Check for next phase:**
   - More phases: "Phase {N} complete. Next: Phase {N+1}: {name} (complexity: {level}). Continue? (yes / stop)"
     - **yes** -> increment `currentPhase`, reset `retryBudget`, transition to ASSESS.
     - **stop** -> save and exit.
   - No more phases: Transition to FINAL_REVIEW.

---

### FINAL_REVIEW — Project-Wide Code Review

> Reviews cumulative diff (`startingCommit..HEAD`) across all phases to catch cross-phase issues before the PR offer.

1. Update state: `currentState: "FINAL_REVIEW"`. Set `finalReview.status: "in_progress"`.

2. **Gather per-phase review findings** from `{sessionDir}/phase-{N}-review.json` files.

3. **Dispatch review agent:**

   ```
   Agent tool parameters:
     subagent_type: "harness-code-reviewer"
     description: "Final review: cross-phase coherence check"
     prompt: |
       You are running harness-code-review as a final project-wide review.
       Diff scope: git diff {startingCommit}..HEAD
       Session: {sessionDir} / {sessionSlug}
       On startup, call gather_context({ session: "{sessionSlug}" }).

       ## Per-Phase Review Findings
       {collected findings}
       Don't assume these are resolved — verify. Focus on cross-phase coherence:
       naming consistency, duplicated utilities, architectural drift.

       Review the FULL diff (startingCommit..HEAD). Report findings (blocking / warning / note).
   ```

4. **Outcome:**
   - **No blocking:** Store findings in `finalReview.findings`. Set status `"passed"`. Transition to DONE.
   - **Blocking:** Store findings. Surface to user. Ask: "Address before completing? (fix / override / stop)"
     - **fix** -> Increment `finalReview.retryCount`. If `<= 3`: dispatch fix agent, run `harness validate`, re-run FINAL_REVIEW from step 1. If `> 3`: stop, record in `.harness/failures.md`.
       Fix dispatch:
       ```
       Agent tool parameters:
         subagent_type: "harness-task-executor"
         description: "Fix final review findings"
         prompt: |
           Fix these blocking findings (one task per finding):
           {findings with file, line, title, rationale}
           Session: {sessionDir} / {sessionSlug}
           Follow harness-execution. Commit each fix atomically.
           Write {sessionDir}/handoff.json when done.
       ```
     - **override** -> Record rationale in `decisions`. Set status `"overridden"`. Transition to DONE.
     - **stop** -> Save and exit. Resumable from FINAL_REVIEW.

5. Update state after each step.

---

### DONE — Final Summary

1. **Present project summary:** total phases, total tasks, total retries, total time, final review result (`finalReview.status` + findings count), any overridden findings.

2. **Offer:** "Create a PR? (yes / no)" If yes, assemble commit history, suggest PR title/description.

3. **Write final handoff** to `{sessionDir}/handoff.json`:

   ```json
   {
     "fromSkill": "harness-autopilot",
     "phase": "DONE",
     "summary": "Completed {N} phases with {M} tasks",
     "completed": ["Phase 1: ..."],
     "pending": [],
     "concerns": [],
     "decisions": ["<all>"],
     "contextKeywords": ["<from spec>"],
     "finalReview": { "status": "<passed|overridden>", "findingsCount": "<N>" }
   }
   ```

4. **Append learnings** to `.harness/learnings.md`:

   ```
   ## {date} — Autopilot: {spec name}
   - [skill:harness-autopilot] [outcome:complete] Executed {N} phases, {M} tasks, {R} retries
   - [skill:harness-autopilot] [outcome:observation] {notable patterns}
   ```

5. **Promote session learnings to global.** Call `promoteSessionLearnings(projectPath, sessionSlug)` to move generalizable learnings (`[outcome:gotcha]`, `[outcome:decision]`, `[outcome:observation]`) to global `learnings.md`. Report counts.

6. **Check pruning threshold.** Call `countLearningEntries(projectPath)`. If > 30, suggest `harness learnings prune`.

7. **Update roadmap to done.** If `docs/roadmap.md` exists and spec maps to a feature, call `manage_roadmap` with `update` to set status `done`. Derive feature name from spec H1 or handoff summary. If unavailable, fall back to `updateFeature()` and warn. Skip if no roadmap or feature not found. Never use `force_sync: true`.

8. **Write final session summary:**

   ```json
   writeSessionSummary(projectPath, sessionSlug, { session: "<slug>", lastActive: "<ts>", skill: "harness-autopilot", status: "DONE. <phases> phases, <tasks> tasks.", spec: "<path>", keyContext: "<summary>", nextStep: "All phases complete. Create PR or close session." })
   ```

9. Set `currentState: "DONE"` in autopilot-state.json. Do not delete — it serves as a record.

## Harness Integration

- **`harness validate`** — Run during INIT for project health. Included in every execution task via harness-execution delegation.
- **`gather_context`** — INIT loads learnings, state, handoff, and validation in a single call.
- **`harness check-deps`** — Delegated to harness-execution (in task steps).
- **State file** — `{sessionDir}/autopilot-state.json` tracks orchestration state. `{sessionDir}/state.json` tracks task-level execution (managed by harness-execution). Slug derived from spec path in INIT.
- **Handoff** — `{sessionDir}/handoff.json` written by each delegated skill, read by the next. Autopilot writes final handoff on DONE.
- **Learnings** — `.harness/learnings.md` (global) appended by delegated skills and autopilot. On DONE, session learnings promoted via `promoteSessionLearnings`. If count > 30, suggest pruning.
- **Roadmap context** — INIT reads `docs/roadmap.md` (if present) for priorities, blockers, milestones.
- **Roadmap sync** — PHASE_COMPLETE: `manage_roadmap sync` with `apply: true`. DONE: `manage_roadmap update` to `done`. Both skip silently without roadmap. Neither uses `force_sync: true`.
- **Scratchpad** — Agents write bulky research (>500 words) to `{sessionDir}/scratchpad/<phase>/` via `writeScratchpad()`. Cleared at phase transitions via `clearScratchpad()`. Skipped when `rigorLevel` is `"fast"`.
- **Checkpoint commits** — `commitAtCheckpoint()` creates `[autopilot] <label>` commits after passing checkpoints. Recovery commits use `[autopilot][recovery]` prefix. Skipped when no changes exist.
- **Rigor levels** — `--fast`/`--thorough` set `rigorLevel` in INIT, persists for session. Affects PLAN, APPROVE_PLAN, EXECUTE, VERIFY. See Rigor Levels table.

## Success Criteria

- Single `/harness:autopilot` invocation executes all phases through completion
- Resume from any state via session-scoped `autopilot-state.json`
- Low-complexity phases auto-plan; high-complexity phases pause for interactive planning
- Planning override bumps complexity when task signals disagree
- Retry budget (3 attempts) with escalating context before surfacing failures
- Existing skills (planning, execution, verification, review) unchanged
- Plans auto-approve when no signals fire; pause when any signal fires
- `--review-plans` forces human review for all plans
- Phase completion summary shown between every phase
- `--fast` skips skeleton, scratchpad, auto-approves, minimal verification
- `--thorough` requires skeleton, verbose scratchpad, forces review, full verification
- Scratchpad cleared at every phase transition
- Checkpoint commits after every passing checkpoint; recovery commits on budget exhaustion
- Rigor level persists across resume — set once in INIT, never changed mid-session

## Rationalizations to Reject

| Rationalization                                                                                     | Reality                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "This phase is low complexity, so I can skip the APPROVE_PLAN gate entirely"                        | Low complexity only means auto-approval when no concern signals fire. If the planner flagged concerns, produced a complexity override, or task count exceeds 15, the gate pauses regardless of spec annotation. |
| "I can write the planning logic inline instead of dispatching to the harness-planner persona agent" | The Iron Law is explicit: autopilot delegates, never reimplements. Using a general-purpose agent or inlining planning logic bypasses the harness methodology.                                                   |
| "The retry budget is exhausted but I can try one more approach before stopping"                     | The 3-attempt retry budget exists because each failed attempt degrades context and compounds risk. Exceeding the budget without human input turns a recoverable failure into an unrecoverable one.              |
| "I will skip the scratchpad since keeping research in conversation is faster"                       | Scratchpad is gated by rigor level. At standard or thorough, bulky research (>500 words) must go to scratchpad to keep agent conversation focused on decisions.                                                 |
| "The plan auto-approved, so I can skip recording the decision in the decisions array"               | Every plan approval -- auto or manual -- must be recorded with its signal evaluation. The decisions array is the audit trail that explains why a plan was approved.                                             |

## Examples

### Example: 3-Phase Security Scanner

**User invokes:** `/harness:autopilot docs/changes/security-scanner/proposal.md`
**Or with rigor flag:** `/harness:autopilot docs/changes/security-scanner/proposal.md --fast`

**INIT (with --fast):**

```
Read spec — 3 phases:
  Phase 1: Core Scanner (low)  Phase 2: Rule Engine (high)  Phase 3: CLI Integration (low)
Rigor level: fast. Starting Phase 1.
```

**Phase 1 — APPROVE_PLAN (fast mode):**

```
Auto-approved Phase 1: Core Scanner (fast mode — signal evaluation skipped)
```

**Phase 1 — EXECUTE (checkpoint commit):**

```
[harness-task-executor executes 8 tasks]
Checkpoint 1: types and interfaces — committed (abc1234)
Checkpoint 2: core implementation — committed (def5678)
Checkpoint 3: tests and validation — nothing to commit (skipped)
```

**INIT (standard):**

```
Read spec — 3 phases:
  Phase 1: Core Scanner (low)  Phase 2: Rule Engine (high)  Phase 3: CLI Integration (low)
Starting Phase 1.
```

**Phase 1 — ASSESS:** `Phase 1: Core Scanner — low complexity. Auto-planning.`

**Phase 1 — PLAN:**

```
[harness-planner runs]
Plan: docs/plans/2026-03-19-core-scanner-plan.md (8 tasks, ~24 min)
```

**Phase 1 — APPROVE_PLAN:**

```
Auto-approved Phase 1: Core Scanner
  Review mode: auto | Complexity: low (no override) | Concerns: none | Tasks: 8 (threshold: 15)
```

**Phase 1 — EXECUTE -> VERIFY -> REVIEW:**

```
[harness-task-executor: 8 tasks pass]
[harness-verifier: pass]
[harness-code-reviewer: 0 blocking, 2 notes]
```

**Phase 1 — PHASE_COMPLETE:**

```
Phase 1: Core Scanner — COMPLETE
Tasks: 8/8 | Retries: 0 | Verification: pass | Review: 0 blocking
Next: Phase 2: Rule Engine (high). Continue? (yes / stop) -> "yes"
```

**Phase 2 — ASSESS:**

```
Phase 2: Rule Engine — high complexity.
Requires interactive planning. Run /harness:planning, then re-invoke /harness:autopilot.
```

**[User runs /harness:planning interactively, produces plan]**
**User re-invokes:** `/harness:autopilot`

**INIT (resume):**

```
Resuming from state PLAN, phase 2: Rule Engine.
Found plan: docs/plans/2026-03-19-rule-engine-plan.md
```

**Phase 2 — APPROVE_PLAN:**

```
Pausing for review -- Phase 2: Rule Engine
  Complexity: high (triggered) | Concerns: none | Tasks: 14 (threshold: 15)
Approve? (yes / revise / skip / stop) -> "yes"
```

**Phase 2 — EXECUTE -> VERIFY -> REVIEW -> PHASE_COMPLETE:**

```
Phase 2: Rule Engine — COMPLETE
Tasks: 14/14 | Retries: 1 | Verification: pass | Review: 0 blocking
Next: Phase 3: CLI Integration (low). Continue? -> "yes"
```

**Phase 3 — [auto-plans, executes, completes]**

**FINAL_REVIEW:**

```
[harness-code-reviewer: cross-phase review on startingCommit..HEAD]
Final review: 0 blocking, 1 warning. Passed.
```

**DONE:**

```
All phases complete. Total: 3 phases, 30 tasks, 1 retry.
Final review: passed (0 blocking, 1 warning). Create a PR? (yes / no) -> "yes"
```

### Example: Retry Budget Exhaustion

**During Phase 1 — EXECUTE:**

```
Task 4: wire parser — FAILED (Type error in parser.ts:42 — missing generic parameter)
Retry 1/3: Added generic parameter to parseRule<T>. Re-running...
  FAILED (expected 3 rules, got 0)
Retry 2/3: Expanded context — read rule-loader.ts, checked learnings. Fixed import path.
  FAILED (Test timeout after 5000ms)
Retry 3/3: Full context — re-read plan, found missing async/await.
  PASSED. Continuing execution...
```

**If all 3 retries fail:**

```
Task 4: wire parser — FAILED (budget exhausted)
  Attempt 1: Added generic parameter -> Type error persists
  Attempt 2: Fixed import path -> Tests still timeout
  Attempt 3: Added async/await -> connection refused
Recorded in .harness/failures.md.
How to proceed? (fix manually and continue / revise plan / stop)
```

## Gates

- **No reimplementing delegated skills.** Autopilot orchestrates. If you are writing planning, execution, verification, or review logic, STOP. Delegate via `subagent_type`.
- **No executing without plan approval.** Every plan passes APPROVE_PLAN. No signals -> auto-approve with report. Any signal -> human review. `--review-plans` forces all to pause. No plan reaches EXECUTE without passing this gate.
- **No skipping VERIFY or REVIEW.** Every phase goes through both. The human can override findings, but the steps cannot be skipped.
- **No infinite retries.** The retry budget is 3 attempts. If exhausted, STOP and surface to human. Do not extend without explicit instruction.
- **No modifying session state files manually.** State files are managed by the skill. If corrupted, start fresh rather than patching.

## Escalation

- **When the spec has no Implementation Order section:** Cannot identify phases. Ask user to add phase annotations or provide a roadmap file.
- **When a delegated skill fails to produce expected output:** Check `{sessionDir}/handoff.json`. If agent failed, report and ask whether to retry the phase step or stop.
- **When the user wants to reorder phases mid-run:** Update phases array in autopilot-state.json (mark skipped, adjust currentPhase). Do not re-run completed phases.
- **When context limits are approaching:** Persist state immediately. "Context limit approaching. State saved. Re-invoke /harness:autopilot to continue."
- **When multiple phases fail in sequence:** After 2 consecutive phase failures (budget exhausted in both), suggest reviewing the spec for systemic issues.
