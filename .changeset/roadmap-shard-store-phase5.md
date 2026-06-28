---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Phase 5 of the roadmap shard store: auto-done reconciler (D6).

When a merged PR closes a roadmap row's linked GitHub issue
(`External-ID: github:owner/repo#NNN`), the matching row is flipped to `done`
automatically — conflict-free, idempotent, and store-routed.

- **Core:** `reconcileDoneFromClosedIssues(store, closedExternalIds)` — a pure,
  store-routed function that maps each closed `External-ID` to its row and flips
  non-`done` matches to `done` via `setStatus` (the assignee-lifecycle authority,
  which auto-clears a live assignee and appends one `unassigned` history record),
  persisting through `applyRoadmapDiff` (one shard per matched issue; `_meta.md`
  only when an assignee was cleared). Already-`done` rows are no-ops; unmatched
  ids are reported, not written. Works in both sharded and monolith modes and
  adds no new `roadmap.md` reader (invariant R untouched). Also re-exports the
  `parseExternalId` / `buildExternalId` `External-ID` helpers.
- **CLI:** `harness roadmap reconcile` — an offline fallback that fetches issue
  state from the configured tracker and reconciles closed issues, plus an
  authoritative `--from-issues <n,...>` path that reconciles exact issue numbers
  with no network fetch. (Offline mode treats any closed issue as done; it cannot
  distinguish a `completed` close from a `not planned`/`wontfix` close — the
  PR-merge workflow path is authoritative.)
- **CI:** a `pull_request: closed` workflow that, only when the PR is merged,
  resolves the PR's `closingIssuesReferences`, no-ops when none are
  roadmap-linked, runs `harness roadmap reconcile --from-issues`, and commits the
  changed shard(s) + regenerated aggregate back to the base branch.

Both surfaces share the one store-routed core function.
