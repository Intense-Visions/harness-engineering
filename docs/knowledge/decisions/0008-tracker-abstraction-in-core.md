---
number: 0008
title: IssueTrackerClient abstraction lives in @harness-engineering/core
date: 2026-05-09
status: accepted
tier: medium
source: docs/changes/roadmap-tracker-only/proposal.md
---

## Context

Before file-less roadmap mode shipped, all tracker logic lived in `packages/orchestrator/src/tracker/adapters/roadmap.ts`. The orchestrator owned the only tracker implementation, and there was no abstraction accessible to non-orchestrator consumers — the CLI `manage_roadmap` MCP tool, the dashboard claim route, the `harness:roadmap-pilot` skill, and the planning skills all had no shared interface to call into a tracker backend. File-less mode (proposal `docs/changes/roadmap-tracker-only/proposal.md`) requires that every consumer — CLI, dashboard, MCP, orchestrator, skills — read and write through one interface so the tracker is the single source of truth.

Three alternative locations for the abstraction were considered:

1. **`packages/types`** — rejected. The types package is interface-only; it cannot ship a reference implementation alongside the interface, which means every consumer would have to import the adapter from somewhere else. That re-creates the divergence the abstraction is meant to fix.
2. **`packages/orchestrator`** — rejected. Non-orchestrator consumers (CLI, dashboard, skills) cannot depend on the orchestrator runtime under the project's layer rules (`harness.config.json`). Putting the abstraction in orchestrator forces a layer violation or a re-export from a lower layer.
3. **`packages/core`** — chosen. Core is the lowest shared layer; CLI, dashboard, orchestrator, and skills can all import from it without violating layer rules. A reference implementation (`GitHubIssuesTrackerAdapter`) can ship alongside the interface in the same package.

## Decision

Lift the `IssueTrackerClient` interface and shared types (`TrackedFeature`, `ConflictError`, `FeaturePatch`, `HistoryEvent`) to `packages/core/src/roadmap/tracker/`. The orchestrator's existing `RoadmapTrackerAdapter` keeps its file-backed role; the new `GitHubIssuesTrackerAdapter` (in `packages/core/src/roadmap/tracker/adapters/github-issues.ts`) implements the lifted interface for file-less mode. The factory at `packages/core/src/roadmap/tracker/factory.ts` dispatches on `tracker.kind` and returns the matching client. Public surface is re-exported via `packages/core/src/roadmap/index.ts`.

The lift is traceable to Phase 1 + Phase 2 commits `107cc794`–`2b308d23`. The orchestrator wrapper at `packages/orchestrator/src/tracker/adapters/github-issues-issue-tracker.ts` (Phase 4 commit `4039272d`) adapts the core client to the orchestrator's `IssueTracker` shape so the orchestrator can keep its existing dispatch surface without depending on core's internal types.

## Consequences

**Positive:**

- CLI MCP tool, dashboard claim route, `harness roadmap migrate`, and roadmap-pilot scoring all import the same client. The Phase 4 stub-replacement audit (`stubAuditAfter: 0`) confirms zero un-wired sites.
- Layer rules are preserved (core is the lowest layer). No circular imports, no upward dependencies.
- The factory pattern keeps the file-backed orchestrator adapter and the file-less core adapter coexistent. `createTrackerClient(config)` dispatches on `tracker.kind` and a project can run both modes during migration (read-only fallback) if needed in the future.

**Negative:**

- Any future tracker backend (Linear, Jira, GitLab) implements the interface in core, growing core's surface. The alternative (per-package adapters) re-creates the divergence this ADR removes, so this is the chosen trade-off.
- The orchestrator file-backed adapter (`packages/orchestrator/src/tracker/adapters/roadmap.ts`) is now a near-duplicate of the file-backed code path that core also exposes. A future refactor could collapse the two; the present coexistence keeps file-backed mode stable while file-less mode lands.

**Neutral:**

- `tracker.kind` enums in the orchestrator workflow schema and the roadmap sync schema remain decoupled — see ADR 0010.

## Related

- ADR 0009 — Audit history stored as GitHub issue comments
- ADR 0010 — `tracker.kind` schema decoupling between workflow and roadmap sync
- Proposal: `docs/changes/roadmap-tracker-only/proposal.md`
- Guide: `docs/guides/roadmap-sync.md` §"File-less mode"
