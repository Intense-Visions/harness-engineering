---
number: 0091
title: The fleet-command conductor-tier authority model
date: 2026-08-08
status: accepted
tier: large
source: docs/changes/fleet-command/proposal.md
---

## Context

Eleven `-fleet` members now exist. Each is a self-contained orchestrator over one SDLC work-queue,
and each honors the family's invariants locally: a concurrency governor of 2 (max ~3) concurrent
subagents, one up-front human CONFIRM gate, independent artifact + all-OS-CI verification, and no
silent merge (see the `-fleet` spine and ADR 0087 / ADR 0088).

Running **more than one member in the same session** breaks assumptions that hold only per fleet,
and there is no actor positioned to repair them:

- **The governor is local.** Two members at their own caps is 6 concurrent build agents; the
  maintenance sweeps together are ~18. Every member is individually well-behaved and the aggregate
  is a machine-storm. A cap each participant honors locally and nobody enforces globally is not a
  cap.
- **The conveyor is a dependency chain.** Intake produces the queue decide and build consume; land
  lands what the others produced. Run concurrently, each member consumes its predecessor's stale
  output; run all serially, the independent quality sweeps lose their genuine parallelism.
- **Members collide on shared surfaces.** Generated artifacts (the skills catalog, the platform
  command manifests, the roadmap aggregate), allocated sequences (ADR numbers, shard slugs),
  same-region source edits, and duplicate filings — one defect can arrive as four tracker items,
  each individually correct, because no member can see the others.

A new tier is therefore required, and its authority has to be settled before it is built, because
the tempting designs both fail. A **dictator** that collapses the members' CONFIRM gates into one
approval converts eleven human taste-checks into one machine judgment — the exact collapse the
family exists to prevent, now at eleven times the blast radius. A **pure launcher** that only
starts fleets in order fixes nothing: the governor is still additive, the collisions still land on
the human, and the reports still arrive as eleven piles to collate by hand.

## Decision

`fleet-command` adopts a **coordinator plus global governor** authority model. It owns scheduling,
the budget, deconfliction, and reporting; it owns none of the judgment inside the fleets it runs.
Four properties define it, and all four are stated as law rather than guidance because each has an
obvious-feeling shortcut.

1. **One global budget, over units that are actually observable.** The scarce resource is consumed
   by the **leaf** subagents a member's DISPATCH fans out, not by a member's own cheap
   select/confirm/verify/report phases — so the governor allocates **leaf slots** from a single
   global pool (default 3, hard max 4), with no member ever allocated more than the family's own
   per-fleet cap of ~3. Members are admitted to their fan-out phase only when a slot frees; a
   member in a cheap phase holds no slot, which is what allows several lanes in flight at
   single-fleet aggregate load. The run is additionally bounded by **one pass per fleet**, a
   **fleet cap**, and a **wall-clock budget**. Token spend is _not_ metered: the harness cannot
   observe tokens inside dispatched subagents, so the budget governs slots, passes, fleets, and
   time, and says so rather than implying enforcement it cannot perform.

2. **Run order is derived, never chosen ad hoc.** The schedule is a hybrid DAG: a **CI
   prerequisite** wave first (every downstream member's verification treats all-OS-CI-green as its
   evidence, so an untrustworthy CI signal invalidates every downstream verdict), then the conveyor
   spine in dependency order with the independent quality sweeps parallel alongside, and the land
   stage terminal because it lands what every other lane produced. An empty-queue member is
   reported unscheduled rather than run; excluding a member re-derives its dependents.

3. **Member gates are batched, never answered.** The human sees one run-plan authorization up
   front, then at most one batched gate round per DAG wave in which every ready member's own
   CONFIRM is presented **verbatim and unmodified**. The conductor never pre-answers, defaults,
   skips, or summarizes a member's gate. A member blocked on its gate parks its lane; other lanes
   continue. Batching is scheduling; answering would be the collapse this ADR rejects.

4. **Verification reads the children's artifacts; it never trusts them and never re-runs them.**
   The family's invariant is that a self-report is never verification — but re-verifying every item
   duplicates work each member already did to the same standard. The conductor therefore verifies
   the **lane**: the terminal artifact exists, per-item verdicts are present with the references
   they were drawn from and those references are independently spot-checked, the lane stayed within
   its global allocation, and nothing was merged outside a human-authorized land inside the land
   member's own gate. All-OS CI is **recorded as not-applicable at this tier** — the conductor
   emits no code and opens no PR of its own — never silently omitted. And it **never merges**: its
   merge-order plan is advice attached to its report.

