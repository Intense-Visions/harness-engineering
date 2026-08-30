---
number: 0114
title: Roadmap-aggregate regeneration lives post-merge on main, not in pre-commit
date: 2026-08-30
status: accepted
tier: medium
source: parked decision issue #1268
---

## Context

`docs/roadmap.md` is a generated aggregate: the per-row shards under
`docs/roadmap.d/` are the source of truth, and the aggregate is rebuilt from them
by `harness roadmap regen` (`.gitattributes:27-30` documents exactly this, and
declares `docs/roadmap.md merge=ours`). The question of _where_ that regeneration
runs was parked by the `issue-fleet` lane as issue **#1268**, because two open
issues rewrote the same mechanism from opposite ends:

- **#1079** ("dogfood `harness roadmap install-hook`") wanted the repo's own
  `.husky/pre-commit` to stop hand-rolling the regen step and instead emit the
  fenced managed block that `packages/cli/src/commands/roadmap/install-hook.ts`
  produces (`buildRegenBlock`, lines 67-83; markers `HOOK_BLOCK_BEGIN/END`, lines
  28-31) — so harness's hook _is_ the adopter installer's output, one source of
  truth.
- **#1235** ("generated artifacts conflict on every parallel PR") named the roadmap
  aggregate as a guaranteed parallel-PR conflict source. Its root cause is
  structural: the aggregate is committed **and** required current inside every
  feature PR, so sibling PRs mutually conflict and must be merged serially with a
  regeneration pass between each. Its own text records that `merge=ours` does _not_
  help here — GitHub does not honor custom merge drivers server-side — so the only
  real fix is to stop feature branches from writing the aggregate at all, moving
  regeneration to a post-merge job on `main` (the baseline-refresh pattern this
  repo already runs).

The architectural core is a single decidable question: **where does
roadmap-aggregate regeneration live** — inside every feature commit (pre-commit),
or as a build product of `main` (post-merge)? Deciding it resolves the coupling
and dictates the sequencing, which is why this ADR decides the core rather than
escalating the pair.

The ground state has since moved (see the "Assumptions made" note below), which
makes the decision more urgent rather than moot: regeneration currently runs in
**both** places. The pre-commit managed block regenerates and `git add
docs/roadmap.md` whenever a shard is staged (`.husky/pre-commit:160-172`, the
verbatim output of the installer), _and_ `.github/workflows/roadmap-auto-done.yml`
regenerates the aggregate and commits it to the base branch with `[skip ci]` after
a PR merges (lines 138-170). Two writers of one file; the pre-commit writer still
puts `docs/roadmap.md` into feature branches, so #1235's conflict source is not
actually removed.

## Decision

**Roadmap-aggregate regeneration is authoritative post-merge on `main`, and
feature branches do not regenerate or commit `docs/roadmap.md`.**

Concretely:

1. **Sole regeneration site is the post-merge job.**
   `.github/workflows/roadmap-auto-done.yml` (already present) runs `harness
roadmap regen`, commits the aggregate with `[skip ci]`, and pushes to the base
   branch. This makes `docs/roadmap.md` a build product of `main`, not a
   per-commit-regenerated file — which structurally removes it as a parallel-PR
   conflict source (N sibling PRs can never collide on a file none of them writes).

2. **The pre-commit managed block stops writing the aggregate.** The
   `install-hook` managed block currently does `harness roadmap regen` +
   `git add docs/roadmap.md` on staged shards; that write is what reintroduces the
   conflict. The reconciliation is to have the pre-commit path guard shard/source
   _consistency_ only (the `--check`-style drift assertion via `harness validate`),
   not regenerate-and-stage the committed aggregate on feature branches.

3. **`#1235` is sequenced BEFORE `#1079`.** The regen-location contract (this ADR)
   is settled first; only then is the `install-hook` dogfood pointed at the final
   contract, so the managed block is authored once against a pre-commit path that
   no longer commits the aggregate — rather than dogfooded into a pre-commit step
   that is being removed.

