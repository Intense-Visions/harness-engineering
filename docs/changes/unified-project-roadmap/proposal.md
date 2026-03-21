# Unified Project Roadmap

> A roadmap system that creates, maintains, and keeps current a unified `docs/roadmap.md` for harness-managed projects. Provides both a human-readable living document and a machine-queryable interface for agents to understand project priorities, status, and blockers.

**Keywords:** roadmap, milestone, status-sync, project-planning, feature-tracking, MCP-tool, skill, docs-convention

## Overview & Goals

1. **Single source of truth** for "what's planned, in-progress, and done" at the project level
2. **Lightweight index** that references existing specs and plans — not a replacement for them
3. **Automated status sync** so the roadmap stays current as work progresses
4. **Dual consumer** — both humans and agents served through a skill (interactive) and MCP tool (programmatic)
5. **Explicit invocation** — projects opt in when ready; no magic file creation

## Non-Goals

- Replacing specs or plans — the roadmap aggregates, it doesn't duplicate
- Graph-based dependency analysis — blockers are textual references, not computed
- Capacity planning or time estimation — roadmap tracks what and when, not who and how long
- Multi-project roadmaps — one roadmap per project

## Decisions

| #   | Decision                  | Choice                                    | Rationale                                                                                          |
| --- | ------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| D1  | Consumer                  | Both agents and humans                    | Agents need structured data for sequencing work; humans need readable overview for decision-making |
| D2  | Scope                     | One unified roadmap per project           | Simplicity; single source of truth without fragmentation                                           |
| D3  | Relationship to artifacts | Lightweight index referencing specs/plans | Minimal disruption to existing flows; specs remain source of truth for design                      |
| D4  | Lifecycle                 | Full CRUD with automated sync             | Roadmap must stay current to be useful; stale roadmaps are worse than none                         |
| D5  | Dependencies              | Lightweight textual blockers              | Captures critical information without graph machinery; upgradeable later                           |
| D6  | File location             | `docs/roadmap.md`                         | Consistent with existing doc conventions; lives alongside artifacts it references                  |
| D7  | Creation trigger          | Explicit skill invocation with init nudge | User controls when roadmap appears; discoverability via init messaging                             |
| D8  | Interface pattern         | Skill + MCP tool pair                     | Matches established harness pattern for all major capabilities                                     |
| D9  | Status override           | Human always wins                         | Manually edited statuses tracked via frontmatter timestamp; sync respects them                     |

## Technical Design

### Roadmap File Format (`docs/roadmap.md`)

```markdown
---
project: harness-engineering
version: 1
last_synced: 2026-03-21T14:30:00Z
last_manual_edit: 2026-03-21T15:00:00Z
---

# Project Roadmap

## Milestone: MVP Release

### Feature: Notification System

- **Status:** in-progress
- **Spec:** docs/specs/2026-03-14-notification-system.md
- **Plans:** docs/plans/2026-03-14-notification-phase-1-plan.md, docs/plans/2026-03-15-notification-phase-2-plan.md
- **Blocked by:** —
- **Summary:** Email and in-app notifications with polling

### Feature: User Auth Revamp

- **Status:** planned
- **Spec:** docs/specs/2026-02-20-auth-revamp.md
- **Plans:** —
- **Blocked by:** Notification System
- **Summary:** OAuth2 migration for compliance requirements

## Milestone: Q3 Hardening

### Feature: Performance Baselines

- **Status:** planned
- **Spec:** —
- **Plans:** —
- **Blocked by:** —
- **Summary:** Establish and enforce perf budgets across critical paths

## Backlog

### Feature: Push Notifications

- **Status:** backlog
- **Spec:** —
- **Plans:** —
- **Blocked by:** —
- **Summary:** Extend notification system with WebSocket push
```

**Format rules:**

- YAML frontmatter: `project`, `version` (schema version), `last_synced` (ISO timestamp), `last_manual_edit` (ISO timestamp, updated when human edits directly)
- H2 headings (`##`) are milestones, plus a special `## Backlog` section
- H3 headings (`###`) are features, always prefixed with `Feature:`
- Each feature has 5 fields: Status, Spec, Plans, Blocked by, Summary
- Valid statuses: `backlog`, `planned`, `in-progress`, `done`, `blocked`
- `Blocked by` references other feature names (textual, not paths) or `—` when none
- Spec/Plans fields use relative paths or `—` when not yet created

### Skill: `harness:roadmap`

**Location:** `agents/skills/claude-code/harness-roadmap/`

**Commands (passed as arguments):**

| Command                | Behavior                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| _(no args)_            | Show current roadmap status summary                                                                                                         |
| `--create`             | Bootstrap roadmap from existing `docs/specs/` and `docs/plans/`; interactive — asks about milestones and grouping                           |
| `--add <feature-name>` | Add a feature to a milestone (interactive: asks which milestone, status, spec link)                                                         |
| `--sync`               | Scan plan execution state and update statuses; report what changed. Errors if `docs/roadmap.md` does not exist — directs user to `--create` |
| `--edit`               | Interactive edit session (reorder, move between milestones, update blockers)                                                                |

**Phases:** For `--create`, the skill scans existing artifacts, proposes groupings, and asks for confirmation before writing.

### MCP Tool: `manage_roadmap`

**Location:** Added to `packages/mcp-server/` tool registry.

