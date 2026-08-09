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
Five properties define it, and all five are stated as law rather than guidance because each has an
obvious-feeling shortcut.

1. **One global budget, over units that are actually observable, imposed through a named seam.** The
   scarce resource is consumed by the **leaf** subagents a member's DISPATCH fans out, not by a
   member's own cheap select/confirm/verify/report phases — so the governor allocates **leaf slots**
   from a single global pool (default 3, hard max 4), with no member ever allocated more than **2**
   of that pool. The sub-cap is the family's per-fleet **default**, not its ceiling of ~3: pinning
   it to the ceiling would let one lane hold the entire pool at the default setting, whereas 2
   keeps at least two lanes genuinely in flight. Members are admitted to their fan-out phase only
   when a slot frees; a member in a cheap phase holds no slot, which is what allows several lanes in
   flight at single-fleet aggregate load.

   The allocation is **enforced at dispatch time through each member's own `--concurrency` flag** —
   every member of the family exposes one, and the conductor launches each lane with
   `--concurrency <allocated>`. This is the only seam the global cap has. A lane dispatched without
   it reverts to the member's own single-fleet default of 2 and the pool becomes an aspiration,
   which is the additive-cap failure this tier exists to prevent, reproduced by the actor built to
   prevent it. The run is additionally bounded by **one pass per fleet**, a **fleet cap** whose shed
   order is structural, and a **wall-clock budget** compared against a run start timestamp at each
   wave boundary before the next wave is scheduled. Token spend is _not_ metered: the harness cannot
   observe tokens inside dispatched subagents, so the budget governs slots, passes, fleets, and
   time, and says so rather than implying enforcement it cannot perform.

2. **Run order is derived, never chosen ad hoc — and wave 0 is a trust gate, not a repair.** The
   schedule is a hybrid DAG: a **CI trust gate** first, then ideation in its own wave, then intake
   with the independent quality sweeps parallel alongside, then decide, then build, with the land
   stage terminal because it lands what every other lane produced. No wave contains a dependency
   edge — a wave is the dependency barrier, which is what keeps "at most one batched gate round per
   wave" satisfiable. An empty-queue member is reported unscheduled rather than run; excluding a
   member re-derives its dependents; an emptied wave is skipped rather than renumbered.

   Wave 0 **cannot deliver a repaired CI signal within the run**, and the ADR says so rather than
   implying a precondition the schedule cannot supply. The CI member's terminal act is a report: it
   hands back **unmerged** remediation PRs, the conductor merges nothing, and the lander is
   terminal — so waves 1..N execute against the same signal wave 0 observed. What the wave-0 lane
   produces within the run is **evidence-quality information plus remediation PRs whose payoff
   lands on the next run**. The trust read is available before dispatch, since a red or flaky CI
   queue depth _is_ the signal's trust level, so an untrustworthy signal is surfaced at CONFIRM as a
   **fork with a recommended default** — run the CI member alone this session, proceed with every
   downstream verdict labelled degraded, or trim the fleets that lean hardest on CI — and whatever
   the human chooses is recorded in the report.

   The sweeps are **input-independent of the spine and output-coupled to it**. Their inputs come
   from standing code, which is what makes running them beside intake safe; but several of them file
   issues and roadmap items into the very queue intake triages, so those filings are intake for the
   **next** run and are recorded as such in the run's assumptions-made note. They are deliberately
   not serialized behind intake: doing so would spend the schedule's largest source of parallelism
   to freshen a queue the next run picks up anyway.

3. **Cross-fleet deconfliction is a first-class product of the tier, not a side effect.** Before any
   lane is dispatched the conductor builds a **contention map** over four collision classes —
   generated artifacts, allocated sequences, same-region source edits, and duplicate filings — and
   resolves each with the **cheapest sufficient mechanism** for it: a merge-order plan with
   regeneration sequencing for the textual class, serialization into different waves for
   sequence-allocating writers, outright lane serialization for same-region editors (a semantic
   conflict no ordering reconciles), and cross-fleet dedup at report time for filings. The
   mechanisms are unequal because the collisions are; applying the cheap mechanism to the expensive
   class produces something that looks like a resolution and is not. Deferrals are bounded: a
   deferral that would reach the terminal lander's wave sheds its lane with a reason instead. The
   map is built over **classes rather than a hard-coded playbook**, so a class eliminated upstream
   makes that row come back **empty and the merge-order plan a no-op** — degradation by design,
   because a mechanism written against today's conflict shape would quietly reward leaving the tax
   in place. Duplicate filings are the class **no single member can see at all**, which is precisely
   why deduplication belongs to this tier and not to any member.

4. **Member gates are batched, never answered — and never fired outside their wave.** The human sees
   one run-plan authorization up front, then at most one batched gate round per DAG wave in which
   every ready member's own CONFIRM is presented **verbatim and unmodified**. The conductor never
   pre-answers, defaults, skips, or summarizes a member's gate. A member blocked on its gate parks
   its lane; other lanes continue. Batching is scheduling; answering would be the collapse this ADR
   rejects. The same rule constrains **probing**: queue depth is read only through a member's
   **gate-free** path, never through a gated dry-run path that would fire that member's CONFIRM
   during the conductor's own SELECT. A member with no gate-free path is recorded as **queue depth
   unknown** and scheduled on the human's call, which keeps CONFIRM the only guaranteed human
   touchpoint before the first lane starts.

5. **Verification reads the children's artifacts; it never trusts them and never re-runs them.**
   The family's invariant is that a self-report is never verification — but re-verifying every item
   duplicates work each member already did to the same standard. The conductor therefore verifies
   the **lane**: the terminal artifact exists, per-item verdicts are present with the references
   they were drawn from and those references are independently spot-checked, and nothing was merged
   outside a human-authorized land inside the land member's own gate. The two invariants are not
   evidenced alike and are not stated alike: **nothing-merged is a verified check** (a merge leaves
   a durable trace the conductor reads directly), while **staying within allocation is not** — no
   artifact records a lane's peak concurrency, so it is reported as a **dispatch-time-enforced
   property recorded as an assumption**, backed by the checkable fact that the lane was launched
   with its allocated `--concurrency`. Claiming a check with no evidence behind it would be the
   self-report failure one tier up. All-OS CI is **recorded as not-applicable at this tier** — the
   conductor emits no code and opens no PR of its own — never silently omitted. And it **never
   merges**: its merge-order plan is advice attached to its report, containing only lanes that
   actually emit mergeable artifacts.

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
- **Degradation by design:** decision property 3 makes the deconfliction map a map over collision
  **classes**, so if a class is eliminated upstream — for instance by removing derived counters from
  generated prose and moving regeneration to a post-merge job — that row comes back empty and the
  merge-order plan is a no-op rather than a stale playbook that must be rewritten. The same
  principle applies to the whole tier: the conductor's coordination product shrinks as the
  project's conflict surface improves, and never resists that improvement.

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
