---
'@harness-engineering/core': patch
---

fix(roadmap): `scoreRoadmapCandidates` now withholds rows whose `Blockers` still hold (#2255). A blocker is resolved by feature name, slugified title, backticked slug, `#N` issue reference against `External-ID`, and (via the new `slugAliases` option, built with `shardSlugAliases`) the shard's frontmatter slug; it is satisfied only when every row it names is `done`, and prose that names no row fails closed. The new `findBlockedRoadmapCandidates` reports each withheld row with the reason each blocker holds (`open` or `unresolved`). On this repository's shards the scorer previously offered 170 candidates, 98 of them carrying blockers; it now offers 80 and reports 92 as blocked.
