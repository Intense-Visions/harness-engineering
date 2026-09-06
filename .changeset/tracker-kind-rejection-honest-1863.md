---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

Say why a tracker kind is rejected instead of denying the block exists (#1863)

`harness roadmap sync` with a well-formed `roadmap.tracker` block whose kind is
`pnyon` reported "harness.config.json has no `roadmap.tracker` block" — for a
block that was present, well-formed, and sitting right there. The message sent
readers hunting for something they already had.

`loadTrackerSyncConfig` returns a bare `null` for four different situations (no
config file, unparseable config, no tracker block, and a kind the shape guard
rejects) and the CLI rendered all four as the missing-block sentence. The new
`diagnoseTrackerSyncConfig` / `explainTrackerSyncConfig` pair distinguishes
them, naming the supported kinds when the kind is the problem. Both are
additive — `loadTrackerSyncConfig`'s contract is unchanged — and the accepted
list is stated once, shared by the guard and the diagnosis, so they cannot
drift apart.

Sync remains GitHub-only; this makes the refusal true rather than changing what
is accepted. Driving Waypoint from `roadmap sync` additionally needs a
`TrackerSyncAdapter` for it: #1816 implemented the `RoadmapTrackerClient` seam,
which is a different interface that `roadmap sync` does not consume.
