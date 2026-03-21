# Plan: Roadmap Integration Hooks

**Date:** 2026-03-21
**Spec:** docs/changes/unified-project-roadmap/proposal.md
**Phase:** 5 — Integration Hooks
**Estimated tasks:** 5
**Estimated time:** 15 minutes

## Goal

Wire the roadmap system into four existing skills so that roadmap status stays current as work progresses, new projects learn about the roadmap feature, and autopilot sessions have project-level context at startup.

## Observable Truths (Acceptance Criteria)

1. When `harness-execution` completes a plan, the SKILL.md instructs the agent to call `manage_roadmap sync` (or the equivalent skill command) to update linked feature status.
2. When `harness-verify` passes all checks, the SKILL.md instructs the agent to trigger a roadmap sync to mark verified features as `done`.
3. When `initialize-harness-project` completes initialization, the SKILL.md instructs the agent to inform the user: "Run `/harness:roadmap --create` when ready to set up a project roadmap."
4. When `harness-autopilot` enters the INIT phase, the SKILL.md instructs the agent to read `docs/roadmap.md` (if it exists) for project context and current priorities.
5. The gemini-cli copy of `harness-autopilot/SKILL.md` receives the same INIT addition as the claude-code copy.
6. `harness validate` passes after all changes.

## File Map

- MODIFY `agents/skills/claude-code/harness-execution/SKILL.md` (add post-execution roadmap sync step)
- MODIFY `agents/skills/claude-code/harness-verify/SKILL.md` (add post-verification roadmap sync step)
- MODIFY `agents/skills/claude-code/initialize-harness-project/SKILL.md` (add roadmap init nudge)
- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` (add roadmap context loading at INIT)
- MODIFY `agents/skills/gemini-cli/harness-autopilot/SKILL.md` (mirror the INIT addition)

## Tasks

### Task 1: Add post-execution roadmap sync to harness-execution

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-execution/SKILL.md`

1. Open `agents/skills/claude-code/harness-execution/SKILL.md`.

2. In **Phase 4: PERSIST**, after step 4 (Write `.harness/handoff.json`) and before step 5 (Learnings are append-only), insert the following new step:

   ```markdown
   5. **Sync roadmap (if present).** If `docs/roadmap.md` exists, trigger a roadmap sync to update linked feature statuses based on the just-completed execution state. Use the `manage_roadmap` MCP tool with `sync` action if available, or invoke `/harness:roadmap --sync`. This keeps the roadmap current as plans are executed. If no roadmap exists, skip this step silently.
   ```

3. Renumber the existing step 5 ("Learnings are append-only") to step 6.

4. In the **Harness Integration** section, add a new bullet:

   ```markdown
   - **Roadmap sync** — After completing plan execution, sync roadmap status via `manage_roadmap sync` if `docs/roadmap.md` exists. Keeps roadmap current with execution progress.
   ```

5. Run: `harness validate`
6. Commit: `docs(harness-execution): add post-execution roadmap sync hook`

---

