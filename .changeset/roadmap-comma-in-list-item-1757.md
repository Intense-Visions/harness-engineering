---
'@harness-engineering/core': patch
---

fix(roadmap): preserve a comma inside a single `Blockers`/`Plan` list item
across a serialize → parse round-trip (#1757).

The roadmap grammar joined a feature's `blockedBy` / `plans` array with `", "`
on write and split the re-read value back on `","` with no escaping on read, so a
single list item that itself contained a comma — e.g. a feature name authored via
the MCP `manage_roadmap` write path, `"Notification System, phase 2"` — split
into two items on the next parse, silently fabricating a blocker (or plan step)
that never existed.

Adds a reversible comma-escape codec (`roadmap/list-field.ts`, mirroring the
sibling summary codec from #1756) wired into the shared `serializeFeature` /
`parseFeatureBlock` seam. Plain comma-free items are an identity under the codec,
so existing roadmaps re-serialize byte-for-byte unchanged.
