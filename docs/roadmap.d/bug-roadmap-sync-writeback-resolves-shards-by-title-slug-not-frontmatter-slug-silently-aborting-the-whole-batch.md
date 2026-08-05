---
slug: "bug-roadmap-sync-writeback-resolves-shards-by-title-slug-not-frontmatter-slug-silently-aborting-the-whole-batch"
milestone: "Intake"
order: 30
---

### bug(roadmap): sync writeback resolves shards by title-slug not frontmatter slug, silently aborting the whole batch

- **Status:** planned
- **Spec:** .changeset/roadmap-writeback-slug-fix.md
- **Summary:** `applyRoadmapDiff` (packages/core/src/roadmap/store/apply-diff.ts) keys every shard by `slugifyFeatureName(feature.name)`, but the sharded store's real identity is the frontmatter `slug` — which `load()` enforces to equal the filename base, and which is frequently a hand-shortened or length-truncated form of the title. For the 22 shards (of 104) where `slugify(title) !== frontmatter.slug` (e.g. filename `lmlm-wire-engine-to-operator-surfaces` vs `slugify("LMLM Phases 4–9: wire the engine to operator surfaces")`), `patchFeature`/`addFeature`/`removeFeature` open `{slugify(title)}.md`, hit ENOENT, and `applyRoadmapDiff` **returns Err on the first failure — aborting the entire writeback batch**. Impact observed live during a full `roadmap sync --apply` (2026-08-04): all 11 external-ID backfills were dropped, `last_synced` was never stamped, and — most dangerously — a create path would have persisted the new issue on GitHub while failing to write its `externalId` back locally, so the next run recreates it (duplicate issues). **Fix:** resolve shards by the loaded feature's frontmatter slug (carry it on `RoadmapFeature` or index `before`/`after` by it), OR make the writeback collect per-shard errors instead of aborting on the first. Add a regression test with a shard whose title-slug ≠ frontmatter-slug. Workaround used on 2026-08-04: hand-backfill External-IDs so `changedFeatureNames` is empty and the buggy path is never entered.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P1
- **External-ID:** github:Intense-Visions/harness-engineering#1036