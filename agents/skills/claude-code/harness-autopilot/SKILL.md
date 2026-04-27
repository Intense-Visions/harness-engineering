# Harness Autopilot

> Lightweight orchestrator — dispatches isolated phase-agents, tracks state, chains artifacts between phases. Delegates all planning/execution/verification/review to dedicated persona agents.

## When to Use

- After a multi-phase spec is approved and you want automated phase execution
- When a project has 2+ implementation phases requiring repeated skill invocations
- NOT for single-phase work (use harness-execution directly)
- NOT when the spec is not yet approved (use harness-brainstorming first)
- NOT for CI/headless execution (conversational skill)

## Persona Agents

| Skill                   | `subagent_type`         | State(s)             |
| ----------------------- | ----------------------- | -------------------- |
| harness-planning        | `harness-planner`       | PLAN                 |
| harness-execution       | `harness-task-executor` | EXECUTE              |
| harness-verification    | `harness-verifier`      | VERIFY               |
| **harness-integration** | **`harness-verifier`**  | **INTEGRATE**        |
| harness-code-review     | `harness-code-reviewer` | REVIEW, FINAL_REVIEW |

**Iron Law:** Autopilot delegates, never reimplements. If writing plan/execute/verify/review logic, STOP — delegate via `subagent_type`. Always use dedicated persona agents, never general-purpose agents.

## Rigor Levels

Set at INIT (`--fast` / `--thorough`); persists for session. Default: `standard`.

| State        | `fast`                     | `standard`            | `thorough`                    |
| ------------ | -------------------------- | --------------------- | ----------------------------- |
| PLAN         | Skip skeleton pass         | Default               | Always skeleton with approval |
| APPROVE_PLAN | Auto-approve, skip signals | Signal-based          | Force human review            |
| EXECUTE      | Skip scratchpad            | Scratchpad >500 words | Verbose scratchpad            |
| VERIFY       | `harness validate` only    | Full pipeline         | Expanded checks               |
| INTEGRATE    | WIRE only, auto-approve    | Full tier-appropriate | Full + human ADR review       |

## State Machine

```
INIT → ASSESS → PLAN → APPROVE_PLAN → EXECUTE → VERIFY → INTEGRATE → REVIEW → PHASE_COMPLETE
                                                                    │
                                                             [next phase?]
                                                              │           │
                                                           ASSESS   FINAL_REVIEW → DONE
```

---

### INIT

1. Resolve spec path (argument or prompt).
2. Derive session slug: strip `docs/`, drop `.md`, replace `/` and `.` with `--`, lowercase. Set `sessionDir = .harness/sessions/<slug>/`.
3. Check for existing state: read `{sessionDir}/autopilot-state.json`. If present and not DONE: report "Resuming from `{currentState}`, phase {N}: {name}." Apply schema migration if `schemaVersion < 5` (backfill missing fields). Jump to recorded state.
4. Fresh start: read spec, parse `## Implementation Order` for phases (`### Phase N: Name` + `<!-- complexity: low|medium|high -->`, default: `medium`). Capture `startingCommit` via `git rev-parse HEAD`. Write `autopilot-state.json` (schemaVersion: 5, currentState: "ASSESS", currentPhase: 0).
5. Flags: `--fast` → `rigorLevel: "fast"`. `--thorough` → `rigorLevel: "thorough"`. `--review-plans` → `reviewPlans: true`. Both flags together → reject with error.
6. Call `gather_context({ path, skill: "harness-autopilot", session: slug, include: ["state", "learnings", "handoff", "graph", "businessKnowledge", "sessions", "validation"] })`.
7. → ASSESS.

---

### ASSESS

1. Read current phase at `currentPhase`.
2. If `planPath` set and file exists: → APPROVE_PLAN.
3. **Intelligence-enhanced complexity assessment.** Before routing by complexity, refine the annotation with signals from available tools:
   - Run `predict_failures` on the phase domain to check if constraints are trending toward violation — high failure probability suggests upgrading complexity.
   - Run `compute_blast_radius` on files the phase is likely to touch — large blast radius (>15 affected modules) suggests upgrading to `high`.
   - If the orchestrator is running, request intelligence analysis via `POST /api/analyze` with the phase title/description to get CML complexity scores and PESL simulation results. Use CML `structuralComplexity > 0.7` or PESL `riskScore > 0.6` as triggers to upgrade complexity routing.
   - If no orchestrator, the MCP tool signals above are sufficient.
4. Complexity routing:
   - `low`/`medium`: auto-plan via harness-planner → PLAN.
   - `high`: pause. Instruct: "Run `/harness:planning` interactively, then re-invoke `/harness:autopilot`." Wait for re-invocation.
5. Update `currentState: "PLAN"`.

---

### PLAN

