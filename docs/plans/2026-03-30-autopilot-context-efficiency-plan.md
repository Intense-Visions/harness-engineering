# Plan: Autopilot Context Efficiency -- Skill Integration (Phase 2)

**Date:** 2026-03-30
**Spec:** docs/changes/context-efficiency-pipeline/proposal.md
**Phase:** 2 of 5 (Skill Integration -- Autopilot)
**Estimated tasks:** 7
**Estimated time:** 25 minutes

## Goal

The autopilot SKILL.md and skill.yaml instruct agents to parse `--fast`/`--thorough` rigor flags, offload bulky research to scratchpad, commit at checkpoint boundaries, and auto-recover on failure -- all using the foundation modules built in Phase 1.

## Observable Truths (Acceptance Criteria)

1. When `--fast` is passed to autopilot, the state file contains `"rigorLevel": "fast"` and the SKILL.md instructions tell agents to skip skeleton approval, skip scratchpad usage, and use minimal verification.
2. When `--thorough` is passed to autopilot, the state file contains `"rigorLevel": "thorough"` and the SKILL.md instructions tell agents to always require skeleton approval, use verbose scratchpad, and run full verification.
3. When no rigor flag is passed, the state file contains `"rigorLevel": "standard"` and default behavior applies.
4. The `skill.yaml` file declares `--fast` and `--thorough` as CLI arguments.
5. The autopilot-state.json schema (in SKILL.md) includes a `rigorLevel` field with `schemaVersion: 5`.
6. A "Rigor Behavior Table" section exists in SKILL.md defining behavior for all three levels across PLAN, APPROVE_PLAN, EXECUTE, and VERIFY states.
7. When a checkpoint passes verification during EXECUTE, the SKILL.md instructs the agent to call `commitAtCheckpoint()` with the checkpoint label.
8. When autopilot fails mid-phase, the SKILL.md instructs the agent to call `commitAtCheckpoint()` with `isRecovery: true` before surfacing the error.
9. When no uncommitted changes exist at a checkpoint boundary, the commit is skipped (documented in SKILL.md as the default behavior of `commitAtCheckpoint()`).
10. When the state machine transitions through PHASE_COMPLETE, the SKILL.md instructs the agent to call `clearScratchpad()` for the completed phase.
11. The EXECUTE and PLAN agent dispatch prompts include instructions for agents to write bulky research output to scratchpad via `writeScratchpad()` instead of keeping it in conversation context.
12. The rigor level is passed through to delegated agent prompts (planner, executor) so they can adjust their behavior accordingly.
13. `harness validate` passes after all changes.

## File Map

- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` (rigor flags, scratchpad, checkpoint commits, behavior table)
- MODIFY `agents/skills/claude-code/harness-autopilot/skill.yaml` (add --fast/--thorough args)

## Tasks

### Task 1: Add --fast and --thorough CLI args to skill.yaml

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-autopilot/skill.yaml`

1. Read `agents/skills/claude-code/harness-autopilot/skill.yaml`.
2. Add two new CLI args after the existing `review-plans` arg:

   ```yaml
   cli:
     command: harness skill run harness-autopilot
     args:
       - name: spec
         description: Path to approved spec document
         required: false
       - name: path
         description: Project root path
         required: false
       - name: review-plans
         description: Force human review of all plans (overrides auto-approve)
         required: false
       - name: fast
         description: Run with reduced rigor — skip skeleton approval, skip scratchpad, minimal verification
         required: false
       - name: thorough
         description: Run with maximum rigor — require skeleton approval, verbose scratchpad, full verification
         required: false
   ```

3. Run: `harness validate`
4. Commit: `feat(autopilot): add --fast and --thorough CLI args to skill.yaml`

---

### Task 2: Add rigorLevel to state schema and INIT flag parsing

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

This task modifies three sections of SKILL.md: the state schema in INIT step 4, the flag parsing in INIT step 5, and the schema migration in INIT step 3.

1. Read SKILL.md lines 1-140.

2. **In INIT step 3 (schema migration, ~line 64):** Add a new migration clause after the existing `schemaVersion < 4` block:

   Add after `Update schemaVersion to 4 and save.`:

   ```
   If `schemaVersion < 5`, set `rigorLevel` to `"standard"`. Update `schemaVersion` to `5` and save.
   ```

3. **In INIT step 4 (fresh start state JSON, ~line 76-107):** Update the schema:

   Change `"schemaVersion": 4,` to `"schemaVersion": 5,`.

   Add `"rigorLevel": "standard",` after the `"reviewPlans": false,` line.

