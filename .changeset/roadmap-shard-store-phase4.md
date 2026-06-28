---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
'@harness-engineering/dashboard': minor
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': patch
---

Phase 4 of the roadmap shard store: route every roadmap writer and content
reader through `RoadmapStore`.

In sharded mode (`docs/roadmap.d/` present) each logical mutation now rewrites
exactly one shard file (conflict-free by construction) and regenerates the
aggregate; in monolith mode the on-disk `docs/roadmap.md` is byte-for-byte
unchanged. Every writer captures `before = structuredClone(roadmap)` and
persists via `applyRoadmapDiff(store, before, after)`, so only the rows that
actually changed are written.

Migrated onto the store:

- `manage_roadmap` (add / update / remove / promote / sync / groom) and the
  show/query readers, preserving the unblock-only cascade, async external sync,
  and first-claim-wins refusal.
- `autoSyncRoadmap` and `sync-engine` `fullSync` (now takes a project root) with
  per-shard writeback; the assignee-lifecycle invariant holds on every write.
- Content readers: `prediction-engine`, `publish-analyses`, `sync-analyses`.
- Dashboard roadmap reader (`gather/roadmap`) and content writers
  (`routes/actions` claim + status).
- Orchestrator roadmap writers (`/api/roadmap/append` and the
  `RoadmapTrackerAdapter` claim / release / mark-complete), preserving
  compare-and-set, idempotency, and the RMH005 assignee invariant.

New core APIs: `RoadmapStore.removeFeature`, `resolveRoadmapStore` /
`resolveRoadmapStoreForFile` (mode-detection factories), `applyRoadmapDiff`,
`roadmapAggregatePath`, and a node-fs roadmap IO adapter.

The read-source guard (invariant R) is tightened to also catch DYNAMIC-path
readers/writers — code that threads a `roadmapPath`/`roadmapFile` variable into a
raw filesystem read/write rather than spelling the `roadmap.md` literal — and its
allowlist has shrunk to its permanent floor (store + regenerator + factory, the
git/merge tooling, and non-content path references).
