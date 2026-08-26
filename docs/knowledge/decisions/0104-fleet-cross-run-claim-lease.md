---
number: 0104
title: Cross-run advisory work-claim lease for the -fleet family
date: 2026-08-26
status: accepted
tier: medium
source: docs/changes/fleet-cross-run-claim-lease/proposal.md
---

## Context

The `-fleet` family coordinates work _within_ a single invocation but has no signal
_across separate invocations_. Two people on different clones who start a fleet at
nearly the same time both enumerate the same backlog and build the same items. Every
existing safeguard is scoped to one machine or one run: the per-fleet concurrency
governor (default 2) bounds one run, `fleet-command`'s global leaf-slot budget bounds
one conductor invocation, and `compound-lock` (`packages/core/src/locks/compound-lock.ts`)
is an O_EXCL PID file under `.harness/locks/`, which is **gitignored** — a PID is
meaningless on another machine, so it cannot coordinate different clones.

The one cross-run signal that does exist — "drop items that already have an open PR"
(`roadmap-fleet/SKILL.md:53`) — fires only _after_ the first run has published a PR. It
is silent during the `SELECT → PR-open` window, which for a build item is the full
10–30 minute build duration. That window is precisely where the family's one uncovered
collision lives: the ID-based members (`roadmap-fleet`, `issue-fleet`, `pr-fleet`) whose
items already carry a GitHub-native id at SELECT can, and do, get built twice.

This is a family-wide contract every ID-based member must consume and every future member
must honor, which puts it at the same standing as ADR 0088 (the front-load / park model)
and warrants a standalone family ADR rather than prose buried in one member.

## Decision

Give the ID-based fleets a **GitHub-backed advisory work-claim lease** that bridges
exactly the `SELECT → PR-open` window, so concurrent runners auto-partition the backlog
instead of duplicating it. The mechanism is stated once in the family spine
(`docs/reference/fleet-family.md` §"Cross-run claim lease") and referenced — not restated —
by each member. **This ADR is the canonical decision record**; the spine documents the
mechanism, this ADR records _why it takes the shape it does_.

1. **Substrate = GitHub, not local state.** The claim is a GitHub issue/PR comment
   (an HTML marker `<!-- harness-fleet-claim -->` plus a fenced `FleetClaim` JSON payload)
   guarded by a `fleet:claimed` label. GitHub is the only real-time state two clones both
   see; `.harness/locks/` is gitignored and cannot cross machines.

2. **Soft reservation, not exactly-once — and we record why not.** Contention **skips and
   moves on** rather than blocking; concurrency becomes backlog auto-partitioning, matching
   the family front-load / park-and-continue model (ADR 0088). This is best-effort: it
   shrinks the duplicate window from full-build-duration to a sub-second reclaim race, never
   to zero. A hard, exactly-once guarantee would require a true compare-and-swap on a
   dedicated git ref — a heavier mechanism (a dedicated ref, CAS retry loops, and a
   reconciliation story for abandoned refs) whose cost is not justified when the residual
   double-work is by design **never worse than today's fully-uncoordinated behavior**. The
   soft reservation is the deliberate floor, not a limitation we failed to lift.

3. **Staleness is measured off the GitHub server clock, never the writer's.** A lease is
   live while `serverUpdatedAt + leaseSeconds > now`, computed from the claim comment's
   GitHub-server `updated_at`, not the writer-stamped `claimedAt` (which is advisory only).
   The server clock defeats cross-machine skew — a skewed writer can neither prematurely
   expire nor over-trust a claim — and lets a crashed run's lease self-heal with no manual
   `rm`, unlike `compound-lock`.

4. **The open PR is the durable claim.** The lease's entire lifetime is the
   `SELECT → PR-open` bridge. On PR-open the `fleet:claimed` label is removed (the comment
   stays as an audit trail) and the existing open-PR drop backstops the item thereafter.
   The lease adds no new durable state and no new lifetime to reason about beyond that window.

