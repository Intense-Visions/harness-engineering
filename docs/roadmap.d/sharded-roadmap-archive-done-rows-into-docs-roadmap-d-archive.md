---
slug: "sharded-roadmap-archive-done-rows-into-docs-roadmap-d-archive"
milestone: "Maintenance: Lint & Deps"
order: 11
---

### Sharded roadmap: archive done rows into docs/roadmap.d/archive/

- **Status:** planned
- **Spec:** —
- **Summary:** Follow-up from #684 (roadmap sharding). Keep the active shard set lean by moving `done` rows out of `docs/roadmap.d/` into a `docs/roadmap.d/archive/` subdirectory — the sharded equivalent of the existing `docs/roadmap-archive.md` + RMH001 + groom "archive done" behavior. **Why this is the one organization idea worth doing** (per-status subdirs were rejected — path should encode identity/slug, not mutable status; a status change shouldn't move a file): - `done` is terminal/one-way, so the move cost is bounded (unlike planned↔in-progress↔blocked churn). - At merge time the active set was ~175 shards, roughly half done. **Scope / design constraints:** - The store/reconciler must MOVE a shard into `archive/` on the `done` transition (not just patch in place) — touches `patchFeature` + the auto-done reconciler. - `readShardDir`/assembler must glob recursively and keep slug uniqueness across `docs/roadmap.d/` and `docs/roadmap.d/archive/`. - Must UNIFY with the existing `docs/roadmap-archive.md` + RMH001 + groom archive path, not add a second archive mechanism. - Preserve invariant R (only the regenerator reads the aggregate) and the conflict-free single-shard-per-row property. See ADRs 0050 (read-source invariant) and the proposal at docs/changes/roadmap-shard-store/proposal.md.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#695