Rationale: the aggregate is a fully-derived file whose freshness on `main` is what
matters; per-commit freshness on feature branches buys nothing (nobody reads a
feature branch's aggregate) and costs a guaranteed serial-merge tax on every
fan-out batch. The CI source-drift gate keeps the shards honest without requiring
the derived file to travel in the PR. This is the same shape as the repo's
baseline-refresh post-merge pattern.

> **Assumptions made.** Absent a live human decision, this ADR takes the CONFIRM
> recommended default: regeneration moves OUT of pre-commit to a post-merge job on
> `main`, and #1235 is sequenced before #1079. Since #1268 was parked, ground truth
> has shifted and this ADR is written against it: **both** #1079 and #1235 have
> closed (#1079 landed the pre-commit managed block in commit `44d7651a5`; #1235
> closed COMPLETED on 2026-08-25 having landed the post-merge job in
> `roadmap-auto-done.yml`), but they were **not reconciled** — the pre-commit block
> was left in place, so the repo is in the redundant dual-write state this ADR
> resolves. The decision therefore records the target end-state and the remaining
> reconciliation step (item 2), rather than net-new construction. It assumes the
> post-merge job's `[skip ci]` + rebase-retry push (`roadmap-auto-done.yml:174-205`)
> is a sufficient and already-proven writer, and that `merge=ours` on
> `docs/roadmap.md` stays as a local-merge convenience only, not relied upon
> server-side.

## Consequences

Positive:

- Sibling PRs never conflict on `docs/roadmap.md` — the largest tax on the `-fleet`
  family batch workflow (epic #1194) is removed for the aggregate.
- One writer, one contract: the aggregate on `main` is unambiguously produced by
  the post-merge job, ending the dual-write ambiguity that exists today.
- The batch/fan-out "merge serially, regenerate between each" playbook can be
  retired for the roadmap aggregate (one of #1235's acceptance criteria).

Negative / costs:

- A feature branch's checked-out `docs/roadmap.md` can lag its shards until the
  post-merge job runs; readers must treat the aggregate as authoritative only on
  `main`. The CI drift gate must assert _source_ (shard) consistency so a genuinely
  malformed shard is still caught pre-merge — the guard must not degrade into a
  no-op.
- The `#1079` dogfood is narrowed: the installer's managed block, as shipped,
  regenerates-and-stages; using it verbatim in this repo would reintroduce the
  conflict. Either the block is repointed at a check-only command here, or the
  installer grows a check-only mode — a small follow-up either way.

Neutral:

- The adopter-facing `install-hook` command and its `buildRegenBlock` output are
  unaffected as a _portable adopter convenience_; this ADR only governs _this
  repo's_ regen location. Adopters without a post-merge job may still prefer the
  pre-commit block.

## Alternatives Considered

- **(B) Keep regeneration in pre-commit via the managed block (do #1079 first).**
  Dogfoods the adopter installer and keeps the aggregate fresh per-commit. Rejected
  as the primary contract: it writes `docs/roadmap.md` into feature branches, which
  is precisely #1235's guaranteed-conflict source, and it leans on `merge=ours`,
  which #1235 documents as ineffective server-side on GitHub. This is effectively
  the state that already partly landed and did not remove the conflict.

- **(C) Both pre-commit and post-merge (the current de-facto state).** Two writers
  of one derived file. Rejected: redundant, retains the conflict source, and leaves
  two divergent notions of when the aggregate is "current." This is the state the
  reconciliation step exists to end.

- **(A-variant) Remove `docs/roadmap.md` from git entirely and render at docs-build
  time.** Cleanest in principle for a fully-derived file, and considered by #1235
  itself. Rejected for now because it costs GitHub browsability of the aggregate and
  touches the docs site — out of scope for resolving the sequencing question, though
  it remains a viable future step.

## References

- Parked decision: issue **#1268** — sequence #1079 against #1235 (both rewrite the
  same regen step).
- Issue **#1079** — dogfood `harness roadmap install-hook` in this repo's pre-commit
  (CLOSED; landed in commit `44d7651a5`).
- Issue **#1235** — generated artifacts conflict on every parallel PR (CLOSED
  COMPLETED 2026-08-25); proposes post-merge regeneration on `main`.
- `.husky/pre-commit:149-172` — the managed roadmap-regen block (installer output).
- `packages/cli/src/commands/roadmap/install-hook.ts:28-83` — `HOOK_BLOCK_BEGIN/END`
  markers and `buildRegenBlock`.
- `.github/workflows/roadmap-auto-done.yml:138-205` — post-merge regen + `[skip ci]`
  commit/push to base.
- `.gitattributes:27-30` — aggregate provenance note and `docs/roadmap.md merge=ours`.
- Epic **#1194** — the `-fleet` family that makes batch fan-out first-class.