4. **In INIT step 5 (flag parsing, ~line 109):** Replace the current step 5 content with:

   ```markdown
   5. **Parse session flags.** Check CLI arguments for session-level flags. These persist for the entire session -- resuming a session preserves the settings from when it was started (flags are only read on fresh start, not on resume).
      - `--review-plans`: Set `state.reviewPlans: true`.
      - `--fast`: Set `state.rigorLevel: "fast"`. Reduces rigor across all phases: skip skeleton approval, skip scratchpad, minimal verification.
      - `--thorough`: Set `state.rigorLevel: "thorough"`. Increases rigor across all phases: require skeleton approval, verbose scratchpad, full verification.
      - If neither `--fast` nor `--thorough` is passed, `rigorLevel` defaults to `"standard"`.
      - If both `--fast` and `--thorough` are passed, reject with error: "Cannot use --fast and --thorough together. Choose one."
   ```

5. Run: `harness validate`
6. Commit: `feat(autopilot): add rigorLevel to state schema and INIT flag parsing`

---

### Task 3: Add Rigor Behavior Table section

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

Add a new section between "Iron Law" and "Process" (after line ~35, before `## Process`).

1. Read SKILL.md lines 24-48.

2. Insert the following new section before `## Process` (line 36):

   ```markdown
   ## Rigor Levels

   The `rigorLevel` is set during INIT via `--fast` or `--thorough` flags and persists for the entire session. Default is `standard`.

   | State          | `fast`                                                                                 | `standard` (default)                                                    | `thorough`                                                                                                                 |
   | -------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
   | PLAN           | Pass `rigorLevel: fast` to planner. Planner skips skeleton pass.                       | Default planner behavior.                                               | Pass `rigorLevel: thorough` to planner. Planner always produces skeleton for approval.                                     |
   | APPROVE_PLAN   | Auto-approve all plans regardless of concern signals. Skip human review.               | Default signal-based approval logic.                                    | Force human review of all plans (equivalent to `--review-plans`).                                                          |
   | EXECUTE        | Skip scratchpad — agents keep research in conversation. Checkpoint commits still fire. | Agents use scratchpad for research >500 words. Checkpoint commits fire. | Verbose scratchpad — agents write all research, reasoning, and intermediate output to scratchpad. Checkpoint commits fire. |
   | VERIFY         | Minimal verification — run `harness validate` only. Skip detailed verification agent.  | Default verification pipeline.                                          | Full verification — run verification agent with expanded checks.                                                           |
   | PHASE_COMPLETE | Scratchpad clear is a no-op (nothing written).                                         | Clear scratchpad for completed phase.                                   | Clear scratchpad for completed phase.                                                                                      |

   When `rigorLevel` is `fast`, the APPROVE_PLAN concern signal evaluation is bypassed entirely — plans always auto-approve. When `rigorLevel` is `thorough`, it implicitly sets `reviewPlans: true` for the APPROVE_PLAN gate.
   ```

3. Run: `harness validate`
4. Commit: `feat(autopilot): add rigor behavior table to SKILL.md`

---

### Task 4: Integrate scratchpad into PLAN and EXECUTE agent prompts

**Depends on:** Task 3
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

This task modifies the agent dispatch prompts in PLAN and EXECUTE to include scratchpad instructions.

1. Read SKILL.md lines 160-370.

2. **In PLAN section (~line 168-185), update the planner agent dispatch prompt.** Add rigor level and scratchpad instructions to the prompt body. Replace the existing prompt block with:

   ```
   Agent tool parameters:
     subagent_type: "harness-planner"
     description: "Plan phase {N}: {name}"
     prompt: |
       You are running harness-planning for phase {N}: {name}.

       Spec: {specPath}
       Session directory: {sessionDir}
       Session slug: {sessionSlug}
       Phase description: {phase description from spec}
       Rigor level: {rigorLevel}

       On startup, call gather_context({ session: "{sessionSlug}" }) to load
       session-scoped learnings, state, and validation context.

       ## Scratchpad (if rigorLevel is not "fast")

       For bulky research output (spec analysis, codebase exploration notes,
       dependency analysis — anything >500 words), write to scratchpad instead
       of keeping in conversation:

         writeScratchpad({ session: "{sessionSlug}", phase: "{phaseName}", projectPath: "{projectPath}" }, "research-{topic}.md", content)

       Reference the scratchpad file path in your conversation instead of
       inlining the content. This keeps the planning context focused on
       decisions and task structure.

       Follow the harness-planning skill process exactly. Write the plan to
       docs/plans/{date}-{phase-name}-plan.md. Write {sessionDir}/handoff.json when done.
   ```