### Task 2: Add post-verification roadmap sync to harness-verify

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-verify/SKILL.md`

1. Open `agents/skills/claude-code/harness-verify/SKILL.md`.

2. In **Phase 3: REPORT**, after the existing report output rules, add a new subsection:

   ```markdown
   ### Roadmap Sync (conditional)

   When all non-skipped checks pass (overall `Verification: PASS`) and `docs/roadmap.md` exists:

   1. Trigger a roadmap sync to update feature statuses based on the verified state.
   2. Use the `manage_roadmap` MCP tool with `sync` action if available, or note to the caller that a roadmap sync is recommended.
   3. Features linked to plans whose tasks are all complete and verified may be marked as `done`.

   If `docs/roadmap.md` does not exist, skip this step silently. If verification failed, do not sync — the roadmap should only reflect verified completions.
   ```

3. In the **Harness Integration** section, add a new bullet:

   ```markdown
   - **Roadmap sync** — When verification passes and `docs/roadmap.md` exists, triggers `manage_roadmap sync` to mark verified features as `done`. Only fires on overall PASS.
   ```

4. Run: `harness validate`
5. Commit: `docs(harness-verify): add post-verification roadmap sync hook`

---

### Task 3: Add roadmap init nudge to initialize-harness-project

**Depends on:** none
**Files:** `agents/skills/claude-code/initialize-harness-project/SKILL.md`

1. Open `agents/skills/claude-code/initialize-harness-project/SKILL.md`.

2. In **Phase 4: VALIDATE**, after step 3 (Run `harness check-deps`) and before step 4 (Commit the initialization), insert a new step:

   ```markdown
   4. **Mention roadmap.** After validation passes, inform the user: "When you are ready to set up a project roadmap, run `/harness:roadmap --create`. This creates a unified `docs/roadmap.md` that tracks features, milestones, and status across your specs and plans." This is informational only — do not create the roadmap automatically.
   ```

3. Renumber the existing step 4 ("Commit the initialization") to step 5.

4. In the **Harness Integration** section, add a new bullet:

   ```markdown
   - **Roadmap nudge** — After successful initialization, inform the user about `/harness:roadmap --create` for setting up project-level feature tracking. Informational only; does not create the roadmap.
   ```

5. Run: `harness validate`
6. Commit: `docs(initialize-harness-project): add roadmap init nudge`

---

### Task 4: Add roadmap context loading to harness-autopilot (claude-code)

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

1. Open `agents/skills/claude-code/harness-autopilot/SKILL.md`.

2. In **Phase 1: INIT**, after step 5 ("Load context") and before step 6 ("Transition to ASSESS"), insert a new step:

   ```markdown
   6. **Load roadmap context.** If `docs/roadmap.md` exists, read it to understand:
      - Current project priorities (which features are `in-progress`)
      - Blockers that may affect the upcoming phases
      - Overall project status and milestone progress

      This provides the autopilot with project-level context beyond the individual spec being executed. If the roadmap does not exist, skip this step — the autopilot operates normally without it.
   ```

3. Renumber the existing step 6 ("Transition to ASSESS") to step 7.

4. In the **Harness Integration** section, add a new bullet:

   ```markdown
   - **Roadmap context** — During INIT, reads `docs/roadmap.md` (if present) for project-level priorities, blockers, and milestone status. Provides broader context for phase execution decisions.
   ```

5. Run: `harness validate`
6. Commit: `docs(harness-autopilot): add roadmap context loading at session start`

---

### Task 5: Mirror autopilot roadmap addition to gemini-cli and final validation

**Depends on:** Task 4
**Files:** `agents/skills/gemini-cli/harness-autopilot/SKILL.md`

1. Open `agents/skills/gemini-cli/harness-autopilot/SKILL.md`.

2. Apply the identical changes from Task 4:
   - In **Phase 1: INIT**, after step 5 ("Load context") and before step 6 ("Transition to ASSESS"), insert the same roadmap context loading step (step 6).
   - Renumber the existing step 6 to step 7.
   - In the **Harness Integration** section, add the same roadmap context bullet.

3. Verify the gemini-cli and claude-code versions of the INIT section are consistent (they should be identical for this addition since the INIT phase is the same across both).

4. Run: `harness validate`
5. Commit: `docs(harness-autopilot): mirror roadmap context loading to gemini-cli`

---

## Traceability

| Observable Truth                                        | Delivered By                    |
| ------------------------------------------------------- | ------------------------------- |
| 1. Post-execution sync instruction in harness-execution | Task 1                          |
| 2. Post-verification sync instruction in harness-verify | Task 2                          |
| 3. Init nudge in initialize-harness-project             | Task 3                          |
| 4. Roadmap context at autopilot INIT (claude-code)      | Task 4                          |
| 5. Roadmap context at autopilot INIT (gemini-cli)       | Task 5                          |
| 6. `harness validate` passes                            | Tasks 1-5 (each task validates) |
