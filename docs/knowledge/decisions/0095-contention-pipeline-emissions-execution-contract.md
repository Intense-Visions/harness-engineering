---
number: 0095
title: Cross-lane contention from pipeline emissions and execution-contract blast radius
date: 2026-08-18
status: proposed
tier: medium
source: 'design routing of bug-backlog issues #1310, #1321'
---

## Context

The `fleet-command` conductor deconflicts parallel lanes by building a **contention map**
before dispatch (ADR 0091, decision 3). Two field failures expose the same structural gap in
how that map is derived: **the conductor reasons about collisions from what members' _queues_
touch, but collisions — and execution-contract changes — are created by members' per-item
_pipelines_ and by the _payloads_ they carry.** The model is built from the wrong source, so it
is blind to two whole classes of harm.

- **Pipeline-emission collisions (#1310, related to #1235).** The contention map is populated
  from probes — a member's queue, the items it will touch. But a per-item pipeline writes
  artifacts the queue never names: a wave-0 lane reverted `.harness/learnings.md` because its
  pipeline appended a line at EOF — "precisely the shape that conflicts across parallel PRs" —
  and the contention map never listed that file. The same blind spot covers session state and
  event logs: any artifact a pipeline emits, not just the items a queue selects, can collide.
  Compounding it, the append-at-EOF shape is maximally conflict-prone: every lane hand-reverts
  the same collision instead of the artifact being conflict-free by construction.

- **Execution-contract blast radius (#1321).** Nothing reasons about a queued lander payload's
  effect on the runtime **sibling lanes execute under**. The land queue's only PR rewrote
  `.harness/hooks/*` — the execution contract every other lane's subagents run under.
  Lander-last (ADR 0089's terminal placement) protects this case, but only by accident of
  ordering, and for an unrelated completeness reason. It does not detect that a queued PR
  changes siblings' runtime, does not prevent a mid-run merge from changing that contract under
  in-flight lanes, and never surfaces it to the human at CONFIRM.

## Decision

`fleet-command` derives contention and contract-risk from **pipeline emissions and payloads,
not probe queues**. Three rules, stated as law because each has an obvious-feeling shortcut.

1. **The contention map is derived from declared pipeline emissions, not probe queues.** Every
   `-fleet` member's per-item pipeline **declares the artifacts it writes** (learnings, session
   state, event logs, generated files); the conductor unions those declarations into the
   contention map. An artifact a pipeline can write belongs in the map whether or not the queue
   names it. A member whose pipeline emits an undeclared artifact is a gap to be closed at the
   member, not a collision to be discovered after a revert.

2. **Adopt structured per-run artifacts for the append-at-EOF shape.** The durable fix for
   `.harness/learnings.md` and its siblings is not better reverting — it is removing the
   collision. Append-at-EOF artifacts become **structured per-run files** (one file per run,
   keyed by run id), so parallel lanes never write the same line region and the merge is a
   directory union rather than a textual conflict. This shrinks the contention map by
   construction, consistent with ADR 0091's degradation-by-design principle.

3. **Classify queued PRs by on-run blast radius; gate execution-contract payloads.** Before
   dispatch the conductor inspects each queued PR's **payload**, not just its queue position. A
   payload touching `.harness/hooks/*`, CI workflow files, or shared tooling config is
   classified an **execution-contract change** — it alters the runtime siblings execute under.
   Such a payload is surfaced at CONFIRM as a fork with a recommended default (at minimum
   surfaced; ideally **refused while sibling lanes are in flight**), so the contract cannot be
   rewritten under in-flight lanes by mere merge ordering. Lander-last stops protecting this
   case by accident and starts protecting it by decision.

## Consequences

- **Positive:** collisions are planned against from their true source, so the append-at-EOF
  class stops being discovered one hand-revert at a time; the durable structured-artifact fix
  removes that class rather than mitigating it; a lander that rewrites siblings' runtime is
  seen, surfaced, and gated instead of merging under in-flight lanes; the human's one CONFIRM
  round now carries the contract-change decision it was silently missing.
- **Negative / tradeoffs:** every member must **declare its pipeline emissions**, and a member
  that under-declares reintroduces the blind spot — so the declaration is a maintained contract,
  not a one-time scan. Refusing an execution-contract land while siblings are in flight can
  defer a legitimate hooks/CI change to a later wave or run; this is deliberate — a contract
  change mid-run is exactly the mutation that makes in-flight lanes' verdicts untrustworthy.
- **Reversibility:** high — emission declaration, the per-run artifact shape, and the
  surface-vs-refuse strength of the contract gate are all policy in member/conductor prose,
  tunable without changing execution architecture. Superseding requires a replacement ADR.

## Alternatives Considered

- **Keep deriving contention from probe queues and add missed files by hand.** Rejected — it
  treats each blind spot as a one-off; the queue is structurally the wrong source, so the next
  undeclared emission collides the same way (#1310).
- **Fix `.harness/learnings.md` by teaching each lane to re-merge the append.** Rejected — every
  lane hand-reverting the same collision is the symptom; the append-at-EOF shape is the disease.
  Structured per-run files remove it (#1235).
- **Rely on lander-last ordering to protect the execution contract.** Rejected — it protects
  #1321 only by accident of an unrelated completeness placement; it neither detects the
  contract change nor prevents a mid-run merge from changing the runtime under in-flight lanes,
  nor surfaces it to the human.
- **Block every PR that touches `.harness/**` regardless of siblings.** Rejected — over-broad;
  the risk is a runtime change **while siblings are in flight\*\*, so the gate is scoped to
  execution-contract paths and conditioned on live lanes, not a blanket path ban.

## References

- Backlog: #1310 (pipeline-emission contention), #1321 (execution-contract blast radius),
  #1235 (append-at-EOF artifact shape).
- Companion: [`0089-pr-fleet-land-stage-human-merge-gate.md`](0089-pr-fleet-land-stage-human-merge-gate.md) — the land gate whose terminal placement this ADR turns from accidental to deliberate protection.
- Companion: [`0091-fleet-command-conductor-tier-authority-model.md`](0091-fleet-command-conductor-tier-authority-model.md) — the contention-map and CONFIRM-fork machinery (decisions 3 and 4) this ADR corrects at its source.
- Family overview: `docs/reference/fleet-family.md` (the `-fleet` spine and conductor tier).
