---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

Sharded roadmap: `groom` now archives `done` rows into a sharded archive
(`docs/roadmap.d/archive/<slug>.md`) instead of the monolith
`docs/roadmap-archive.md` when the project is in sharded mode. Each done shard is
MOVED byte-for-byte (full frontmatter + body preserved), so the motion is lossless
and reversible. The active read path already excludes the `archive/` subdirectory,
so archived shards drop out of `load()`, the regenerated aggregate `docs/roadmap.md`,
and active `show`/`query` — the archive is history, not active state. The monolith
`groom` path is unchanged.

New core store helpers: `archiveShards`, `restoreShards`, `readArchivedShards`,
`archiveShardDir`, `ARCHIVE_SUBDIR`, and the project-level `archiveDoneShardsForProject`.
