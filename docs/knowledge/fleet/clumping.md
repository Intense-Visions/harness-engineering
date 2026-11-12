---
type: business_concept
domain: fleet
tags:
  [clumping, fleet-control, ceremony-cost, work-unit-granularity, noise-floor, dedup, scope-kind]
---

# Clumping

Three related concepts introduced by the clumping feature
(`docs/changes/clumping/proposal.md`), materialized here so the knowledge pipeline ingests them
as graph nodes. They are authored concepts, not extracted ones: the first names a control and
its two siblings, the second is the generalizable insight underneath it, and the third is the
misreading the other two are most likely to receive.

## What they are

**`clumping`** — a fleet-family control stated as one mechanical rule: **a finding below the
floor is acted on rather than filed, and a set of like findings becomes one work item rather
than N.** It binds at the three seams where findings become work — creation, intake and
execution — from one implementation in `packages/core/src/fleet/clumping/`. Items are grouped by
`(scope × kind)` under a hard non-conflict precondition (no two members may require the same
hunk); the cap counts **emitted work units**, never findings; everything shed — floored,
over-cap, ungraded, solo — is counted and reported; and an item with no gradable signal is
**terminal**, never floored and never clumped. See ADR 0135.

**`ceremony-cost-invariant-to-payload-size`** — the property that makes high-rate small-finding
emission pathological. Every work item pays a fixed toll — an issue, a branch, a worktree, a
3-OS CI matrix, a review pass, a merge, a baseline-refresh PR — and that toll **does not scale
with the size of the payload**: a one-line fix and a subsystem rewrite pay the same. So as the
emission rate rises and the payload shrinks, the ratio inverts and the ceremony becomes the
work. The second-order effect is the worse one: a small item is _tractable_, so an agent with a
choice picks it, and a backlog of small items quietly crowds out the work that moves the
project. This concept **generalizes past this repo** — it holds for any process whose per-item
overhead is constant and whose item size is shrinking — and it is the reusable half of the
insight. Measured instance (2026-11-10, and re-measured 2026-11-11 at 16): 15 of the last 25 merged PRs
in this repo were `chore: refresh baselines after merge` — one per merged PR, carrying no payload
at all. The figure drifts; the ratio is what the concept names.

**`clumping-is-not-dedup`** — dedup removes **restatements of one thing**; clumping groups
**distinct things** that demand the same judgment over the same scope. The two axes are
independent and both run: `issue-fleet` already dedups, and gains clumping as a **fifth**
triage axis beside label / dedup / route / prioritize rather than in place of dedup. Conflating
them is the likeliest misreading, and it fails in both directions — a deduper that "clumps" drops
real work, and a clumper that "dedups" files N restatements as one bundle and hides the
duplication.

## Relationships

- `clumping` is a **sibling of** the **concurrency governor** (machine-storm cap) and the
  **per-leaf context-replay budget** under the shared concept of a **fleet control**: each caps a
  different term of the same cost. The governor caps _how many_ leaves run at once, the context
  budget caps _how much context each leaf loads_, the global spend envelope caps _how much a
  whole run may spend_, and clumping caps **how many work units the queue is made of in the first
  place**. All four are stated in `docs/reference/fleet-family.md` and consumed by members by
  reference rather than restatement.
- `clumping` **is motivated by** `ceremony-cost-invariant-to-payload-size`. Remove the
  invariance — make the toll proportional to the payload — and the control has no purpose.
- `clumping` **is not** `dedup`, and **composes with** it: both run, in that order, on the same
  intake queue.
- `clumping` **supersedes the review-attention half** of the per-leaf batching slice deferred
  under #1524, which was argued on token-cost grounds only. #1524 keeps the token-cost half: it
  governs what a leaf loads, clumping governs how many leaves there are.
- `craft-fleet` **already carried** the principle as prose (`SKILL.md:78` the floor rule, `:218`
  the one-kind-over-one-scope rationale, `:89` the emitted-item cap). Clumping converts that
  convention into a constraint — the same move ADR 0097 records for the family generally.
- The three **seam adapters** (craft/review creation, `issue-fleet` intake, the build-shaped
  members' execution) **consume** `ClumpableItem` and `Clump`; core knows nothing about findings,
  issues or PRs.

## See also

- ADR 0135 — clumping's five operative decisions
  (`0135-clumping-floor-and-group-control-for-the-fleet-spine.md`).
- ADR 0097 — enforcement mechanism over prose for the fleet family.
- ADR 0019 — the 3-axis craft model the floor's `axes` grade reads.
- `docs/reference/fleet-family.md`, §"The clumping floor (work-unit granularity)" — the spine
  statement, beside its three sibling controls.
- `packages/core/src/fleet/clumping/` — the shipped primitive (`floor.ts`, `form.ts`,
  `types.ts`).
- Spec: `docs/changes/clumping/proposal.md` (Knowledge Impact).
