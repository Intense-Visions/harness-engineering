# Plan: Roadmap Remaining Commands (Phase 6)

**Date:** 2026-03-21
**Spec:** docs/changes/unified-project-roadmap/proposal.md
**Estimated tasks:** 4
**Estimated time:** 12 minutes

## Goal

Complete the harness-roadmap skill by adding the three remaining commands (default show, `--sync`, `--edit`) to the SKILL.md documentation on both platforms.

## Observable Truths (Acceptance Criteria)

1. When no arguments are passed to `harness:roadmap`, the SKILL.md documents a default command that shows the current roadmap status summary via `manage_roadmap show`.
2. When `--sync` is passed, the SKILL.md documents a command that scans plan execution state, updates statuses, and reports what changed. If `docs/roadmap.md` does not exist, the system shall error and direct the user to `--create`.
3. When `--edit` is passed, the SKILL.md documents an interactive edit session for reordering, moving between milestones, and updating blockers.
4. The "When to Use" section no longer references "deferred to Phase 6" and includes all five commands.
5. The `skill.yaml` args description lists all five commands (`--create`, `--add`, `--sync`, `--edit`, and default).
6. The Success Criteria section covers all five commands.
7. The Gates section includes gates for `--sync` (no sync without roadmap) and `--edit` (no write without confirmation).
8. Both `agents/skills/claude-code/harness-roadmap/` and `agents/skills/gemini-cli/harness-roadmap/` contain identical updated files.
9. `harness validate` passes after all changes.

## File Map

- MODIFY `agents/skills/claude-code/harness-roadmap/SKILL.md` (add 3 command sections, update When to Use, Success Criteria, Gates)
- MODIFY `agents/skills/claude-code/harness-roadmap/skill.yaml` (update args description)
- MODIFY `agents/skills/gemini-cli/harness-roadmap/SKILL.md` (mirror claude-code changes)
- MODIFY `agents/skills/gemini-cli/harness-roadmap/skill.yaml` (mirror claude-code changes)

## Tasks

