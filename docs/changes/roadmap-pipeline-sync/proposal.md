# Roadmap Pipeline Sync

> Embed automatic roadmap status updates into the harness skill pipeline so `docs/roadmap.md` stays current without manual `/harness:roadmap --sync` runs.

**Status:** Proposed
**Date:** 2026-03-23
**Keywords:** roadmap, sync, pipeline, autopilot, execution, brainstorming, manage_roadmap

## Problem

The roadmap drifts from reality because features are brainstormed, planned, executed, and verified through harness skills — but none of those skills write back to `docs/roadmap.md`. The only way to update the roadmap is a manual `/harness:roadmap --sync` run, which is easy to forget. This causes stale status values and missing features.

## Decisions

1. **Four integration points, not one.** Cover the full lifecycle: feature creation (brainstorming), progress tracking (execution), phase completion (autopilot PHASE_COMPLETE), and feature completion (autopilot DONE).
2. **Respect the human-always-wins rule.** All automated sync calls use `apply: true` but never `force_sync: true`. If the human manually edited the roadmap, their edit is preserved.
3. **Silent when no roadmap exists.** If `docs/roadmap.md` is absent, all sync steps are skipped silently — no errors, no prompts. The roadmap is opt-in.
4. **Brainstorming adds, everything else syncs.** Only brainstorming creates new roadmap entries (`manage_roadmap add`). Execution and autopilot update existing entries via `manage_roadmap sync` or `manage_roadmap update`.

## Technical Design

### Integration Point 1: harness-brainstorming — Add feature on spec approval

**Where:** Phase 4 VALIDATE, step 6, after writing `.harness/handoff.json` and before calling `emit_interaction`.

**Behavior:**

1. Check if `docs/roadmap.md` exists. If not, skip silently.
2. Derive `<feature-name>` from the spec title (the H1 heading of the proposal).
3. Call `manage_roadmap` with action `add`:
   ```json
   {
     "action": "add",
     "path": "<project-root>",
     "feature": "<feature-name>",
     "milestone": "Current Work",
     "status": "planned",
     "spec": "docs/changes/<feature>/proposal.md",
     "summary": "<one-line summary from spec overview>",
     "blockers": "none",
     "plan": "none"
   }
   ```
4. If the feature already exists in the roadmap (duplicate name), skip silently — the feature was likely added manually or by a prior brainstorming session.
5. Log: `"Added '<feature-name>' to roadmap as planned"` (informational, not a prompt).

**Skill file change:** Add a new step between handoff.json write and `emit_interaction` call in `harness-brainstorming/SKILL.md`.

### Integration Point 2: harness-execution — Sync on plan completion

**Where:** Phase 4 PERSIST, step 5 (already exists, needs strengthening).

**Current text (line 269):**

> Sync roadmap (if present). If `docs/roadmap.md` exists, trigger a roadmap sync to update linked feature statuses based on the just-completed execution state. Use the `manage_roadmap` MCP tool with `sync` action if available, or invoke `/harness:roadmap --sync`. This keeps the roadmap current as plans are executed. If no roadmap exists, skip this step silently.

**New text:**

> **Sync roadmap (mandatory when present).** If `docs/roadmap.md` exists, call `manage_roadmap` with action `sync` and `apply: true` to update linked feature statuses from the just-completed execution state. Do not use `force_sync: true` — the human-always-wins rule applies. If `manage_roadmap` is unavailable, fall back to direct file manipulation using `syncRoadmap()` from core. If no roadmap exists, skip silently.

**Change:** Replace "if available" conditional with mandatory call. Add explicit `apply: true` parameter. Keep the no-roadmap silent skip.

### Integration Point 3: harness-autopilot PHASE_COMPLETE — Sync after each phase

**Where:** PHASE_COMPLETE state, after step 3 (mark phase complete) and before step 4 (check for next phase).

**New step 3.5:**

> **Sync roadmap.** If `docs/roadmap.md` exists, call `manage_roadmap` with action `sync` and `apply: true`. This reflects the just-completed phase in the roadmap. Skip silently if no roadmap exists. Do not use `force_sync`.

### Integration Point 4: harness-autopilot DONE — Mark feature done

**Where:** DONE state, after step 4 (append learnings) and before step 5 (clean up state).

**New step 4.5:**

> **Update roadmap to done.** If `docs/roadmap.md` exists and the current spec maps to a roadmap feature, call `manage_roadmap` with action `update` to set the feature status to `done`. Derive the feature name from the spec title or the session's `handoff.json` `summary` field. Skip silently if no roadmap exists or if the feature is not found. Do not use `force_sync`.

## Success Criteria

1. When a brainstorming session completes and produces a spec, the new feature appears in `docs/roadmap.md` under "Current Work" with status `planned` — without any manual roadmap command.
2. When an execution plan completes all tasks, `docs/roadmap.md` reflects the updated status (`in-progress` or `done`) — without any manual roadmap command.
3. When an autopilot phase completes, `docs/roadmap.md` reflects progress — without any manual roadmap command.
4. When autopilot reaches DONE, the feature shows status `done` in `docs/roadmap.md` — without any manual roadmap command.
5. All sync calls skip silently when `docs/roadmap.md` does not exist.
6. All sync calls respect the human-always-wins rule — manual edits are never overwritten.
7. Duplicate feature names in brainstorming are handled gracefully (skip, don't error).
8. `harness validate` passes after each automatic roadmap update.

## Implementation Order

1. **Phase 0: harness-execution enforcement** — Strengthen the existing step 5 text. Lowest risk, highest impact (execution is the most common completion path).
2. **Phase 1: harness-autopilot PHASE_COMPLETE + DONE** — Add the two new steps. Covers multi-phase autopilot flows.
3. **Phase 2: harness-brainstorming add** — Add the new step for feature creation. Requires the `manage_roadmap add` duplicate-name guard.
4. **Phase 3: Validation** — Run through a full brainstorm → plan → execute → verify cycle and confirm the roadmap updates at each stage.
