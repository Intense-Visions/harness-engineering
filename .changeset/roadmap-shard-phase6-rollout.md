---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Phase 6 of the roadmap shard store: make sharding discoverable, documented, and
the default for new projects.

- **Single detection authority.** `detectRoadmapStorageMode` (and the
  `RoadmapStorageMode` type) now live in `packages/core/src/roadmap/load-mode.ts`
  as the one place that decides `monolith` vs `sharded` (by the presence of
  `docs/roadmap.d/`). `store/factory.ts` delegates to it instead of carrying its
  own inline existence check, so the formal storage mode and the chosen store
  backend can never disagree. Storage mode is modelled as an axis orthogonal to
  `RoadmapMode` (file-backed vs file-less), so the ~28 existing mode consumers are
  unaffected.
- **Sharded-by-default `harness init`.** A brand-new project is scaffolded with an
  empty `docs/roadmap.d/_meta.md` (emitted via the core `serializeMeta` serializer
  for byte-stable round-tripping) and NO monolith `docs/roadmap.md`. Existing
  projects are left untouched and opt in via `harness roadmap shard`.
- **Aggregate-drift doctor.** `harness validate` now warns when `docs/roadmap.d/`
  exists but the committed aggregate is stale versus `regenerate(shards)` — the
  CI-checkable freshness contract for adopters, fixed by `harness roadmap regen`.
  No-ops for monolith projects.
- **Documentation.** ADRs 0050 (read-source invariant R) and 0051 (slug identity +
  External-ID sync key), knowledge entries for the roadmap-store abstraction,
  read-source invariant, slug↔issue identity, and merge-triggered auto-done, an
  adoption/rollout guide, the AGENTS.md roadmap section, and the harness skills
  (agents stop hand-marking rows; promote stages shard + regenerated aggregate).
