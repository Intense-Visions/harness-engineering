---
type: business_rule
domain: roadmap
tags: [file-less, source-of-truth, invariant, validation, tracker]
---

# Tracker as Source of Truth

When the project is configured in file-less roadmap mode, the configured external tracker — not any local file — is the canonical store of every roadmap feature, status, assignment, and history event. This rule is the foundational invariant of file-less mode; without it, divergence between local clones reappears and the multi-session conflict surface that motivated the file-less proposal returns.

## Rule

When `roadmap.mode === "file-less"`:

1. The configured external tracker (`roadmap.tracker.kind: "github"` — at least, until additional kinds ship) is the canonical store of all features, statuses, assignments, and history.
2. `docs/roadmap.md` MUST NOT exist (enforced by validation rule `ROADMAP_MODE_FILE_PRESENT`).
3. `roadmap.tracker` MUST be configured (enforced by validation rule `ROADMAP_MODE_MISSING_TRACKER`).
4. All consumers — CLI MCP `manage_roadmap`, dashboard claim endpoint, orchestrator `createTracker()` dispatch (which selects `RoadmapTrackerAdapter` for file-backed `kind: 'roadmap'` and the `GitHubIssuesIssueTrackerAdapter` wrapper for file-less `kind: 'github-issues'`), `harness:roadmap-pilot`, brainstorming, planning — MUST route reads and writes through an `IssueTrackerClient` instance obtained from `createTrackerClient(config)`. Direct reads of `docs/roadmap.md` are forbidden in file-less mode (and the file does not exist, so any direct read fails).

## Enforcement

Three layers ensure the rule holds:

1. **Config-load time.** `validateRoadmapMode` (in `packages/core/src/validation/roadmap-mode.ts`) runs as part of `harness validate` and rejects misconfigurations: missing tracker when mode is file-less; `docs/roadmap.md` present when mode is file-less. An operator who tries to opt in without configuring a tracker is blocked at validation, not at runtime.
2. **Runtime.** Every consumer site branches on `loadProjectRoadmapMode(projectRoot)` and dispatches to the appropriate code path. The Phase 4 stub-replacement audit (`stubAuditAfter: 0`) confirmed zero un-wired sites. The dispatch is consistent across all six runtime entry points: S1 `manage_roadmap` MCP tool, S2 orchestrator `createTracker`, S3 dashboard claim endpoint, S4 `harness:roadmap-pilot` scoring, S5 dashboard roadmap-status endpoint, S6 orchestrator roadmap-append endpoint.
3. **Migration.** `harness roadmap migrate --to=file-less` enforces the file→tracker move atomically: the config flip from `"file-backed"` to `"file-less"` is gated behind successful tracker writes and the archival of `docs/roadmap.md`. A partial-failure leaves the config flag unflipped so subsequent invocations of `harness` continue to read the original file-backed surface. See the `Roadmap Migration to File-less Mode` business_process entry for the step-by-step flow.

## Exceptions

None. There is no "hybrid" mode and no local fallback. Teams without a configured tracker stay on file-backed mode (the default). There is no transient "read from file, write to tracker" mode during migration — the migrate command either completes fully (then the config flag flips) or it does not.

## Why this rule exists

Two reasons motivate the strict source-of-truth invariant:

1. **Prevents per-clone divergence.** Every developer's `harness:roadmap-pilot` reads the same affinity history from the tracker. Before file-less mode, the audit log either lived in a local file (per-clone divergence) or in a checked-in JSONL file (merge-conflict surface).
2. **Eliminates the multi-session write conflict.** The original proposal (`docs/changes/roadmap-tracker-only/proposal.md` §Overview) was motivated by the observation that `docs/roadmap.md` is a contended resource: orchestrator + dashboard + MCP all read and write it, and the in-process mutex protects only one process. Removing the file removes the contended resource; coordination is delegated to the tracker via ETag-conditional reads and best-effort conflict detection on writes.

## Cross-links

- `File-less Roadmap Mode` (sibling `business_concept`).
- ADR 0008 — IssueTrackerClient abstraction in core.
- ADR 0009 — Audit history as issue comments (the comment-based history is what makes "tracker = truth" extend to audit data, not just feature data).
