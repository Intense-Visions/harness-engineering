---
type: business_concept
domain: roadmap
tags: [file-less, tracker, github-issues, multi-session, etag, opt-in, mode]
---

# File-less Roadmap Mode

File-less Roadmap Mode is an opt-in storage mode where the configured external tracker — today, GitHub Issues; designed to be pluggable for Linear/Jira — is the canonical roadmap store, eliminating `docs/roadmap.md` as a multi-session conflict surface. Activated via `roadmap.mode: "file-less"` in `harness.config.json`.

## What it is

In file-less mode, `docs/roadmap.md` does not exist in the project. The external tracker holds every feature, status, assignment, and history event. All harness consumers — the `manage_roadmap` MCP tool, the dashboard claim flow, the `harness:roadmap-pilot` skill, the orchestrator's tracker adapter, and the brainstorming/planning skills — read and write through a shared `IssueTrackerClient` interface in `@harness-engineering/core`. The previous file-backed mode (the default) is unchanged: projects that do not opt in continue to see `docs/roadmap.md` as the canonical surface and the bidirectional sync engine bridges it to the tracker.

## Activation

File-less mode is activated by:

1. A single config flag in `harness.config.json`: `roadmap.mode: "file-less"`. The default is `"file-backed"`.
2. A one-shot migration command: `harness roadmap migrate --to=file-less` (dry-run capable, idempotent). The command creates GitHub issues for features that lack an `External-ID`, writes body metadata blocks, posts deduplicated history comments, archives `docs/roadmap.md` to `docs/roadmap.md.archived`, writes a `harness.config.json.pre-migration` backup, and flips `roadmap.mode`.

Consistency is enforced by two cross-cutting `harness validate` rules in `packages/core/src/validation/roadmap-mode.ts`:

- `ROADMAP_MODE_MISSING_TRACKER` — `roadmap.mode: "file-less"` requires `roadmap.tracker` to be configured.
- `ROADMAP_MODE_FILE_PRESENT` — `roadmap.mode: "file-less"` requires `docs/roadmap.md` to NOT exist.

## Architecture

A single shared `IssueTrackerClient` interface lives in `packages/core/src/roadmap/tracker/types.ts` (see ADR 0008). Implementations:

- `GitHubIssuesTrackerAdapter` (in `packages/core/src/roadmap/tracker/adapters/github-issues.ts`) — the file-less adapter. Uses ETag-conditional reads (`If-None-Match` header returning 200 with body or 304 Not Modified) for cheap polling. Writes use refetch-and-compare for best-effort conflict detection (GitHub REST does NOT honor `If-Match` on PATCH; see ADR 0009 §Consequences and proposal §F2 wording).
- `RoadmapTrackerAdapter` (in `packages/orchestrator/src/tracker/adapters/roadmap.ts`) — the file-backed adapter, kept for projects that have not opted in.

`createTrackerClient(config)` (in `packages/core/src/roadmap/tracker/factory.ts`) dispatches on `workflow.tracker.kind` (orchestrator path) and a parallel core path reads `roadmap.mode` + `roadmap.tracker` to construct the file-less client for non-orchestrator consumers. See ADR 0010 for the `tracker.kind` schema decoupling rationale.

## Cross-links

- `Roadmap Claim Workflow` (`docs/knowledge/dashboard/claim-workflow.md`) — branches on `roadmap.mode` at step 4.
- `Web Dashboard` (`docs/knowledge/dashboard/web-dashboard.md`).
- `Tracker as Source of Truth` (sibling `business_rule`, this directory).
- `Roadmap Migration to File-less Mode` (sibling `business_process`, this directory).
- ADR 0008 — IssueTrackerClient abstraction in core.
- ADR 0009 — Audit history as issue comments.
- ADR 0010 — `tracker.kind` schema decoupling.

## Key Files

- `packages/core/src/roadmap/tracker/types.ts` — `IssueTrackerClient` interface, `TrackedFeature`, `ConflictError`, `FeaturePatch`, `HistoryEvent`.
- `packages/core/src/roadmap/tracker/factory.ts` — `createTrackerClient(config)` dispatching on `tracker.kind`.
- `packages/core/src/roadmap/tracker/adapters/github-issues.ts` — file-less adapter implementation.
- `packages/core/src/roadmap/mode.ts` — `getRoadmapMode(config)` helper.
- `packages/core/src/roadmap/load-tracker-client-config.ts` — canonical loader for tracker-client config (Phase 5 dedup).
- `packages/core/src/validation/roadmap-mode.ts` — `validateRoadmapMode` with `ROADMAP_MODE_MISSING_TRACKER` and `ROADMAP_MODE_FILE_PRESENT` rules.
