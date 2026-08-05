---
title: Sharded roadmap — archive done rows into docs/roadmap.d/archive/
slug: roadmap-sharded-archive
status: proposed
keywords:
  - roadmap
  - sharding
  - archive
  - groom
  - roadmap-store
  - read-source-invariant
---

# Sharded roadmap: archive done rows into `docs/roadmap.d/archive/`

## Overview & Goals

### Problem

The sharded roadmap (`docs/roadmap.d/<slug>.md`, one file per row, introduced in
#684) accumulates `done` rows. At the time of writing the active shard set is ~175
files, roughly half of them `done`. Every `done` shard still participates in the
active read path — it is parsed by `readShardDir`, assembled into the in-memory
`Roadmap`, rendered into the regenerated aggregate `docs/roadmap.md`, and returned by
active `show`/`query`. This bloats the active set the orchestrator and humans read.

The monolith roadmap already has an archive motion: `groom` lifts `done` rows out of
active milestones and the CLI appends them to a standalone `docs/roadmap-archive.md`.
The sharded backend had no equivalent — in sharded mode `groom` simply **deleted**
each done shard (via `removeFeature`) and appended it to the monolith
`docs/roadmap-archive.md`, mixing the two storage models and discarding the shard's
per-row file shape.

### Goal

Give the sharded backend a sharded archive: `done` shards are **moved** into
`docs/roadmap.d/archive/<slug>.md`, keeping the active `docs/roadmap.d/` lean while
preserving each shard's full content (frontmatter + body) as history. The move is
lossless and reversible.

## Decisions

- **D1 — Extend `groom`, not a new action.** The archive motion stays behind the
  existing `manage_roadmap` `groom` action, matching the established API. In sharded
  mode `groom` archives into the sharded archive; in monolith mode it appends to
  `docs/roadmap-archive.md` as before. The command surface is unchanged.

- **D2 — Move, don't delete.** A `done` shard is MOVED byte-for-byte from
  `docs/roadmap.d/<slug>.md` to `docs/roadmap.d/archive/<slug>.md` (read source →
  write dest → delete source). Copying the raw file bytes (rather than
  re-serializing the in-memory feature) guarantees full-fidelity preservation of
  frontmatter, body, and any prose, and makes the motion trivially reversible
  (`restoreShards`).

- **D3 — Archive is excluded from the active set (not recursively globbed).**
  `readShardDir` reads only the immediate `.md` children of `docs/roadmap.d/`,
  excluding `_meta.md` and the `archive/` subdirectory. Because the archive lives in
  a subdirectory, `load()`, the regenerated aggregate, and active `show`/`query`
  automatically exclude archived shards. The archive is history, not active state, so
  it must not re-appear in or double-count against the active roadmap. (This differs
  from an alternative "glob recursively + enforce slug uniqueness across both dirs"
  design; exclusion is simpler and matches the semantics of an archive.)

- **D4 — Aggregate regenerated on archive.** The archive motion regenerates
  `docs/roadmap.md` from the remaining active shards immediately, so archived rows
  drop out of the aggregate even when the groom made no other (demotion) changes that
  would otherwise trigger regeneration. Invariant R holds: only the regenerator reads
  the aggregate, and the shard directory literals (`roadmap.d`, `archive`) live in the
  store module, not in the CLI.

- **D5 — Backward compatible.** The monolith path is untouched. The core additions
  are purely additive (`archiveShards`, `restoreShards`, `readArchivedShards`,
  `archiveShardDir`, `ARCHIVE_SUBDIR`, `archiveDoneShardsForProject`).

## Acceptance Criteria

- Running `groom` in sharded mode moves each `done` shard from
  `docs/roadmap.d/<slug>.md` into `docs/roadmap.d/archive/<slug>.md`, preserving the
  file byte-for-byte.
- Archived shards are excluded from the active aggregate (`docs/roadmap.md`), from
  `load()`, and from active `show`/`query`.
- Non-`done` shards remain in the active set; demotion of unactionable `planned` rows
  continues to work in sharded mode.
- The move round-trips: `restoreShards` returns an archived shard to the active set
  byte-for-byte.
- `groom` is idempotent: a second run reports no changes and leaves the archive
  untouched.
- The monolith `groom`/archive path is unchanged.

## Follow-up

- Running the archive motion on the live roadmap (moving the repo's ~half-`done`
  shards into `docs/roadmap.d/archive/`) is a large mechanical move and is
  intentionally out of scope for this PR — this PR ships the capability + tests.
- Wiring the auto-done reconciler to archive on the `done` transition (not just at
  `groom` time) is a possible future extension.