**Auto-plan (low/medium):** Dispatch harness-planner:

```
subagent_type: "harness-planner"
prompt: "Phase {N}: {name}. Spec: {specPath}. Session: {sessionSlug}. Rigor: {rigorLevel}. Follow harness-planning. Write plan to docs/plans/. Write {sessionDir}/handoff.json when done."
```

On return: read `planPath` from `{sessionDir}/handoff.json`. Complexity override check: `low` + tasks>10 or checkpoints>3 → `"medium"`; tasks>20 or checkpoints>6 → `"high"`. Update state `planPath`. → APPROVE_PLAN.

**Interactive plan (high):** Check for plan file at `docs/plans/*{phase-name}*` or `planPath` in handoff. If found: update `planPath` → APPROVE_PLAN. If not: remind and wait.

---

### APPROVE_PLAN

1. Gather: task count, checkpoint count, concerns from `{sessionDir}/handoff.json` (default `[]`).
2. `"fast"` → auto-approve, record `"auto_approved_plan_fast"`, → EXECUTE.
3. `"thorough"` → force `shouldPauseForReview = true`.
4. Signals (any true → pause; all false → auto-approve):
   - `reviewPlans: true`
   - `phase.complexity === "high"`
   - `phase.complexityOverride !== null`
   - Handoff `concerns` non-empty
   - Task count > 15
   - Knowledge gaps: `harness knowledge-pipeline --domain <phase-domain>` reports `totalGaps > 0` and `--fix` was not run during planning
5. **Auto-approve:** emit report (mode, complexity, concerns, task count). Record decision with signal snapshot in `decisions[]`. → EXECUTE.
6. **Pause:** show triggered signals. Ask "Approve? (yes / revise / skip phase / stop)." Record decision. Route accordingly.

---

### EXECUTE

Dispatch harness-task-executor:

```
subagent_type: "harness-task-executor"
prompt: "Phase {N}: {name}. Plan: {planPath}. Session: {sessionSlug}. Rigor: {rigorLevel}. Update {sessionDir}/state.json per task. Write {sessionDir}/handoff.json when done or blocked."
```

**Checkpoints:** `[checkpoint:human-verify]` → show output, confirm, resume. `[checkpoint:decision]` → present options, record choice, resume. `[checkpoint:human-action]` → instruct user, wait for confirmation, resume. After each passing checkpoint: `commitAtCheckpoint()`.

**Outcome:** All tasks complete → VERIFY. Task fails → retry logic:

- Attempt 1: read error, apply obvious fix, re-dispatch for failed task.
- Attempt 2: expand context — read related files, check `learnings.md`, re-dispatch.
- Attempt 3: full context — test output, imports, plan instructions, re-dispatch.
- Budget exhausted: recovery commit (`[autopilot][recovery]` prefix in message), record in `.harness/failures.md`. Ask: "fix manually and continue / revise plan / stop."

---

### VERIFY

- `"fast"`: run `harness validate`. Pass → INTEGRATE. Fail → surface to user.
- `"standard"`/`"thorough"`: dispatch harness-verifier:
  ```
  subagent_type: "harness-verifier"
  prompt: "Phase {N}: {name}. Session: {sessionSlug}. Rigor: {rigorLevel}. Verify and report pass/fail with findings."
  ```
  Pass → INTEGRATE. Fail → ask "fix / skip verification / stop." `fix`: re-enter EXECUTE (retry budget resets).

---

### INTEGRATE

1. Resolve tier: `max(plan.integrationTier, derived-from-execution)`. If tier escalated: notify human with "Tier escalated from `{planned}` to `{derived}`: {reason}."
2. Dispatch harness-integration skill:
   ```
   subagent_type: "harness-verifier"
   prompt: "Phase {N}: {name}. Session: {sessionSlug}. Tier: {tier}.
            Plan: {planPath}. Verify integration per harness-integration skill."
   ```
3. **Rigor interaction:**
   - `"fast"`: WIRE sub-phase only, auto-approve, no ADR drafting.
   - `"standard"`: Full tier-appropriate checks (WIRE + MATERIALIZE + UPDATE per tier).
   - `"thorough"`: Full checks + human reviews every ADR draft + force knowledge graph verification.
4. Pass → REVIEW.
5. Fail → report incomplete items. Ask "fix / skip integration / stop":
   - **fix:** re-enter EXECUTE with integration-specific fix tasks, then re-VERIFY, re-INTEGRATE.
   - **skip:** record decision in `decisions[]`, proceed to REVIEW (human override).
   - **stop:** save state and exit.

---

### REVIEW

Dispatch harness-code-reviewer:

```
subagent_type: "harness-code-reviewer"
prompt: "Phase {N}: {name}. Session: {sessionSlug}. Follow harness-code-review. Report findings (critical / important / suggestion)."
```

