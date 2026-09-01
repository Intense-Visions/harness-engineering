---
'@harness-engineering/core': patch
---

Fix roadmap serialize/parse round-trip silently truncating a multi-line
`RoadmapFeature.summary` to its first line (#1756). The Summary free-text field
is now encoded with a reversible single-line escape on write and decoded on
read, so an embedded newline survives parse → serialize → parse intact across
the monolith roadmap, the shard store, and comprehension shards. Plain
single-line summaries are unaffected.