| Action   | Input                                                                                | Output                                               |
| -------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `show`   | optional: `milestone`, `status` filter                                               | Parsed roadmap as structured data                    |
| `add`    | `feature`, `milestone`, `status`, `summary`, optional: `spec`, `plans`, `blocked_by` | Updated roadmap                                      |
| `update` | `feature`, fields to update                                                          | Updated roadmap                                      |
| `remove` | `feature`                                                                            | Updated roadmap                                      |
| `sync`   | —                                                                                    | Diff of status changes inferred from execution state |
| `query`  | `filter` (e.g., `"blocked"`, `"in-progress"`, `"milestone:MVP"`)                     | Filtered feature list                                |

### Sync Logic

1. Read `docs/roadmap.md` and parse all features.
2. For each feature with linked plans, check:
   - `.harness/state.json` (root execution state)
   - `.harness/sessions/*/autopilot-state.json` (session-scoped execution state)
   - Plan file completion markers
3. Infer status:
   - All tasks complete → suggest `done`
   - Any task started → suggest `in-progress`
   - Blocker feature not done → suggest `blocked`
4. **Human-always-wins rule:** If `last_manual_edit` is more recent than `last_synced`, preserve manually set statuses. Only override on explicit `--force-sync`.
5. Return diff of proposed changes; apply only on confirmation (skill) or explicit `--apply` flag (tool).

### Integration Points

| Integration       | Trigger                              | Action                                                                              |
| ----------------- | ------------------------------------ | ----------------------------------------------------------------------------------- |
| Post-execution    | `harness-execution` completes a plan | Calls `manage_roadmap sync` to update linked feature status                         |
| Post-verification | `harness:verify` passes              | Triggers sync to mark verified features as `done`                                   |
| Project init      | `harness:initialize-project` runs    | Adds note: "Run `/harness:roadmap --create` when ready to set up a project roadmap" |
| Autopilot         | Session start                        | Reads roadmap for project context and current priorities                            |

### Core Package Changes

**New module:** `packages/core/src/roadmap/`

| File           | Responsibility                                                                   |
| -------------- | -------------------------------------------------------------------------------- |
| `types.ts`     | `Roadmap`, `Milestone`, `Feature`, `FeatureStatus` types                         |
| `parse.ts`     | Parse `docs/roadmap.md` into structured types                                    |
| `serialize.ts` | Write structured data back to markdown with round-trip fidelity                  |
| `sync.ts`      | Status inference logic — reads state files (root + session), compares to roadmap |

**Shared types:** `packages/types/` gets `RoadmapTypes` for cross-package use.

## Success Criteria

1. **Roadmap creation works from scratch:** Running `harness:roadmap --create` on a project with existing specs/plans produces a well-structured `docs/roadmap.md` that correctly links to discovered artifacts
2. **Roadmap creation works on empty projects:** Running `--create` on a project with no specs produces a valid roadmap with an empty Backlog section
3. **CRUD operations maintain format consistency:** Adding, updating, and removing features via the MCP tool always produces valid roadmap markdown that matches the schema
4. **Sync accurately infers status:** When a plan's tasks are all complete in `.harness/state.json`, sync proposes `done`. When tasks are partially complete, sync proposes `in-progress`. When a blocker feature is not done, sync proposes `blocked`.
5. **Human-always-wins override:** A manually edited status is not overwritten by the next sync unless `--force-sync` is used
6. **Post-execution sync fires:** After `harness-execution` completes a plan, the linked roadmap feature status is updated
7. **Parseable by agents:** The `manage_roadmap show` and `query` actions return structured data that agents can use for decision-making without parsing markdown themselves
8. **Readable by humans:** The roadmap file is clear, scannable markdown that makes sense without tooling
9. **Round-trip fidelity:** Parse → serialize produces identical output (no information loss or format drift)
10. **`harness validate` passes** with the roadmap file present — no project health regressions
11. **Sync checks session state:** Sync reads both `.harness/state.json` and `.harness/sessions/*/autopilot-state.json` for accurate status inference
12. **Missing roadmap handled gracefully:** `--sync` on a project without `docs/roadmap.md` returns a clear error directing user to `--create`

## Implementation Order

### Phase 1: Core Types and Parser

<!-- complexity: low -->

Define `Roadmap`, `Milestone`, `Feature`, `FeatureStatus` types in `packages/types/`. Implement `parse.ts` and `serialize.ts` in `packages/core/src/roadmap/` with round-trip fidelity. This is the foundation everything else builds on.

### Phase 2: MCP Tool — CRUD Operations

<!-- complexity: medium -->

Add `manage_roadmap` tool to `packages/mcp-server/` with `show`, `add`, `update`, `remove`, and `query` actions. Reads and writes `docs/roadmap.md` through the core parser/serializer. No sync logic yet.

### Phase 3: Skill — Interactive Creation

<!-- complexity: medium -->

Create `harness:roadmap` skill in `agents/skills/claude-code/harness-roadmap/`. Implement `--create` (bootstrap from existing specs/plans) and `--add` (interactive feature addition). Generate slash command registration.

### Phase 4: Sync Engine

<!-- complexity: medium -->

Implement `sync.ts` in core — status inference from `.harness/state.json` and `.harness/sessions/*/autopilot-state.json` and plan completion markers. Add `sync` action to the MCP tool. Implement human-always-wins override logic using `last_manual_edit` frontmatter timestamp.

### Phase 5: Integration Hooks

<!-- complexity: low -->

Add post-execution sync call to `harness-execution`. Add post-verification sync to `harness:verify`. Add init nudge to `harness:initialize-project`. Wire autopilot to read roadmap at session start for context.

### Phase 6: Skill — Remaining Commands

<!-- complexity: low -->

Implement `--sync`, `--edit`, and default (show summary) commands in the roadmap skill. These delegate to the MCP tool actions built in earlier phases.
