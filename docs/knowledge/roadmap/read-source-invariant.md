---
type: business_rule
domain: roadmap
tags: [read-source-invariant, roadmap, merge-ours, regeneration]
---

# Read-Source Invariant (R)

In sharded mode the per-row shards under `docs/roadmap.d/` are the canonical
roadmap; the aggregate roadmap file is a generated, `merge=ours` view. The
read-source invariant is the rule that keeps tool correctness independent of that
generated view:

> **Only the regenerator reads the aggregate. Every other tool reads the roadmap
> through `RoadmapStore` — i.e. from the shards in sharded mode.**

## Why it matters (for an agent)

If any tool parsed the aggregate for content, its correctness would silently depend
on the aggregate being fresh — which depends on per-developer git hooks and the
per-clone `merge.ours.driver` config. By forbidding aggregate reads everywhere
except the regenerator, the worst case of a stale aggregate is a cosmetic,
out-of-date _view_; no tool ever acts on wrong data. So: never read
`docs/roadmap.md` for content. Load the roadmap via the store
(`resolveRoadmapStore(...).load()`); write via the store's mutation methods.

## How it is enforced

`packages/core/src/validation/roadmap-read-source.ts`
(`findRoadmapReadSourceViolations`) scans `packages/*/src/**/*.ts` and flags a file
that either:

1. names the `roadmap.md` literal (a path constant, comment, or string), or
2. threads a roadmap-path variable into a raw `readFile`/`writeFile`.

A curated `ROADMAP_READ_ALLOWLIST` lists the only sanctioned files (the store, the
regenerator, the factory, and the git/merge tooling that names the path for
non-content purposes). `roadmap-read-source.repo.test.ts` runs the detector over the
whole repo in CI and fails on any unallowlisted violation. This guard runs under the
coverage suite, not per-task `vitest`, so run it explicitly
(`pnpm --filter @harness-engineering/core test roadmap-read-source`) when touching
roadmap code or docstrings.

## The documented fix when the guard fires

When an _incidental_ mention of the aggregate filename in `packages/*/src` trips the
guard (e.g. a docstring or an error message that says "roadmap.md"), the fix is to
**reword it** to "the aggregate" / "the roadmap file" — not to add the file to the
allowlist. The allowlist is reserved for genuine, sanctioned path references; growing
it to silence prose erodes the invariant. Code that legitimately needs the aggregate
path (a file-watch target, a serialization key) should obtain it from the store seam
`roadmapAggregatePath(projectRoot)` rather than hardcoding the literal.

A new Phase 6 safety net surfaces staleness without violating R: `harness validate`
regenerates from the shards and warns when the committed aggregate has drifted
(`checkRoadmapAggregateDrift`); the fix is `harness roadmap regen`.

## Cross-links

- ADR [0050](../decisions/0050-roadmap-read-source-invariant.md) — the decision.
- [`roadmap-store-abstraction.md`](roadmap-store-abstraction.md) — the store seam.
