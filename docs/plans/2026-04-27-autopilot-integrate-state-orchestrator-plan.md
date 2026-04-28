# Plan: Autopilot INTEGRATE State and Orchestrator Template

**Date:** 2026-04-27 | **Spec:** docs/changes/integration-phase/proposal.md (Phase 3) | **Tasks:** 6 | **Time:** ~25 min

## Goal

Wire the INTEGRATE state into the autopilot state machine between VERIFY and REVIEW, update the persona agent table, rigor table, process summary, gates, and PHASE_COMPLETE section, and update both orchestrator prompt templates to a 7-step workflow with Integration as step 5.

## Observable Truths (Acceptance Criteria)

1. The autopilot SKILL.md state machine diagram reads `INIT -> ASSESS -> PLAN -> APPROVE_PLAN -> EXECUTE -> VERIFY -> INTEGRATE -> REVIEW -> PHASE_COMPLETE`.
2. An INTEGRATE state section exists between VERIFY and REVIEW with dispatch logic (resolve tier, dispatch harness-integration, handle pass/fail/fix/skip/stop).
3. The persona agent table includes `harness-integration | harness-verifier | INTEGRATE`.
4. The rigor level table includes an INTEGRATE row with fast/standard/thorough columns.
5. The VERIFY section transitions to INTEGRATE (not REVIEW) on pass.
6. The Process summary describes INTEGRATE as a distinct step.
7. The Gates section includes "No skipping INTEGRATE."
8. The PHASE_COMPLETE section includes integration report in its summary.
9. Both `harness.orchestrator.md` (project root) and `templates/orchestrator/harness.orchestrator.md` list 7 workflow steps with Integration as step 5.
10. `harness validate` passes after all changes.

## File Map

- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` (Tasks 1-5)
- MODIFY `harness.orchestrator.md` (Task 6)
- MODIFY `templates/orchestrator/harness.orchestrator.md` (Task 6)

## Tasks

### Task 1: Update state machine diagram, persona table, and rigor table

**Depends on:** none | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Read file (already loaded in context).

2. **Edit 1 -- State machine diagram** (line 38). Replace:

```
INIT → ASSESS → PLAN → APPROVE_PLAN → EXECUTE → VERIFY → REVIEW → PHASE_COMPLETE
```

With:

```
INIT → ASSESS → PLAN → APPROVE_PLAN → EXECUTE → VERIFY → INTEGRATE → REVIEW → PHASE_COMPLETE
```

3. **Edit 2 -- Persona agent table** (lines 15-20). Replace the entire table block:

```markdown
| Skill                | `subagent_type`         | State(s)             |
| -------------------- | ----------------------- | -------------------- |
| harness-planning     | `harness-planner`       | PLAN                 |
| harness-execution    | `harness-task-executor` | EXECUTE              |
| harness-verification | `harness-verifier`      | VERIFY               |
| harness-code-review  | `harness-code-reviewer` | REVIEW, FINAL_REVIEW |
```

With:

```markdown
| Skill                   | `subagent_type`         | State(s)             |
| ----------------------- | ----------------------- | -------------------- |
| harness-planning        | `harness-planner`       | PLAN                 |
| harness-execution       | `harness-task-executor` | EXECUTE              |
| harness-verification    | `harness-verifier`      | VERIFY               |
| **harness-integration** | **`harness-verifier`**  | **INTEGRATE**        |
| harness-code-review     | `harness-code-reviewer` | REVIEW, FINAL_REVIEW |
```

4. **Edit 3 -- Rigor level table** (lines 27-33). Replace the entire table block:

```markdown
| State        | `fast`                     | `standard`            | `thorough`                    |
| ------------ | -------------------------- | --------------------- | ----------------------------- |
| PLAN         | Skip skeleton pass         | Default               | Always skeleton with approval |
| APPROVE_PLAN | Auto-approve, skip signals | Signal-based          | Force human review            |
| EXECUTE      | Skip scratchpad            | Scratchpad >500 words | Verbose scratchpad            |
| VERIFY       | `harness validate` only    | Full pipeline         | Expanded checks               |
```

With:

```markdown
| State        | `fast`                     | `standard`            | `thorough`                    |
| ------------ | -------------------------- | --------------------- | ----------------------------- |
| PLAN         | Skip skeleton pass         | Default               | Always skeleton with approval |
| APPROVE_PLAN | Auto-approve, skip signals | Signal-based          | Force human review            |
| EXECUTE      | Skip scratchpad            | Scratchpad >500 words | Verbose scratchpad            |
| VERIFY       | `harness validate` only    | Full pipeline         | Expanded checks               |
| INTEGRATE    | WIRE only, auto-approve    | Full tier-appropriate | Full + human ADR review       |
```

5. Run: `pnpm harness validate`
6. Commit: `feat(autopilot): add INTEGRATE to state diagram, persona table, and rigor table`

---

### Task 2: Update VERIFY state to transition to INTEGRATE

**Depends on:** Task 1 | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. In the VERIFY section (lines 129-136), replace:

```markdown
### VERIFY