### Task 1: Add default (no args) and --sync command sections to claude-code SKILL.md

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-roadmap/SKILL.md`

1. Read `agents/skills/claude-code/harness-roadmap/SKILL.md`.

2. Update the "When to Use" section. Replace:

   ```
   - When a project needs a unified roadmap and none exists yet (`--create`)
   - When adding a new feature to an existing roadmap (`--add <feature-name>`)
   - When user asks about project status and no roadmap exists -- suggest `--create`
   - NOT for `--sync`, `--edit`, or default show (deferred to Phase 6)
   - NOT for programmatic CRUD (use `manage_roadmap` MCP tool directly)
   ```

   With:

   ```
   - When a user asks about project status and a roadmap exists (default -- no args)
   - When a project needs a unified roadmap and none exists yet (`--create`)
   - When adding a new feature to an existing roadmap (`--add <feature-name>`)
   - When roadmap statuses may be stale and need updating from plan execution state (`--sync`)
   - When features need reordering, moving between milestones, or blocker updates (`--edit`)
   - When user asks about project status and no roadmap exists -- suggest `--create`
   - NOT for programmatic CRUD (use `manage_roadmap` MCP tool directly)
   ```

3. After the `---` separator that follows the `--add` command's Phase 4: VALIDATE section (line 133 area), insert the following two new command sections:

   ````markdown
   ---
   
   ### Command: *(no args)* -- Show Roadmap Summary
   
   #### Phase 1: SCAN -- Load Roadmap
   
   1. Check if `docs/roadmap.md` exists.
      - If missing: suggest `--create`. "No roadmap found at docs/roadmap.md. Run `--create` to bootstrap one from existing specs and plans."
   2. Parse the roadmap (via `manage_roadmap show` or direct read).
   
   #### Phase 2: PRESENT -- Display Summary
   
   1. Display a compact summary of the roadmap:
   
      ```
      ROADMAP: <project-name>
      Last synced: YYYY-MM-DD HH:MM
   
      ## <Milestone 1> (N features)
        - Feature A .................. in-progress
        - Feature B .................. planned
        - Feature C .................. blocked (by: Feature A)
   
      ## <Milestone 2> (N features)
        - Feature D .................. done
        - Feature E .................. backlog
   
      Total: N features | N done | N in-progress | N planned | N blocked | N backlog
      ```
   
   2. If any features have stale sync timestamps (last_synced older than 24 hours), append a note:
      ```
      Hint: Roadmap may be stale. Run `--sync` to update statuses from plan execution state.
      ```
   
   3. No file writes. This is a read-only operation. No `harness validate` needed.
   
   ---

   ### Command: `--sync` -- Sync Statuses from Execution State

   #### Phase 1: SCAN -- Load Roadmap and Execution State

   1. Check if `docs/roadmap.md` exists.
      - If missing: error with clear message. "No roadmap found at docs/roadmap.md. Run `--create` first to bootstrap one."
      - Do NOT create a roadmap. Do NOT offer alternatives. Stop.
   2. Parse the roadmap (via `manage_roadmap show` or direct read).
   3. For each feature with linked plans, scan execution state:
      - `.harness/state.json` (root execution state)
      - `.harness/sessions/*/autopilot-state.json` (session-scoped execution state)
      - Plan file completion markers

   #### Phase 2: PROPOSE -- Present Status Changes

   1. Infer status for each feature:
      - All tasks complete -> suggest `done`
      - Any task started -> suggest `in-progress`
      - Blocker feature not done -> suggest `blocked`
      - No execution data found -> no change

   2. Check the **human-always-wins** rule: if `last_manual_edit` is more recent than `last_synced` for a feature, preserve the manually set status. Report it as "skipped (manual override)".

   3. Present proposed changes:

      ```
      SYNC RESULTS

      Changes detected:
        - Feature A: planned -> in-progress (3/8 tasks started)
        - Feature B: in-progress -> done (all tasks complete)
        - Feature C: planned -> blocked (blocked by: Feature A, not done)

      Unchanged:
        - Feature D: done (no change)

      Skipped (manual override):
        - Feature E: kept as "planned" (manually edited 2h ago)

      Apply these changes? (y/n)
      ```

   4. Wait for human confirmation before applying.

   #### Phase 3: WRITE -- Apply Changes

   1. Apply via `manage_roadmap sync` MCP tool if available, or via `manage_roadmap update` for each changed feature. If MCP is unavailable, parse the roadmap, update statuses, and serialize back.
   2. Update `last_synced` timestamp in frontmatter.
   3. Write to `docs/roadmap.md`.

   #### Phase 4: VALIDATE -- Verify Output

   1. Read back `docs/roadmap.md`.
   2. Verify changes applied correctly via `manage_roadmap show` if MCP is available.
   3. Run `harness validate`.
   4. Present summary:

      ```
      Sync complete: docs/roadmap.md
      Updated: N features
      Skipped: N (manual override)
      Unchanged: N
      harness validate: passed
      ```
   ````

4. Run: `harness validate`
5. Commit: `docs(harness-roadmap): add default show and --sync command sections`

---

### Task 2: Add --edit command section and update Success Criteria / Gates in claude-code SKILL.md

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-roadmap/SKILL.md`

1. Read `agents/skills/claude-code/harness-roadmap/SKILL.md` (updated from Task 1).

2. After the `--sync` command's Phase 4: VALIDATE section (added in Task 1), insert the `--edit` command section:

   ````markdown
   ---

   ### Command: `--edit` -- Interactive Edit Session

   #### Phase 1: SCAN -- Load Existing Roadmap

   1. Check if `docs/roadmap.md` exists.
      - If missing: error with clear message. "No roadmap found at docs/roadmap.md. Run `--create` first to bootstrap one."
   2. Parse the roadmap (via `manage_roadmap show` or direct read).
   3. Present current structure:

      ```
      Current roadmap: <project-name>

      ## <Milestone 1>
        1. Feature A (in-progress)
        2. Feature B (planned)

      ## <Milestone 2>
        3. Feature C (done)
        4. Feature D (backlog)
      ```

   #### Phase 2: EDIT -- Interactive Modifications

   Offer edit actions in a loop until the human is done:

   1. **Reorder features within a milestone:**
      - "Move which feature? (number)" -> "To which position?" -> reorder.

   2. **Move a feature between milestones:**
      - "Move which feature? (number)" -> "To which milestone?" (list milestones + `[NEW]`) -> move.
      - If `[NEW]`: ask for the new milestone name, create it.

   3. **Update blockers:**
      - "Update blockers for which feature? (number)" -> "Blocked by? (feature names, comma-separated, or 'none')" -> update.

   4. **Update status:**
      - "Update status for which feature? (number)" -> offer: `backlog`, `planned`, `in-progress`, `blocked`, `done` -> update.

   5. **Rename a feature:**
      - "Rename which feature? (number)" -> "New name?" -> rename.

   6. **Remove a feature:**
      - "Remove which feature? (number)" -> "Confirm removal of '<name>'? (y/n)" -> remove on confirm.

   7. **Rename a milestone:**
      - "Rename which milestone?" -> "New name?" -> rename.

   8. **Done:**
      - Exit edit loop, proceed to WRITE phase.

   Present the menu after each action:

   ```
   Edit actions:
     (1) Reorder features within a milestone
     (2) Move feature to different milestone
     (3) Update blockers
     (4) Update status
     (5) Rename feature
     (6) Remove feature
     (7) Rename milestone
     (D) Done -- save and exit

   Choice?
   ```

   #### Phase 3: WRITE -- Save Changes

   1. Present a diff summary of all changes made during the edit session:

      ```
      Changes to apply:

        - Moved "Feature B" from "Current Work" to "Q2 Release"
        - Updated "Feature A" blockers: none -> Feature C
        - Reordered "Q2 Release": Feature B now at position 1

      Apply? (y/n)
      ```

   2. Wait for confirmation before writing.
   3. Apply all changes via `manage_roadmap update` / `manage_roadmap remove` MCP tool calls, or direct file manipulation if MCP is unavailable.
   4. Update `last_manual_edit` timestamp in frontmatter (since this is a human-driven edit).
   5. Write to `docs/roadmap.md`.

   #### Phase 4: VALIDATE -- Verify Output

   1. Read back `docs/roadmap.md`.
   2. Verify changes applied correctly.
   3. Run `harness validate`.
   4. Present summary:

      ```
      Edit complete: docs/roadmap.md
      Changes applied: N
      harness validate: passed
      ```
   ````

3. Update the **Success Criteria** section. Replace the existing success criteria block with:

   ```markdown
   ## Success Criteria

   1. `--create` discovers all specs (`docs/specs/*.md`, `docs/changes/*/proposal.md`) and plans (`docs/plans/*.md`)
   2. `--create` proposes groupings and waits for human confirmation before writing
   3. `--create` produces a valid `docs/roadmap.md` that round-trips through `parseRoadmap`/`serializeRoadmap`
   4. `--add` collects all fields interactively (milestone, status, spec, summary, blockers, plan)
   5. `--add` rejects duplicate feature names with a clear error message
   6. `--add` errors gracefully when no roadmap exists, directing the user to `--create`
   7. Default (no args) displays a compact status summary with feature counts by status
   8. Default (no args) suggests `--create` when no roadmap exists
   9. Default (no args) hints at `--sync` when roadmap may be stale
   10. `--sync` scans `.harness/state.json` and `.harness/sessions/*/autopilot-state.json` for execution state
   11. `--sync` respects the human-always-wins rule -- manually edited statuses are preserved
   12. `--sync` presents proposed changes and waits for human confirmation before applying
   13. `--sync` errors gracefully when no roadmap exists, directing the user to `--create`
   14. `--edit` offers reorder, move, blocker update, status update, rename, and remove actions
   15. `--edit` presents a diff summary and waits for confirmation before writing
   16. `--edit` updates `last_manual_edit` timestamp (since changes are human-driven)
   17. Output matches the roadmap markdown format exactly (frontmatter, H2 milestones, H3 features, 5 fields each)
   18. `harness validate` passes after all operations
   ```