3. **In EXECUTE section (~line 322-341), update the execution agent dispatch prompt.** Replace the existing prompt block with:

   ```
   Agent tool parameters:
     subagent_type: "harness-task-executor"
     description: "Execute phase {N}: {name}"
     prompt: |
       You are running harness-execution for phase {N}: {name}.

       Plan: {planPath}
       Session directory: {sessionDir}
       Session slug: {sessionSlug}
       State: {sessionDir}/state.json
       Rigor level: {rigorLevel}

       On startup, call gather_context({ session: "{sessionSlug}" }) to load
       session-scoped learnings, state, and validation context.

       ## Scratchpad (if rigorLevel is not "fast")

       For bulky intermediate output (test output analysis, error investigation
       notes, dependency trees — anything >500 words), write to scratchpad:

         writeScratchpad({ session: "{sessionSlug}", phase: "{phaseName}", projectPath: "{projectPath}" }, "task-{N}-{topic}.md", content)

       Reference the scratchpad file path instead of inlining the content.

       Follow the harness-execution skill process exactly.
       Update {sessionDir}/state.json after each task.
       Write {sessionDir}/handoff.json when done or when blocked.
   ```

4. Run: `harness validate`
5. Commit: `feat(autopilot): integrate scratchpad into PLAN and EXECUTE agent prompts`

---

### Task 5: Integrate checkpoint commits into EXECUTE and retry logic

**Depends on:** Task 4
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

This task adds checkpoint commit instructions to the EXECUTE state and recovery commit to the retry failure path.

1. Read SKILL.md lines 319-366.

2. **In EXECUTE step 2 (~line 343-349), after "When the agent returns, check the outcome:"**, add a new sub-step before the existing bullet points:

   After the line `2. **When the agent returns, check the outcome:**` and before `- **All tasks complete:**`, insert:

   ```markdown
   - **After each checkpoint verification passes**, commit the work:
   ```

   commitAtCheckpoint({
   projectPath: "{projectPath}",
   session: "{sessionSlug}",
   checkpointLabel: "Checkpoint {N}: {checkpoint description}"
   })

   ```
   If the commit result shows `committed: false`, no changes existed — continue silently.
   ```

3. **In EXECUTE step 3 (retry logic, ~line 351-363), at the "If budget exhausted" block**, add a recovery commit step. After `- If budget exhausted:` and before `- **Stop.**`, insert:

   ````markdown
   - **Recovery commit:** Before stopping, commit any passing work:
     ```
     commitAtCheckpoint({
       projectPath: "{projectPath}",
       session: "{sessionSlug}",
       checkpointLabel: "Phase {N}: {name} — recovery at task {taskNumber}",
       isRecovery: true
     })
     ```
     This preserves all work completed before the failure. The `[autopilot][recovery]` prefix in the commit message distinguishes recovery commits from normal checkpoint commits.
   ````

4. Run: `harness validate`
5. Commit: `feat(autopilot): integrate checkpoint commits and recovery into EXECUTE`

---

### Task 6: Integrate scratchpad clear into PHASE_COMPLETE and rigor into APPROVE_PLAN/VERIFY

**Depends on:** Task 5
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

This task adds scratchpad cleanup at phase transitions and rigor-level branching to APPROVE_PLAN and VERIFY.

1. Read SKILL.md lines 208-400.

2. **In APPROVE_PLAN step 2 (~line 218), add rigor-level override.** Insert before the existing `shouldPauseForReview` evaluation:

   ```markdown
   **Rigor-level override:**

   - If `rigorLevel` is `"fast"`: Skip the signal evaluation entirely. Auto-approve the plan. Record decision as `"auto_approved_plan_fast"`. Transition directly to EXECUTE.
   - If `rigorLevel` is `"thorough"`: Force `shouldPauseForReview = true` regardless of other signals (equivalent to `--review-plans`).
   - If `rigorLevel` is `"standard"`: Proceed with normal signal evaluation below.
   ```

3. **In VERIFY step 1 (~line 370-388), add rigor-level branching.** Insert before the existing verification agent dispatch:

   ```markdown
   **Rigor-level branching:**

   - If `rigorLevel` is `"fast"`: Skip the verification agent entirely. Run only `harness validate`. If it passes, transition to REVIEW. If it fails, surface to user.
   - If `rigorLevel` is `"thorough"` or `"standard"`: Dispatch the verification agent as below.
   ```