- `"fast"`: run `harness validate`. Pass → REVIEW. Fail → surface to user.
- `"standard"`/`"thorough"`: dispatch harness-verifier:
```

subagent_type: "harness-verifier"
prompt: "Phase {N}: {name}. Session: {sessionSlug}. Rigor: {rigorLevel}. Verify and report pass/fail with findings."

```
Pass → REVIEW. Fail → ask "fix / skip verification / stop." `fix`: re-enter EXECUTE (retry budget resets).
```

With:

```markdown
### VERIFY

- `"fast"`: run `harness validate`. Pass → INTEGRATE. Fail → surface to user.
- `"standard"`/`"thorough"`: dispatch harness-verifier:
```

subagent_type: "harness-verifier"
prompt: "Phase {N}: {name}. Session: {sessionSlug}. Rigor: {rigorLevel}. Verify and report pass/fail with findings."

```
Pass → INTEGRATE. Fail → ask "fix / skip verification / stop." `fix`: re-enter EXECUTE (retry budget resets).
```

2. Run: `pnpm harness validate`
3. Commit: `feat(autopilot): route VERIFY pass to INTEGRATE instead of REVIEW`

---

### Task 3: Add INTEGRATE state section between VERIFY and REVIEW

**Depends on:** Task 2 | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Insert the following new section immediately after the VERIFY section's closing `---` and before the `### REVIEW` heading. The insertion point is between the VERIFY block ending at line ~136 and the REVIEW block starting at line ~140. Insert after the `---` line that follows VERIFY:

```markdown
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
```

2. Run: `pnpm harness validate`
3. Commit: `feat(autopilot): add INTEGRATE state section with dispatch and failure handling`

---

### Task 4: Update Process summary and Gates sections

**Depends on:** Task 3 | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. **Edit 1 -- Process summary** (lines 192-199). Replace:

```markdown
## Process

1. **INIT** — Resolve spec, derive session slug, check for existing state, parse phases.
2. **ASSESS** — Route by complexity: low/medium auto-plans, high pauses for interactive planning.
3. **PLAN → APPROVE** — Dispatch harness-planner, check approval signals, auto-approve or pause.
4. **EXECUTE** — Dispatch harness-task-executor with plan path, handle checkpoints and retries (max 3).
5. **VERIFY → REVIEW** — Dispatch harness-verifier and harness-code-reviewer, fix blocking findings.
6. **PHASE_COMPLETE** — Summarize, sync roadmap, loop to ASSESS for next phase or proceed to FINAL_REVIEW.
7. **FINAL_REVIEW → DONE** — Cross-phase review, offer PR creation, write final handoff.
```

With:

```markdown
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
```

2. **Edit 2 -- Gates section** (lines 213-218). Replace:

```markdown
## Gates

- **No reimplementing delegated skills.** Writing planning/execution/verification/review logic → STOP. Delegate via `subagent_type`.
- **No executing without plan approval.** Every plan passes APPROVE_PLAN. No exceptions.
- **No skipping VERIFY or REVIEW.** Human can override findings; steps cannot be skipped.
- **No infinite retries.** EXECUTE budget: 3 attempts. FINAL_REVIEW: 3 cycles. If exhausted, stop and surface.
- **No modifying state files manually.** If corrupted, start fresh.
```

With:

```markdown
## Gates

- **No reimplementing delegated skills.** Writing planning/execution/verification/review/integration logic → STOP. Delegate via `subagent_type`.
- **No executing without plan approval.** Every plan passes APPROVE_PLAN. No exceptions.
- **No skipping VERIFY, INTEGRATE, or REVIEW.** Human can override findings; steps cannot be skipped. INTEGRATE may be skipped only via explicit "skip" choice with decision recorded in `decisions[]`.
- **No infinite retries.** EXECUTE budget: 3 attempts. FINAL_REVIEW: 3 cycles. If exhausted, stop and surface.
- **No modifying state files manually.** If corrupted, start fresh.
```

3. Run: `pnpm harness validate`
4. Commit: `feat(autopilot): update Process summary and Gates for INTEGRATE state`

---

### Task 5: Update PHASE_COMPLETE summary and Success Criteria

**Depends on:** Task 4 | **Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. **Edit 1 -- PHASE_COMPLETE section** (lines 153-160). Replace:

```markdown
### PHASE_COMPLETE

1. Present summary: name, tasks completed, retries used, verification result, review findings count, elapsed time.
2. Record in `history[]`: phase index, name, startedAt, completedAt, tasksCompleted, retriesUsed, verificationPassed, reviewFindings.
```

With:

```markdown
### PHASE_COMPLETE

1. Present summary: name, tasks completed, retries used, verification result, integration report (`{sessionDir}/phase-{N}-integration.json`), review findings count, elapsed time.
2. Record in `history[]`: phase index, name, startedAt, completedAt, tasksCompleted, retriesUsed, verificationPassed, integrationPassed, reviewFindings.
```

2. **Edit 2 -- Success Criteria section** (lines 239-245). Replace:

```markdown
- All phases in the spec are executed in order with plan → execute → verify → review per phase
```

With:

