# Phase 1: Update autopilot SKILL.md with session scoping

**Spec:** `docs/changes/autopilot-session-scoping/proposal.md`
**Complexity:** Low
**Files modified:**

- `agents/skills/claude-code/harness-autopilot/SKILL.md`
- `agents/skills/gemini-cli/harness-autopilot/SKILL.md`

## Objective

Replace all singleton state file references (`.harness/autopilot-state.json`, `.harness/state.json`, `.harness/handoff.json`) with session-scoped paths (`.harness/sessions/<slug>/...`). Add slug derivation logic to the INIT section. Update all agent delegation prompts to pass session directory explicitly. Bump `schemaVersion` to 2.

## Context

Both platform copies of SKILL.md are currently identical. They must remain identical after changes. The spec at `docs/changes/autopilot-session-scoping/proposal.md` defines the exact slug derivation algorithm, directory layout, schema changes, and delegation prompt format.

## Tasks

### Task 1: Add slug derivation to INIT and update resume logic

**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

**Action:**

Rewrite the `### Phase 1: INIT -- Load Spec and Restore State` section with these changes:

1. **Add slug derivation steps** between "read the spec" and "create state file":

   After the spec path is resolved, add:

   ```
   - Derive the session slug from the spec path:
     1. If the path starts with `docs/`, strip the `docs/` prefix
     2. Drop the trailing `.md` extension
     3. Replace all `/` and `.` characters with `--`
     4. Lowercase the result
   - Set `sessionDir = .harness/sessions/<slug>/`
   - Create the session directory if it does not exist
   ```

2. **Update the resume check** (step 1) to use session-scoped path:

   Change: "Read `.harness/autopilot-state.json`"
   To: The INIT must first resolve the spec path (from argument or user input), derive the slug, then check `.harness/sessions/<slug>/autopilot-state.json` for existing state.

   Restructure the INIT flow to:
   1. Resolve spec path (from argument, or from user input)
   2. Derive slug and sessionDir
   3. Check `<sessionDir>/autopilot-state.json` for resume
   4. If resuming, load state and continue
   5. If fresh start, parse spec and create state

3. **Bump schema in the JSON example:**

   Change `"schemaVersion": 1` to `"schemaVersion": 2`

4. **Add `sessionDir` field** to the JSON example:

   ```json
   {
     "schemaVersion": 2,
     "sessionDir": ".harness/sessions/<slug>",
     "specPath": "<path to spec>",
     ...
   }
   ```

5. **Update the "Load context" step** to clarify that `learnings.md` and `failures.md` remain at `.harness/` root (global), not in the session directory.

**Verify:** Read the INIT section and confirm:

- Slug derivation algorithm matches the spec exactly (strip `docs/`, drop `.md`, replace `/` and `.` with `--`, lowercase)
- Resume check references `<sessionDir>/autopilot-state.json`, not `.harness/autopilot-state.json`
- JSON example has `schemaVersion: 2` and `sessionDir` field
- `learnings.md` and `failures.md` still reference `.harness/` root

**Done:** INIT section uses session-scoped state paths with slug derivation. Schema version is 2.

---

### Task 2: Update all agent delegation prompts to pass session directory

**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

**Action:**

Update every agent dispatch code block in the SKILL.md to pass session-scoped paths. There are 4 dispatch blocks to update:

1. **PLAN section** (harness-planner dispatch):

   Add to the prompt:

   ```
   Session directory: {sessionDir}
   Write handoff to: {sessionDir}/handoff.json
   ```

   Change: `Write .harness/handoff.json when done.`
   To: `Write {sessionDir}/handoff.json when done.`

2. **EXECUTE section** (harness-task-executor dispatch):

   Change:

   ```
   State: .harness/state.json
   ...
   Update .harness/state.json after each task.
   Write .harness/handoff.json when done or when blocked.
   ```

   To:

   ```
   Session directory: {sessionDir}
   State: {sessionDir}/state.json
   Learnings (global): .harness/learnings.md
   Failures (global): .harness/failures.md

   Update {sessionDir}/state.json after each task.
   Write {sessionDir}/handoff.json when done or when blocked.
   ```

3. **VERIFY section** (harness-verifier dispatch):

   Add session directory context to the prompt so the verifier knows where to find state:

   ```
   Session directory: {sessionDir}
   ```

4. **REVIEW section** (harness-code-reviewer dispatch):

   Add session directory context:

   ```
   Session directory: {sessionDir}
   ```

Also update these non-dispatch references:

- **PLAN section** (after agent returns): Change "Read the generated plan path from `.harness/handoff.json`" to "Read the generated plan path from `{sessionDir}/handoff.json`"
- **APPROVE_PLAN section**: No singleton file references to change (uses planPath from state object)
- **EXECUTE section** (checkpoint handling): Ensure any references to handoff.json use session-scoped path

**Verify:** Search the file for every occurrence of `.harness/state.json`, `.harness/handoff.json`, and `.harness/autopilot-state.json`. After this task:

- `.harness/autopilot-state.json` should appear ONLY in the context of "the old format" or not at all -- all active references use `{sessionDir}/autopilot-state.json`
- `.harness/state.json` should not appear -- replaced by `{sessionDir}/state.json`
- `.harness/handoff.json` should not appear as a write target -- replaced by `{sessionDir}/handoff.json`
- `.harness/learnings.md` and `.harness/failures.md` MUST still reference `.harness/` root (global files)