4. **In PHASE_COMPLETE (~line 434), add scratchpad cleanup.** Insert as a new step after step 3 ("Mark phase as `complete` in state.") and before step 4 ("Sync roadmap."):

   ```markdown
   4. **Clear scratchpad for this phase.** Call `clearScratchpad({ session: sessionSlug, phase: phaseName, projectPath: projectPath })` to delete ephemeral research files for the completed phase. This frees disk space and prevents stale scratchpad data from leaking into future phases.
   ```

   Renumber the subsequent steps (old 4 becomes 5, old 5 becomes 6, etc. through the end of PHASE_COMPLETE).

5. Run: `harness validate`
6. Commit: `feat(autopilot): add scratchpad clear to PHASE_COMPLETE, rigor branching to APPROVE_PLAN and VERIFY`

---

### Task 7: Update Harness Integration, Success Criteria, and Examples sections

**Depends on:** Task 6
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Read SKILL.md lines 619-800.

2. **In the Harness Integration section (~line 619)**, add three new bullet points after the existing list:

   ```markdown
   - **Scratchpad** — Agents write bulky research output (>500 words) to `.harness/sessions/<slug>/scratchpad/<phase>/` via `writeScratchpad()` instead of keeping it in conversation context. Cleared automatically at phase transitions via `clearScratchpad()` in PHASE_COMPLETE. Skipped entirely when `rigorLevel` is `"fast"`.
   - **Checkpoint commits** — After each checkpoint verification passes in EXECUTE, `commitAtCheckpoint()` creates a commit with message `[autopilot] <label>`. On failure with retry budget exhausted, a recovery commit is created with `[autopilot][recovery] <label>`. Skipped silently when no changes exist.
   - **Rigor levels** — `--fast` / `--thorough` flags set `rigorLevel` in state during INIT. Persists for the entire session. Affects PLAN (skeleton skip/require), APPROVE_PLAN (auto-approve/force-review), EXECUTE (scratchpad usage), and VERIFY (minimal/full). See the Rigor Behavior Table for details.
   ```

3. **In the Success Criteria section (~line 630)**, add new criteria after the existing list:

   ```markdown
   - `--fast` skips skeleton approval, skips scratchpad, auto-approves plans, and runs minimal verification
   - `--thorough` requires skeleton approval, uses verbose scratchpad, forces plan review, and runs full verification
   - Scratchpad is cleared automatically at every phase transition (PHASE_COMPLETE)
   - Checkpoint commits fire after every passing checkpoint; recovery commits fire on retry budget exhaustion
   - Rigor level persists across session resume — set once during INIT, never changed mid-session
   ```

4. **In the Examples section (~line 642), update the first example** to show rigor usage. After the existing `**User invokes:**` line, add a second example invocation:

   ```markdown
   **Or with rigor flag:** `/harness:autopilot docs/changes/security-scanner/proposal.md --fast`

   **INIT (with --fast):**
   ```

   Read spec — found 3 phases:
   Phase 1: Core Scanner (complexity: low)
   Phase 2: Rule Engine (complexity: high)
   Phase 3: CLI Integration (complexity: low)
   Rigor level: fast
   Created .harness/sessions/changes--security-scanner--proposal/autopilot-state.json. Starting Phase 1.

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

   ```

5. Run: `harness validate`
6. Commit: `feat(autopilot): update integration docs, success criteria, and examples for context efficiency`

---

## Traceability Matrix

| Observable Truth                         | Delivered By                            |
| ---------------------------------------- | --------------------------------------- |
| 1. `--fast` sets rigorLevel in state     | Task 2 (INIT flag parsing)              |
| 2. `--thorough` sets rigorLevel in state | Task 2 (INIT flag parsing)              |
| 3. Default rigorLevel is "standard"      | Task 2 (state schema)                   |
| 4. skill.yaml declares --fast/--thorough | Task 1                                  |
| 5. Schema version 5 with rigorLevel      | Task 2                                  |
| 6. Rigor behavior table exists           | Task 3                                  |
| 7. Checkpoint commit after verification  | Task 5                                  |
| 8. Recovery commit on failure            | Task 5                                  |
| 9. Skip commit when no changes           | Task 5 (inherent in commitAtCheckpoint) |
| 10. clearScratchpad at PHASE_COMPLETE    | Task 6                                  |
| 11. Scratchpad in agent prompts          | Task 4                                  |
| 12. Rigor passed to delegated agents     | Task 4                                  |
| 13. harness validate passes              | Every task                              |