```markdown
- All phases in the spec are executed in order with plan → execute → verify → integrate → review per phase
```

3. Run: `pnpm harness validate`
4. Commit: `feat(autopilot): add integration report to PHASE_COMPLETE and update success criteria`

---

### Task 6: Update both orchestrator prompt templates to 7-step workflow

**Depends on:** none (independent of Tasks 1-5) | **Files:** `harness.orchestrator.md`, `templates/orchestrator/harness.orchestrator.md`

1. In `harness.orchestrator.md` (project root), replace the Standard Workflow section (lines 68-90):

````markdown
## Standard Workflow

Follow these steps exactly, using the corresponding slash commands to ensure high-quality, architecturally sound delivery:

1. **Brainstorming:** Use `/harness:brainstorming` to explore the problem space and draft a technical proposal in `docs/changes/`.
2. **Planning:** Use `/harness:planning` to create a detailed implementation plan and task breakdown.
3. **Execution:** Use `/harness:execution` to implement the changes task-by-task, following TDD principles.
4. **Verification:** Use `/harness:verification` to ensure the implementation is complete, wired correctly, and meets all requirements.
5. **Code Review:** Use `/harness:code-review` and `/harness:pre-commit-review` to perform a final quality check before completing the task.
6. **Ship:** When the review is clean, you are pre-authorized to ship without asking:
   - Create a topic branch if you are still on `main`/`master` (e.g. `feat/{{ issue.identifier }}`).
   - Stage your changes and create a descriptive commit (Conventional Commits style).
   - Push the branch with `git push -u origin HEAD`.
   - Open a pull request. Use a HEREDOC for the body to preserve newlines:
     ```
     gh pr create --title "<title>" --body "$(cat <<'EOF'
     ## Summary
     <body content with real newlines>
     EOF
     )"
     ```
     Or use `gh pr create --fill` to auto-generate from commit messages.
   - Report the PR URL as your final output, then stop. Do not await further instructions — this is the terminal step of the workflow.
````

With:

````markdown
## Standard Workflow

Follow these steps exactly, using the corresponding slash commands to ensure
high-quality, architecturally sound delivery:

1. **Brainstorming:** Use `/harness:brainstorming` to explore the problem space
   and draft a technical proposal in `docs/changes/`. The spec MUST include an
   Integration Points section defining how the feature connects to the system.
2. **Planning:** Use `/harness:planning` to create a detailed implementation plan.
   The plan MUST include integration tasks derived from the spec's Integration Points.
3. **Execution:** Use `/harness:execution` to implement the changes task-by-task,
   including integration tasks (registrations, ADRs, doc updates).
4. **Verification:** Use `/harness:verification` to ensure the implementation is
   complete, wired correctly, and meets all requirements.
5. **Integration:** Use `/harness:integration` to verify that system wiring,
   knowledge materialization, and documentation updates are complete per the
   integration tier.
6. **Code Review:** Use `/harness:code-review` and `/harness:pre-commit-review`
   to perform a final quality check before completing the task.
7. **Ship:** When the review is clean, you are pre-authorized to ship without asking:
   - Create a topic branch if you are still on `main`/`master` (e.g. `feat/{{ issue.identifier }}`).
   - Stage your changes and create a descriptive commit (Conventional Commits style).
   - Push the branch with `git push -u origin HEAD`.
   - Open a pull request. Use a HEREDOC for the body to preserve newlines:
     ```
     gh pr create --title "<title>" --body "$(cat <<'EOF'
     ## Summary
     <body content with real newlines>
     EOF
     )"
     ```
     Or use `gh pr create --fill` to auto-generate from commit messages.
   - Report the PR URL as your final output, then stop. Do not await further instructions — this is the terminal step of the workflow.
````

2. In `templates/orchestrator/harness.orchestrator.md`, apply the **identical** replacement (same old text, same new text -- the two files currently have identical Standard Workflow sections).

3. Run: `pnpm harness validate`
4. Commit: `feat(orchestrator): update prompt template to 7-step workflow with Integration step`

---

## Dependency Graph

```
Task 1 (diagram, persona, rigor) ─┐
Task 2 (VERIFY -> INTEGRATE)      ├─ sequential within SKILL.md
Task 3 (new INTEGRATE section)     │
Task 4 (Process + Gates)           │
Task 5 (PHASE_COMPLETE + criteria) ┘

Task 6 (orchestrator templates) ──── independent, parallelizable with Tasks 1-5
```

## Verification

After all tasks:

- `pnpm harness validate` passes
- `grep "INTEGRATE" agents/skills/claude-code/harness-autopilot/SKILL.md` returns hits in: state diagram, persona table, rigor table, INTEGRATE section header, VERIFY transition, Process summary, Gates, PHASE_COMPLETE, Success Criteria
- `grep "Integration" harness.orchestrator.md` returns step 5
- `diff <(sed -n '/## Standard Workflow/,/## Rules/p' harness.orchestrator.md) <(sed -n '/## Standard Workflow/,/## Rules/p' templates/orchestrator/harness.orchestrator.md)` produces no output (identical)
