# Plan: Roadmap Sync Phase 0 -- Execution Enforcement

**Date:** 2026-03-23
**Spec:** docs/changes/roadmap-pipeline-sync/proposal.md
**Estimated tasks:** 1
**Estimated time:** 3 minutes

## Goal

Strengthen the harness-execution SKILL.md roadmap sync step from conditional "if available" wording to mandatory sync with explicit `apply: true` parameter, matching the spec's Integration Point 2 requirements.

## Observable Truths (Acceptance Criteria)

1. When reading `agents/skills/claude-code/harness-execution/SKILL.md` line 269, the text shall read: `**Sync roadmap (mandatory when present).**` followed by `apply: true` instructions and `syncRoadmap()` fallback.
2. The file shall not contain the phrases `"if available"` or `"/harness:roadmap --sync"` in the roadmap sync context.
3. The Harness Integration bullet (line 330) shall reference `manage_roadmap sync` with `apply: true` and mandatory language.
4. `harness validate` shall pass after the change.

## File Map

- MODIFY `agents/skills/claude-code/harness-execution/SKILL.md` (Phase 4 step 5 text + Harness Integration bullet)

## Tasks

### Task 1: Replace roadmap sync text in harness-execution SKILL.md

**Depends on:** none
**Files:** `agents/skills/claude-code/harness-execution/SKILL.md`

1. Open `agents/skills/claude-code/harness-execution/SKILL.md`.

2. Replace the Phase 4 step 5 text (line 269). Find this exact string:

   ```
   5. **Sync roadmap (if present).** If `docs/roadmap.md` exists, trigger a roadmap sync to update linked feature statuses based on the just-completed execution state. Use the `manage_roadmap` MCP tool with `sync` action if available, or invoke `/harness:roadmap --sync`. This keeps the roadmap current as plans are executed. If no roadmap exists, skip this step silently.
   ```

   Replace with:

   ```
   5. **Sync roadmap (mandatory when present).** If `docs/roadmap.md` exists, call `manage_roadmap` with action `sync` and `apply: true` to update linked feature statuses from the just-completed execution state. Do not use `force_sync: true` — the human-always-wins rule applies. If `manage_roadmap` is unavailable, fall back to direct file manipulation using `syncRoadmap()` from core. If no roadmap exists, skip silently.
   ```

3. Replace the Harness Integration bullet (line 330). Find this exact string:

   ```
   - **Roadmap sync** — After completing plan execution, sync roadmap status via `manage_roadmap sync` if `docs/roadmap.md` exists. Keeps roadmap current with execution progress.
   ```

   Replace with:

   ```
   - **Roadmap sync** — After completing plan execution, call `manage_roadmap` with action `sync` and `apply: true` to update roadmap status. Mandatory when `docs/roadmap.md` exists. Do not use `force_sync: true`. Falls back to `syncRoadmap()` from core if MCP tool is unavailable.
   ```

4. Run: `harness validate`
5. Observe: validation passes.
6. Commit: `fix(skills): strengthen execution roadmap sync to mandatory with apply:true`