## Consequences

- **Positive:** a multi-fleet run is bounded by the same machine-storm limit a single fleet is,
  rather than by the sum of the members' governors; the dependency shape is derived once and
  correctly instead of held in the operator's head each session; the collision classes that made
  batch fan-out expensive are planned against explicitly, including the cross-fleet duplicate
  filings no member can see; the human's interruption count drops from eleven scattered gates to
  one authorization plus a few batched rounds **without any member losing its gate**; and the
  whole run produces one report instead of eleven piles.
- **Negative / tradeoffs:** the global cap means a multi-fleet run is not much faster than a
  well-sequenced single-fleet one — deliberate, since the alternative is a storm whose re-runs cost
  more than the parallelism saves. Batched gates add scheduling latency: a ready member waits for
  its wave-mates before its gate is presented. And the conductor must know each member's dependency
  position, so adding a member means placing it in the DAG.
- **Reversibility:** high — the budget numbers, the wave assignment, and the gate-batching policy
  are all interaction policy expressed in skill prose. Changing the slot default, re-placing a
  member in the DAG, or presenting gates per-member instead of per-wave is a prose change, not an
  architecture change. Collapsing the member gates into one approval would _not_ be reversible in
  the same sense: it changes where decision authority sits, and would supersede this ADR.
- **Degradation by design:** the deconfliction map is built over collision **classes**, so if a
  class is eliminated upstream — for instance by removing derived counters from generated prose and
  moving regeneration to a post-merge job — that row comes back empty and the merge-order plan is a
  no-op rather than a stale playbook that must be rewritten.

## Alternatives Considered

- **Collapse every member's CONFIRM into one conductor-level approval.** Rejected — it converts
  eleven human taste-checks into one machine judgment at eleven times the blast radius, which is
  precisely the failure the family's gates exist to prevent. Batching the gates achieves the
  ergonomic win without touching the authority.
- **A pure launcher that starts members in a fixed order and does nothing else.** Rejected — the
  governor stays additive (the machine-storm is unfixed), the collisions still land on the human,
  and the reports still arrive unconsolidated. It would add a tier and solve none of the three
  problems that motivate one.
- **Sum the per-fleet governors and cap the number of concurrent fleets instead.** Rejected —
  wrong unit. One member in its fan-out phase outweighs three members in their cheap phases, so a
  fleet-count cap is simultaneously too permissive and too restrictive. Slots are the resource.
- **Re-verify every item every member produced.** Rejected — it duplicates work already done to the
  family standard and roughly doubles the cost of the run for no new evidence. Verifying the lane
  from emitted artifacts, with independent spot-checks of the references, satisfies the
  never-trust-a-self-report invariant without paying twice.
- **Let the conductor merge the verified batch itself, since it holds the merge-order plan.**
  Rejected — the merge decision is a human act held by the land member's own gate. A conductor that
  merges is a conductor that has removed the one review the entire model is built around.
- **Conduct the convergence pipelines directly as well as the fleets.** Rejected — pipelines are
  the convergence primitive a fleet runs, not a queue to fan out over. Scheduling them at this tier
  collapses the Skills → Pipelines → Fleets → Conductor distinction the family is built on.

## References

- Source proposal: `docs/changes/fleet-command/proposal.md`.
- Companion: [`0087-subagent-fanout-vs-workflow-primitive.md`](0087-subagent-fanout-vs-workflow-primitive.md) — the execution architecture every lane runs on.
- Companion: [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md) — the interaction model the run-plan authorization and lane parking extend.
- Companion: [`0089-pr-fleet-land-stage-human-merge-gate.md`](0089-pr-fleet-land-stage-human-merge-gate.md) — the merge gate the conductor's merge-order plan feeds and never bypasses.
- Companion: [`0090-adr-fleet-decide-stage-batch-signoff.md`](0090-adr-fleet-decide-stage-batch-signoff.md) — the decide-stage gate, one of the member gates batched but never answered.
- First instance: `agents/skills/claude-code/fleet-command/SKILL.md`.
- Family overview: `docs/reference/fleet-family.md` (the `-fleet` spine, its invariants, and the conductor tier above them).