Persist findings to `{sessionDir}/phase-{N}-review.json`. No blocking → PHASE_COMPLETE. Blocking → ask "fix / override / stop." `fix`: re-enter EXECUTE. `override`: record decision in `decisions[]` → PHASE_COMPLETE.

---

### PHASE_COMPLETE

1. Present summary: name, tasks completed, retries used, verification result, integration report (`{sessionDir}/phase-{N}-integration.json`), review findings count, elapsed time.
2. Record in `history[]`: phase index, name, startedAt, completedAt, tasksCompleted, retriesUsed, verificationPassed, integrationPassed, reviewFindings.
3. Mark phase `complete` in state. Clear scratchpad: `clearScratchpad({ session, phase, projectPath })`.
4. Sync roadmap: `manage_roadmap sync apply:true` (skip if no roadmap; never `force_sync: true`).
5. Write session summary: `writeSessionSummary(projectPath, sessionSlug, { session, lastActive, skill: "harness-autopilot", phase, status, spec, plan, keyContext, nextStep })`.
6. More phases: "Phase {N} complete. Next: {N+1}: {name} ({complexity}). Continue? (yes / stop)." `yes` → increment `currentPhase`, reset `retryBudget`, → ASSESS. `stop` → save and exit.
7. No more phases: → FINAL_REVIEW.

---

### FINAL_REVIEW

1. Set `currentState: "FINAL_REVIEW"`, `finalReview.status: "in_progress"`.
2. Gather per-phase findings from `{sessionDir}/phase-{N}-review.json` files.
3. Dispatch harness-code-reviewer:
   ```
   subagent_type: "harness-code-reviewer"
   prompt: "Final cross-phase review. Diff: git diff {startingCommit}..HEAD. Session: {sessionSlug}. Prior findings: {collected}. Focus on cross-phase coherence: naming, duplicated utilities, architectural drift. Report findings (critical / important / suggestion)."
   ```
4. No blocking: store in `finalReview.findings`, set `"passed"` → DONE.
5. Blocking: ask "fix / override / stop."
   - `fix`: increment `finalReview.retryCount` (max 3). Dispatch harness-task-executor: "Fix these blocking findings: {findings with file, line, title}. Session: {sessionSlug}. Commit each fix atomically." Run `harness validate`. Re-run FINAL_REVIEW from step 1. If retryCount > 3: stop, record in `.harness/failures.md`.
   - `override`: record rationale in `decisions[]`. Set `"overridden"` → DONE.
   - `stop`: save state and exit (resumable).

---

### DONE

1. Present: total phases, tasks, retries, time, `finalReview.status` + findings count, any overridden findings.
2. Ask "Create a PR? (yes / no)."
3. Write final handoff to `{sessionDir}/handoff.json`. Append learnings to `.harness/learnings.md`. Call `promoteSessionLearnings(projectPath, sessionSlug)`. If learnings count > 30, suggest `harness learnings prune`.
4. If `docs/roadmap.md` exists: call `manage_roadmap update` to set feature done. Skip if not found.
5. Write final `writeSessionSummary()`. Set `currentState: "DONE"` in autopilot-state.json.

---

## Process

1. **INIT** — Resolve spec, derive session slug, check for existing state, parse phases.
2. **ASSESS** — Route by complexity: low/medium auto-plans, high pauses for interactive planning.
3. **PLAN → APPROVE** — Dispatch harness-planner, check approval signals, auto-approve or pause.
4. **EXECUTE** — Dispatch harness-task-executor with plan path, handle checkpoints and retries (max 3).
5. **VERIFY** — Dispatch harness-verifier, confirm code correctness and wiring.
6. **INTEGRATE** — Resolve integration tier, dispatch harness-integration, verify system wiring, knowledge materialization, and documentation per tier.
7. **REVIEW** — Dispatch harness-code-reviewer, fix blocking findings.
8. **PHASE_COMPLETE** — Summarize (including integration report), sync roadmap, loop to ASSESS for next phase or proceed to FINAL_REVIEW.
9. **FINAL_REVIEW → DONE** — Cross-phase review, offer PR creation, write final handoff.

---

## Harness Integration

- **State:** `{sessionDir}/autopilot-state.json` (orchestration) + `{sessionDir}/state.json` (task-level, written by harness-execution).
- **Handoff:** `{sessionDir}/handoff.json` — written by each delegated skill, read by next. Autopilot writes final handoff at DONE.
- **Checkpoint commits:** `commitAtCheckpoint()` after passing checkpoints. Recovery commits use `[autopilot][recovery]` prefix.
- **Scratchpad:** cleared at PHASE_COMPLETE via `clearScratchpad()`. Skipped at `rigorLevel: "fast"`.

