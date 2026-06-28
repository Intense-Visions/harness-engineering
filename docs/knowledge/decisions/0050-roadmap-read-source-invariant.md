---
number: 0050
title: Roadmap Read-Source Invariant (R)
date: 2026-06-28
status: accepted
tier: large
source: docs/changes/roadmap-shard-store/proposal.md
---

## Context

The roadmap had grown into a single ~109 KB `docs/roadmap.md` aggregate that every
session edited in place — a permanent multi-writer conflict surface. The shard
store (Phases 1–5) splits it into per-row shards under `docs/roadmap.d/<slug>.md`
plus a `_meta.md`, and keeps the old aggregate alive only as a generated,
`merge=ours` view (ADRs/Decisions D3/D4). That generated aggregate is regenerated
by a local husky hook on commit/merge.

The danger of a generated-view-beside-the-source design is that tool correctness
could quietly come to depend on the freshness of the generated file — which in turn
depends on per-developer hook setup and the `merge.ours.driver` config. If any tool
parsed `docs/roadmap.md` for content, a clone that had not run the hooks (or had a
stale aggregate) would make that tool read wrong data. Correctness must not be a
function of local git plumbing.

## Decision

Records **invariant R** from the spec's Decisions table (canonical text lives
there; this ADR is the load-bearing pointer).

> **Only the regenerator reads the aggregate.** Every other harness tool reads the
> roadmap exclusively through `RoadmapStore` (which reads the shards in sharded
> mode, the aggregate only in monolith mode). No tool parses the generated
> aggregate for content.

This is enforced mechanically, not by convention:

- `packages/core/src/validation/roadmap-read-source.ts`
  (`findRoadmapReadSourceViolations`) flags any file under `packages/*/src/**/*.ts`
  that either names the `roadmap.md` literal or threads a roadmap-path variable
  into a raw `readFile`/`writeFile`. A curated `ROADMAP_READ_ALLOWLIST` names the
  only sanctioned exceptions (the store, the regenerator, the factory, and the
  git/merge tooling that references the path for non-content purposes).
- `roadmap-read-source.repo.test.ts` runs the detector over the whole repo and
  fails CI on any unallowlisted violation. New allowlist entries are visible in
  code review — adding one is a conscious decision, not an accident.

## Consequences

- The worst-case failure mode of a stale or missing aggregate is a cosmetic,
  out-of-date _view_; no tool ever reads wrong data, regardless of hook/merge-driver
  setup. Correctness is decoupled from local git plumbing.
- A new adopter-facing safety net (Phase 6) makes staleness _visible_: `harness
validate` regenerates from the shards and warns when the committed aggregate has
  drifted (`checkRoadmapAggregateDrift`), so CI catches it and `harness roadmap
regen` fixes it.
- Incidental mentions of the aggregate filename in `packages/*/src` must be reworded
  to "the aggregate"/"the roadmap file" rather than added to the allowlist — the
  allowlist is reserved for genuine path references, not prose. (See the Phase 5
  reword of two reconcile docstrings.)
- The guard adds a small authoring tax: code that legitimately needs the aggregate
  path (a watch target, a serialization key) must obtain it from the store seam
  (`roadmapAggregatePath`) rather than hardcoding the literal.

See also: the knowledge entry
[`read-source-invariant.md`](../roadmap/read-source-invariant.md) (agent-facing
explanation) and the companion ADR
[0051](0051-slug-identity-external-id-sync-key.md).