5. **v1 scope = ID-based members only.** `roadmap-fleet`, `issue-fleet`, and `pr-fleet`
   carry a GitHub-native id at SELECT, so the claim key needs no new id format and this is
   the highest-frequency collision. Area-based fleets (bug / cleanup / security / craft),
   whose unit of work is a path-set with no external id at SELECT, are already partly
   protected by disjoint-area construction within a run and are **deferred to v2** once the
   primitive is proven. Graceful degradation is mandatory: with `gh` auth absent a member
   falls back to open-PR-cross-check-only and logs the degradation — it never aborts.

## Consequences

- **Positive:** two clones running an ID-based fleet against the same backlog auto-partition
  it — each item ends with exactly one PR — closing the family's one uncovered cross-run
  collision. The claim record is human-visible on the issue. Staleness self-heals off the
  server clock, so a crashed run strands nothing. The mechanism reuses the existing open-PR
  drop as its durable backstop and adds no lock server, dedicated ref, or database. The
  contract lives once in the spine, so members cannot drift.
- **Negative / tradeoffs:** the guarantee is best-effort — a sub-second reclaim race can
  still double-build in the rare simultaneous-reclaim case (bounded, and never worse than
  today). The `--no-claim` escape hatch reverts to today's uncoordinated behavior, so a run
  that disables the lease has no cross-run dedup. The claim-scan adds a small, bounded GitHub
  API cost (piggybacked on the existing enumeration; heartbeat is a cheap REST comment-edit,
  never a GraphQL `gh pr list`). GitHub is a hard substrate dependency for the mechanism —
  hence the mandatory open-PR-only degradation path when auth is absent.
- **Reversibility:** high — the lease is advisory interaction/orchestration policy expressed
  in the spine plus a pure offline core module (`fleet/claims`); disabling it per run
  (`--no-claim`) or family-wide is a prose-and-flag change, not an architectural one.
  Superseding it (e.g. to lift v1 to area-based members or to a true-CAS lock) requires a
  replacement ADR the ID-based members adopt.

## Alternatives Considered

- **True compare-and-swap on a dedicated git ref (exactly-once mutex).** Rejected — an
  exactly-once guarantee costs a dedicated ref, CAS retry loops, and a reconciliation story
  for refs abandoned by crashed runs, for a marginal gain over a soft reservation whose
  residual double-work is already bounded to a sub-second race and never worse than today.
  Decision D3 in the source spec records this trade explicitly so the "why not exactly-once"
  reasoning is durable.
- **Local lock file (extend `compound-lock` across runs).** Rejected — `.harness/locks/` is
  gitignored and PID-based; it cannot be seen by another clone, which is the exact collision
  this ADR exists to close.
- **Trust the writer's `claimedAt` for staleness.** Rejected — cross-machine clock skew would
  let a skewed writer prematurely expire a live claim or over-trust a dead one; reading the
  GitHub-server `updated_at` removes the writer's clock from the trust path entirely.
- **Cover area-based fleets in v1.** Rejected — their unit of work has no external id at
  SELECT, so a GitHub-native claim key does not fit without a new id format; they are partly
  protected by disjoint-area construction within a run, so the primitive is proven first on
  the ID-based members and area coverage is deferred to v2.
- **Push cross-run coordination into `fleet-command`.** Rejected — the conductor bounds one
  invocation's slot budget; cross-invocation partitioning is emergent from the per-item
  claims the members take, so the coordination belongs to the members. The conductor's only
  role is passing `--lease-seconds` / `--no-claim` through to lanes.

## References

- Source proposal: `docs/changes/fleet-cross-run-claim-lease/proposal.md` (Decisions D1–D7).
- Canonical mechanism: `docs/reference/fleet-family.md` (§"Cross-run claim lease (ID-based members)").
- Companion: [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md) — the front-load / park-and-continue model whose soft-reservation posture this lease inherits.
- First instances: `agents/skills/claude-code/roadmap-fleet/SKILL.md`, `agents/skills/claude-code/issue-fleet/SKILL.md`, `agents/skills/claude-code/pr-fleet/SKILL.md` (SELECT drop, DISPATCH CLAIM→HEARTBEAT→RELEASE, lease flags).
- Conductor pass-through: `agents/skills/claude-code/fleet-command/SKILL.md` (`--lease-seconds` / `--no-claim` forwarded to lanes).
