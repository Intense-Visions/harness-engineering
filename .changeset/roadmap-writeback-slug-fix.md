---
'@harness-engineering/core': patch
---

Fix two roadmap-sync writeback bugs that silently corrupted GitHub sync in sharded mode.

- **#1036 (writeback aborted on title-slug ≠ frontmatter-slug):** `applyRoadmapDiff`
  addresses each shard by `slugifyFeatureName(feature.name)`, but a shard's real file
  identity is its frontmatter `slug` — frequently a hand-shortened / length-truncated
  form of the title. For rows where the two diverge, the writeback ENOENT'd and aborted
  the _entire_ batch, dropping every external-ID backfill and the `last_synced` stamp,
  and (worst case) re-creating a duplicate tracker issue on the next run. `ShardStore`
  now resolves the real shard by name-slug when the direct path misses, so `patchFeature`
  / `removeFeature` address the correct file without aborting.
- **#1037 (`last_synced` never stamped on success):** `fullSync` never wrote
  `last_synced` on a clean apply — `applyRoadmapDiff`'s frontmatter branch only fires
  when before/after frontmatter differ (never here) and is a no-op in sharded mode — so
  `_meta.md` drifted arbitrarily stale even with zero errors. Added a `stampLastSynced`
  store operation (writes `_meta.md` in sharded mode, the aggregate frontmatter in
  monolith mode) and `fullSync` now stamps it on every successful non-dry-run writeback.
