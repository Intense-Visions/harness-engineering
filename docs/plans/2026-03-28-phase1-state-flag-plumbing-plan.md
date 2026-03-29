# Plan: Phase 1 — State and Flag Plumbing

**Date:** 2026-03-28
**Spec:** docs/changes/autopilot-auto-approve-plans/proposal.md
**Estimated tasks:** 2
**Estimated time:** 8 minutes

## Goal

The autopilot state schema includes `reviewPlans: boolean` (default false), `skill.yaml` declares `--review-plans` as a CLI arg, and the INIT phase parses that flag into state.

## Observable Truths (Acceptance Criteria)

1. `agents/skills/claude-code/harness-autopilot/skill.yaml` contains a `review-plans` entry in the `cli.args` list with `description: "Force human review of all plans (overrides auto-approve)"` and `required: false`.
2. The state JSON example in SKILL.md (INIT step 4) includes `"reviewPlans": false` as a top-level field.
3. INIT phase in SKILL.md contains a step that parses the `--review-plans` CLI argument and sets `state.reviewPlans: true` when present, defaulting to `false` otherwise.
4. The schema migration note in INIT step 3 mentions backfilling `reviewPlans: false` for sessions with `schemaVersion < 4`.
5. `harness validate` (build + lint + test) passes after all changes.

## File Map

- MODIFY `agents/skills/claude-code/harness-autopilot/skill.yaml` (add `review-plans` arg)
- MODIFY `agents/skills/claude-code/harness-autopilot/SKILL.md` (state schema, INIT flag parsing, schema migration)

## Tasks

### Task 1: Add `--review-plans` CLI arg to skill.yaml

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-autopilot/skill.yaml`

1. Open `agents/skills/claude-code/harness-autopilot/skill.yaml`.
2. In the `cli.args` array (currently has `spec` and `path` entries), add a third entry after `path`:

   ```yaml
   - name: review-plans
     description: Force human review of all plans (overrides auto-approve)
     required: false
   ```

3. Verify the file parses as valid YAML (no syntax errors).
4. Run: `npx turbo run build lint test` to confirm nothing breaks.
5. Commit: `feat(autopilot): add --review-plans CLI arg to skill.yaml`

### Task 2: Update SKILL.md state schema, INIT parsing, and schema migration

**Depends on:** Task 1
**Files:** `agents/skills/claude-code/harness-autopilot/SKILL.md`

This task makes three edits to SKILL.md:

**Edit A — Add `reviewPlans` to the state JSON example (INIT step 4):**

1. In the state JSON block under "If no existing state (fresh start)" (around line 76), add `"reviewPlans": false` as a top-level field after `"startingCommit"`. The JSON should become:

   ```json
   {
     "schemaVersion": 4,
     "sessionDir": ".harness/sessions/<slug>",
     "specPath": "<path to spec>",
     "startingCommit": "<git rev-parse HEAD output>",
     "reviewPlans": false,
     "currentState": "ASSESS",
     "currentPhase": 0,
     ...
   }
   ```

   Note: `schemaVersion` changes from `3` to `4` to reflect the new field.

**Edit B — Update schema migration in INIT step 3:**

2. In INIT step 3 ("Check for existing state"), update the schema migration note. Currently it says `schemaVersion < 3`. Add a new migration clause:

   Change the existing migration text from:

   ```
   - **Schema migration:** If `schemaVersion < 3`, backfill missing fields: set `startingCommit` to the earliest commit in `history` (or current HEAD if no history), set `decisions` to `[]`, set `finalReview` to `{ "status": "pending", "findings": [], "retryCount": 0 }`. Update `schemaVersion` to `3` and save.
   ```

   To:

   ```
   - **Schema migration:** If `schemaVersion < 3`, backfill missing fields: set `startingCommit` to the earliest commit in `history` (or current HEAD if no history), set `decisions` to `[]`, set `finalReview` to `{ "status": "pending", "findings": [], "retryCount": 0 }`. If `schemaVersion < 4`, set `reviewPlans` to `false`. Update `schemaVersion` to `4` and save.
   ```

**Edit C — Add flag parsing step to INIT (after step 4, before step 5):**

3. Insert a new step between current step 4 and step 5. Renumber subsequent steps (5 becomes 6, 6 becomes 7, etc.). The new step:

   ```markdown
   5. **Parse session flags.** Check CLI arguments for `--review-plans`. If present, set `state.reviewPlans: true` in the state file. This flag persists for the entire session — resuming a session preserves the setting from when it was started (the flag is only read on fresh start, not on resume).
   ```

**Edit D — Update all `schemaVersion` references:**

4. Update the two references to `schemaVersion: 3` in the state creation JSON to `schemaVersion: 4`. The "Create `{sessionDir}/autopilot-state.json`" code block should show `"schemaVersion": 4`.

5. Verify all edits are consistent: the JSON example has `reviewPlans`, the migration handles `< 4`, the new step parses the flag, and `schemaVersion` is `4` everywhere.

6. Run: `npx turbo run build lint test` to confirm nothing breaks (these are .md files, so this is a sanity check).
7. Commit: `feat(autopilot): add reviewPlans to state schema and INIT flag parsing`

## Traceability

| Observable Truth                          | Delivered By                 |
| ----------------------------------------- | ---------------------------- |
| 1. skill.yaml has review-plans arg        | Task 1                       |
| 2. State JSON example has reviewPlans     | Task 2, Edit A               |
| 3. INIT parses --review-plans flag        | Task 2, Edit C               |
| 4. Schema migration backfills reviewPlans | Task 2, Edit B               |
| 5. harness validate passes                | Task 1 step 4, Task 2 step 6 |