**Done:** All 4 agent delegation prompts include explicit `Session directory: {sessionDir}` parameter. All per-run state file references use session-scoped paths. Global files remain at `.harness/` root.

---

### Task 3: Update remaining sections and Harness Integration, then copy to gemini-cli

**Files:**

- `agents/skills/claude-code/harness-autopilot/SKILL.md`
- `agents/skills/gemini-cli/harness-autopilot/SKILL.md`

**Action:**

1. **Update the Harness Integration section** at the bottom of the file:

   Change:

   ```
   - **State file** -- `.harness/autopilot-state.json` tracks the orchestration state machine. `.harness/state.json` tracks task-level execution state (managed by harness-execution).
   - **Handoff** -- `.harness/handoff.json` is written by each delegated skill and read by the next. Autopilot writes a final handoff on DONE.
   - **Learnings** -- `.harness/learnings.md` is appended by both delegated skills and autopilot itself.
   ```

   To:

   ```
   - **State file** -- `.harness/sessions/<slug>/autopilot-state.json` tracks the orchestration state machine. `.harness/sessions/<slug>/state.json` tracks task-level execution state (managed by harness-execution). The slug is derived from the spec path during INIT.
   - **Handoff** -- `.harness/sessions/<slug>/handoff.json` is written by each delegated skill and read by the next. Autopilot writes a final handoff on DONE.
   - **Learnings** -- `.harness/learnings.md` (global) is appended by both delegated skills and autopilot itself.
   ```

2. **Update the DONE section** -- final handoff write:

   Change the handoff write instruction from `.harness/handoff.json` to `{sessionDir}/handoff.json`.

3. **Update the DONE section** -- learnings append:

   Confirm `.harness/learnings.md` is still referenced (it should be -- global file). No change needed here if already correct.

4. **Update the DONE section** -- "Clean up state" step:

   Change: `Set currentState: "DONE" in autopilot-state.json`
   To: `Set currentState: "DONE" in {sessionDir}/autopilot-state.json`

5. **Update the Gates section:**

   Change: `No modifying autopilot-state.json manually.`
   To: `No modifying session state files manually.` (or similar -- the gate applies to session-scoped files now)

6. **Update the Escalation section:**

   The "context limits" escalation says "State saved." -- this is fine as-is since it refers to the concept, not a specific path.

   The "reorder phases" escalation references "the phases array in autopilot-state.json" -- update to clarify this is the session-scoped state file.

7. **Update examples:**

   In the "3-Phase Security Scanner" example:
   - Change `Created .harness/autopilot-state.json. Starting Phase 1.` to `Created .harness/sessions/specs--2026-03-19-security-scanner/autopilot-state.json. Starting Phase 1.`
   - This makes the example concrete and demonstrates the slug derivation.

8. **Copy the completed claude-code SKILL.md to gemini-cli:**

   After all changes are complete in `agents/skills/claude-code/harness-autopilot/SKILL.md`, copy it verbatim to `agents/skills/gemini-cli/harness-autopilot/SKILL.md`.

**Verify:**

- Run a full-text search of the claude-code SKILL.md for the literal string `.harness/autopilot-state.json` -- should appear zero times (or only in a "legacy" context note if one was added)
- Run a full-text search for `.harness/state.json` -- should appear zero times
- Run a full-text search for `.harness/handoff.json` -- should appear zero times
- Run a full-text search for `.harness/learnings.md` -- should appear (global file, kept at root)
- Run a full-text search for `.harness/failures.md` -- should appear (global file, kept at root)
- Diff the two platform copies: `diff agents/skills/claude-code/harness-autopilot/SKILL.md agents/skills/gemini-cli/harness-autopilot/SKILL.md` -- should show no differences
- Run `npx prettier --check agents/skills/claude-code/harness-autopilot/SKILL.md agents/skills/gemini-cli/harness-autopilot/SKILL.md` -- should pass (or run prettier write to fix formatting before committing)

**Done:** All sections of SKILL.md consistently use session-scoped paths. Both platform copies are identical. No singleton state file references remain for per-run files. Global files (learnings.md, failures.md) remain at `.harness/` root.

---

## Verification Checklist

After all tasks are complete, verify:

1. [ ] `schemaVersion` is `2` in the JSON example (not `1`)
2. [ ] `sessionDir` field present in JSON example
3. [ ] Slug derivation algorithm in INIT matches spec: strip `docs/`, drop `.md`, replace `/` and `.` with `--`, lowercase
4. [ ] Zero references to `.harness/autopilot-state.json` as an active path
5. [ ] Zero references to `.harness/state.json` as an active path
6. [ ] Zero references to `.harness/handoff.json` as an active path
7. [ ] `.harness/learnings.md` still referenced at root (global)
8. [ ] `.harness/failures.md` still referenced at root (global)
9. [ ] All 4 agent dispatch prompts include `Session directory: {sessionDir}`
10. [ ] Both platform copies are byte-identical
11. [ ] Prettier formatting passes

## Success Criteria

- Every per-run state file reference in SKILL.md uses `.harness/sessions/<slug>/` prefix
- Global append-only files (learnings.md, failures.md) remain at `.harness/` root
- INIT section includes complete slug derivation algorithm matching the spec
- Schema version is 2 with sessionDir field in state
- Agent delegation prompts explicitly pass session directory
- Both claude-code and gemini-cli copies are identical
