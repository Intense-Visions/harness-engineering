---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(roadmap): open the file-less tracker seam with a tracker-kind registry
and a `pnyon` (Waypoint) RoadmapTrackerClient adapter (#1815).

`core` gains `PnyonTrackerAdapter` — the full `RoadmapTrackerClient`
interface implemented against a documented, typed Waypoint HTTP API contract
(`WaypointHttp`): claims map to `sdlc.claim.*` event semantics guarded by
event-version preconditions, stale writes surface as `ConflictError` code
`TRACKER_CONFLICT`, history rides the item's evidence ledger, and the adapter
performs zero GitHub API calls (machine actors never touch GitHub's assignee
field, #640). A new tracker-kind registry (`registerTrackerKind`) lets
`loadTrackerClientConfigFromProject` and `createTrackerClient` resolve
registered kinds — builtin: `pnyon` (config `url` + `token`/`PNYON_TOKEN`) —
while `github` behavior is preserved byte-for-byte and unregistered kinds are
still rejected (now listing the registered kinds).

`cli`'s `TrackerConfigSchema` becomes a discriminated union so
`roadmap.tracker.kind: "pnyon"` validates; the github variant is unchanged.

Also re-exports the `context-surface` helpers consumed by its own test file,
fixing the `tsc --noEmit` break on main (#1814).