4. Update the **Gates** section. Add two new gates after the existing ones:

   ```markdown
   - **No syncing when `docs/roadmap.md` does not exist.** `--sync` must error immediately with a message directing the user to `--create`. Do not create a roadmap as a side effect of sync.
   - **No writing changes from `--edit` without showing a diff summary and getting confirmation.** The WRITE phase must present all pending changes and wait for explicit accept before modifying `docs/roadmap.md`.
   ```

5. Run: `harness validate`
6. Commit: `docs(harness-roadmap): add --edit command, update success criteria and gates`

---

### Task 3: Update skill.yaml args description on claude-code

**Depends on:** Task 2
**Files:** `agents/skills/claude-code/harness-roadmap/skill.yaml`

1. Read `agents/skills/claude-code/harness-roadmap/skill.yaml`.

2. Replace the args description line:

   ```yaml
   description: 'Command: --create (bootstrap roadmap), --add <feature-name> (add feature)'
   ```

   With:

   ```yaml
   description: 'Command: --create (bootstrap roadmap), --add <feature-name> (add feature), --sync (update statuses from execution state), --edit (interactive edit session), or no args (show summary)'
   ```

3. Run: `harness validate`
4. Commit: `docs(harness-roadmap): update skill.yaml args to include all commands`

---

### Task 4: Mirror all changes to gemini-cli

**Depends on:** Task 3
**Files:** `agents/skills/gemini-cli/harness-roadmap/SKILL.md`, `agents/skills/gemini-cli/harness-roadmap/skill.yaml`

1. Copy the updated claude-code files to gemini-cli:

   ```bash
   cp agents/skills/claude-code/harness-roadmap/SKILL.md agents/skills/gemini-cli/harness-roadmap/SKILL.md
   cp agents/skills/claude-code/harness-roadmap/skill.yaml agents/skills/gemini-cli/harness-roadmap/skill.yaml
   ```

2. Verify the files are identical:

   ```bash
   diff agents/skills/claude-code/harness-roadmap/SKILL.md agents/skills/gemini-cli/harness-roadmap/SKILL.md
   diff agents/skills/claude-code/harness-roadmap/skill.yaml agents/skills/gemini-cli/harness-roadmap/skill.yaml
   ```

3. Run: `harness validate`
4. Commit: `docs(harness-roadmap): mirror skill updates to gemini-cli platform`