---

## Gates

- **No reimplementing delegated skills.** Writing planning/execution/verification/review/integration logic → STOP. Delegate via `subagent_type`.
- **No executing without plan approval.** Every plan passes APPROVE_PLAN. No exceptions.
- **No skipping VERIFY, INTEGRATE, or REVIEW.** Human can override findings; steps cannot be skipped. INTEGRATE may be skipped only via explicit "skip" choice with decision recorded in `decisions[]`.
- **No infinite retries.** EXECUTE budget: 3 attempts. FINAL_REVIEW: 3 cycles. If exhausted, stop and surface.
- **No modifying state files manually.** If corrupted, start fresh.

## Escalation

- **Spec missing Implementation Order:** Cannot identify phases. Ask user to add phase annotations or provide roadmap.
- **Delegated skill fails to produce output:** Check `{sessionDir}/handoff.json`. Report and ask: retry or stop.
- **User wants to reorder phases mid-run:** Update `phases[]` (mark skipped, adjust `currentPhase`). Do not re-run completed phases.
- **Context limits approaching:** Persist state immediately. "State saved. Re-invoke `/harness:autopilot` to continue."
- **2 consecutive phase failures:** Suggest reviewing spec for systemic issues.

## Rationalizations to Reject

| Rationalization                                                         | Reality                                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| "Low complexity means I can skip APPROVE_PLAN"                          | Low complexity means auto-approval only when no signals fire. Signals override complexity.        |
| "I can inline planning logic instead of dispatching to harness-planner" | Iron Law. Autopilot delegates, never reimplements. No exceptions.                                 |
| "Retry budget exhausted but one more approach might work"               | 3-attempt budget prevents compounding failure. Exceeding it without human input is unrecoverable. |
| "Keeping research in conversation is faster than scratchpad"            | Scratchpad gated by rigor level. At standard/thorough, >500 words must go to scratchpad.          |
| "Plan auto-approved, so I can skip recording the decision"              | Every approval—auto or manual—is recorded in `decisions[]`. That array is the audit trail.        |

## Success Criteria

- All phases in the spec are executed in order with plan → execute → verify → integrate → review per phase
- Every plan approval is recorded in `decisions[]` (auto or manual)
- Retry budget (3 attempts) is enforced — exhausted retries surface to user, never silently continue
- FINAL_REVIEW runs on `startingCommit..HEAD` diff and catches cross-phase coherence issues
- State is persisted to `autopilot-state.json` after every state transition — re-invocation resumes correctly
- `harness validate` passes after every phase

## Examples

**Invocation:** `/harness:autopilot docs/changes/security-scanner/proposal.md`

**INIT:** 3 phases found: Phase 1: Core Scanner (low), Phase 2: Rule Engine (high), Phase 3: CLI Integration (low).

**Phase 1 — ASSESS → PLAN:** harness-planner dispatched. Returns plan: `docs/plans/2026-03-19-core-scanner-plan.md` (8 tasks).

**Phase 1 — APPROVE_PLAN (auto):** All signals false. "Auto-approved Phase 1: Core Scanner | auto | low | no concerns | 8 tasks."

**Phase 1 — EXECUTE:** harness-task-executor dispatched with plan path + session. 8 tasks complete. 2 checkpoint commits.

**Phase 1 — VERIFY:** harness-verifier dispatched. Pass. **REVIEW:** harness-code-reviewer. 0 blocking, 2 notes.

**Phase 1 — PHASE_COMPLETE:** "Phase 1 complete. Next: Phase 2: Rule Engine (high). Continue? → yes"

**Phase 2 — ASSESS:** High complexity. "Run `/harness:planning` interactively, then re-invoke." [User plans interactively. Re-invokes.]

**INIT (resume):** "Resuming from PLAN, phase 2: Rule Engine. Found plan: docs/plans/2026-03-19-rule-engine-plan.md"

**Phase 2 — APPROVE_PLAN (paused):** Complexity: high triggered. "Approve? → yes" **EXECUTE → VERIFY → REVIEW → PHASE_COMPLETE.** 14 tasks, 1 retry.

**Phase 3:** auto-plans and executes. **FINAL_REVIEW:** harness-code-reviewer on `startingCommit..HEAD`. 0 blocking, 1 warning. Passed.

**DONE:** 3 phases, 30 tasks, 1 retry. "Create PR? → yes"

**Retry exhaustion (during any phase):**

```
Task 4 fails → Retry 1/3: obvious fix applied, still fails
             → Retry 2/3: expanded context (related files + learnings), still fails
             → Retry 3/3: full context gather (test output + imports + plan), still fails
Budget exhausted. Recorded in .harness/failures.md.
Fix manually and continue / revise plan / stop?
```
