---
type: business_concept
domain: roadmap
tags: [roadmap-store, sharding, monolith, shard, regeneration, determinism]
---

# Roadmap Store Abstraction

The Roadmap Store is the single read/write seam for the project roadmap. Every
harness consumer loads and mutates the roadmap through a backend-agnostic
`RoadmapStore` interface, so the same code works whether the roadmap is a single
monolith file or a directory of per-row shards. The storage layout is auto-detected
(not configured) by `detectRoadmapStorageMode` in
`packages/core/src/roadmap/load-mode.ts`: `docs/roadmap.d/` present ⇒ `sharded`,
otherwise `monolith`.

## The interface and its two backends

`RoadmapStore` exposes `load()` plus the mutation methods (`patchFeature`,
`addFeature`, `removeFeature`, `patchFrontmatter`, `patchAssignmentHistory`). Both
backends return the same in-memory `Roadmap` shape from `load()`, so callers never
branch on layout:

- **`MonolithStore`** — reads and whole-file rewrites a single aggregate
  (`docs/roadmap.md`). The aggregate IS the source; there is nothing to regenerate.
- **`ShardStore`** — reads the shard directory and assembles a `Roadmap`; each
  mutation rewrites exactly one shard file (conflict-free by construction). It is
  wrapped by a decorator (`withAggregateRegen`) that regenerates the aggregate after
  every successful write so same-process readers and the on-disk view stay fresh.

`resolveRoadmapStore({ projectRoot })` (and the file-anchored
`resolveRoadmapStoreForFile`) is the factory. It delegates layout detection to the
single authority `detectRoadmapStorageMode`, so the formal storage mode and the
chosen backend can never disagree.

## Shard layout

A sharded roadmap is a directory `docs/roadmap.d/`:

- `_meta.md` — frontmatter (`project`, `version`, `last_synced`, `last_manual_edit`,
  the ordered `milestones:` list) plus an optional `## Assignment History` body.
  A freshly initialized project has `milestones: []` and no history.
- `<slug>.md` — one shard per roadmap row, named by its slug (the local identity;
  see [`slug-issue-identity.md`](slug-issue-identity.md)).

`_meta.md` is serialized by `serializeMeta`/parsed by `parseMeta`, which are hand-
written for byte-stability (the `yaml` package keeps ISO timestamps as strings; an
empty milestones list emits `milestones: []` so it round-trips).

## Regeneration determinism

The aggregate is produced by `regenerate(shardDir, io)`: read `_meta` + shards →
`assembleRoadmap` → `serializeRoadmap`. Determinism is inherited end to end —
`readShardDir` reads in sorted order, `assembleRoadmap` orders deterministically by
the `_meta` milestone list, and `serializeRoadmap` is a pure emitter — so two
consecutive regenerations of the same shards are byte-identical. This determinism is
what makes the generated aggregate safe to commit: `git config merge.ours.driver
true` keeps merges from re-introducing conflicts, and `format:check` no longer sees
live drift because the bytes are stable.

## Cross-links

- ADR [0050](../decisions/0050-roadmap-read-source-invariant.md) — read-source
  invariant R (only the regenerator reads the aggregate).
- [`read-source-invariant.md`](read-source-invariant.md) — agent-facing invariant R.
- [`merge-triggered-auto-done.md`](merge-triggered-auto-done.md) — how a merged PR
  flips a single shard to `done`.
- [`file-less-roadmap-mode.md`](file-less-roadmap-mode.md) — the orthogonal
  `RoadmapMode` (file-backed vs file-less) axis.

## Key Files

- `packages/core/src/roadmap/load-mode.ts` — `detectRoadmapStorageMode`,
  `RoadmapStorageMode`.
- `packages/core/src/roadmap/store/factory.ts` — `resolveRoadmapStore` /
  `resolveRoadmapStoreForFile`, `roadmapAggregatePath`.
- `packages/core/src/roadmap/store/shard-store.ts`, `monolith-store.ts` — backends.
- `packages/core/src/roadmap/store/meta.ts` — `parseMeta` / `serializeMeta`.
- `packages/core/src/roadmap/store/regenerator.ts` — `regenerate` /
  `writeRegeneratedRoadmap`.
