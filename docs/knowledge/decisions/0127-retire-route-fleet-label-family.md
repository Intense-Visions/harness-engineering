---
number: 0127
title: Retire the route:*-fleet label family; intake routes on the type axis
date: 2026-09-08
status: proposed
tier: medium
source: 'decision-blocked issue #2053'
---

## Context

The `route:*-fleet` GitHub label family is **written by `issue-fleet` and read by nothing**. Seven labels exist — `route:adr-fleet`, `route:bug-fleet`, `route:cicd-fleet`, `route:cleanup-fleet`, `route:docs-fleet`, `route:roadmap-fleet`, `route:test-fleet` — each described `issue-fleet route: owned by <member>`, against a 13-member roster. `issue-fleet` writes them at `agents/skills/claude-code/issue-fleet/SKILL.md:60` (the **route** triage axis: "assign the downstream fleet that should own the issue") and applies them in HANDOFF (`:127`, "Apply the re-derived labels and record the routes via `gh`").

**Zero-consumer claim, independently re-confirmed for this ADR** (not restated from the issue). Run in this worktree at base `fef03ac5e`:

```
$ grep -rnE 'route:[a-z-]*-fleet' agents/ packages/ docs/reference/
$ echo $?
1
```

Exit status 1, no matching lines. A repo-wide grep (excluding `.git`, `node_modules`, `dist`, `.turbo`) also returns nothing. No member's SELECT filters on a route label, no package reads one, and `docs/reference/fleet-family.md` never mentions the family.

**The family is unratified state from a never-accepted ADR.** ADR `0096-fleet-bootstrapping-whole-set-honesty.md` is the only ADR that mentions `route:` — and it is still `status: proposed`. Its clause 2 proposed the vocabulary as `route:roadmap`, `route:adr`, `route:cicd`, `route:test`, `route:cleanup`, `route:bug`, and it closes with an explicit unmet gate: "**Human ratification required:** the route-label vocabulary ... is a taxonomy decision ... sign-off should confirm the label set (names and membership) before it becomes install-time state." The labels became install-time state anyway, under a _different_ naming (a `-fleet` suffix 0096 never proposed). 0096 also named its own fallback — clause-2b: "record routes in the report artifact only and strike the implied `gh` write from Phase 5."

**The 7-of-13 asymmetry has no principle behind it.** The shipped set is exactly 0096's proposed six plus `route:docs-fleet`; `docs-fleet/SKILL.md` was added 2026-08-30 (commit `e1f408f2d`), twelve days after 0096 (2026-08-18). The family is the residue of an unratified enumeration plus one ad-hoc addition when a member shipped.

**#2053's "producers are excluded" hypothesis is REFUTED, not confirmed.** Checked against the SKILLs rather than assumed: `bug-fleet` SELECT composes analyses into "disjoint, risk-ranked areas" of the standing codebase (`:53`), `cleanup-fleet` "enumerate[s] the entropy/hotspot backlog by composing the existing detection skills", `test-fleet` enumerates under-covered areas, and `docs-fleet` composes doc-drift detectors — all four hunt the codebase and file or remediate, structurally indistinguishable from `craft-fleet` ("terminal act is a filing"), `perf-fleet` ("filed issues") and `security-fleet` ("file issues"), which carry no label. The remaining two unlabelled members are not producers at all but consume a different queue entirely: `pr-fleet` "consumes the open-PR queue", and `ideate-fleet` works from STRATEGY.md. No producer/consumer rule separates the labelled seven from the unlabelled six.

**As a partition the family is degenerate.** Measured live at draft time: all **274** open issues carry exactly one `route:*` label — zero unrouted — and **194 (71%)** are `route:roadmap-fleet`. A signal applied to 100% of the population with 71% in a single bucket carries almost no information.

**The label points at queues the members do not read.** `cicd-fleet` enumerates the red/flaky CI backlog, `bug-fleet` ranks code areas, `roadmap-fleet` scores roadmap candidates. None of these SELECTs is an issue-label query — which is precisely why nothing ever read the label.

**First-party evidence: precision as a routing signal is 20%.** Produced by this `adr-fleet` lane's own SELECT in this run (2026-09-08), and the load-bearing measurement for the choice:

> Of the 10 open issues carrying the `route:adr-fleet` label, SELECT found: **2** were genuine architectural decisions (#1970, #2053); **2** were already drafted as ADRs and would have produced conflicting duplicates (#1258 -> ADR 0119, #1856 -> ADR 0124, each ADR's `source:` frontmatter naming that exact issue number); **5** were spec-revision/editorial work on proposal documents that already carry their own decision tables (#2005, #2000, #1998, #1922, #1915); and **1** was a strategy/positioning item whose deliverable is STRATEGY.md, not an ADR (#1272). **Precision as a routing signal: 2/10 = 20%.**

**Second first-party evidence: an automated consumer has already misread it.** The `fleet-command` conductor running this session consumed `route:*` label counts as its per-member queue-depth indicator during SELECT, and handed those counts to its lanes as expected work volume — the exact misuse #2053 predicts. The counts measure _past intake activity_, not any member's real queue: a member with a deep untriaged queue reads as shallow, and the five members with no `route:` label at all (`craft`, `perf`, `security`, `ideate`, `pr`) read as empty. The conductor recorded this against itself in its own assumptions note.

That misuse was not filling a gap. `fleet-command/SKILL.md:88` already sanctions the honest answer: "A member with no gate-free probe path is not probed ... recorded as **queue depth unknown** ... Unknown is a fact worth reporting; a fabricated depth is not." The label count bypassed an existing correct fallback with a fabricated depth.

**The axis distinction that makes #2053 subtle.** ADR **0103** (`status: accepted`) is the canonical routing contract, and it routes a _different_ axis: `bug` / `spec-ready` / `feature` select which **pipeline** a build-shaped member runs, resolved metadata-first from the GH type labels (`bug`/`defect` -> bug, `feature`/`enhancement` -> feature) or a roadmap shard's kind field, with a rubric fallback. `route:*-fleet` purports to select which **member owns** the item. These are different axes: 0103 answers "which pipeline", `route:*` answers "whose queue". This ADR settles whether the second axis needs to exist at all.

**The counter-measurement that constrains the disposition.** Cross-tabulating the live corpus, `route:*` is largely redundant _where a type label exists_ (`route:bug-fleet` n=37 is 100% `bug`; `route:cicd-fleet` n=8 is 100% `bug`) — but **171 of 274 open issues (62%) carry no type label at all**, including 82% of the 194-issue `route:roadmap-fleet` bucket. The replacement axis is therefore currently unpopulated for the majority of the backlog, which makes the _order_ of retirement load-bearing rather than incidental.

## Decision

**Retire the `route:*-fleet` label family.** Intake expresses its routing verdict through the type labels the spine already consumes (`bug` / `defect`, `enhancement` / `feature`, `documentation`) plus the roadmap shard's kind field. This is a **decision record, not an executed migration**: accepting it authorizes the change and changes no behavior on its own.

This resolves ADR 0096's dangling ratification gate in the negative. 0096 made the route-label vocabulary conditional on a human sign-off that never happened, and named clause-2b as its own fallback — "record routes in the report artifact only and strike the implied `gh` write from Phase 5." Adopting Option B _is_ clause-2b. This ADR does not contradict an accepted decision; it answers an open one.

### 1. The replacement routing axis — what intake writes instead

**Member ownership is derived, not stored.** There is no replacement label, and reintroducing a per-member vocabulary under another name is explicitly out of scope.

- **Intake's written routing verdict is the type label.** `issue-fleet`'s **route** triage axis (`issue-fleet/SKILL.md:60`) collapses into its **label** axis: triage assigns `bug`/`defect`, `enhancement`/`feature`, or `documentation`, and for a roadmap-tracked item records the kind in its shard. This is the exact vocabulary ADR 0103 already resolves metadata-first, so intake now writes into an axis with a real consumer instead of a parallel one with none.
- **A member's queue is enumerated by its own SELECT against its own source of truth — never by a label filter.** This is already true and is why nothing read the label: `roadmap-fleet` scores roadmap candidates, `bug-fleet` ranks code areas by composed risk analyses, `cicd-fleet` enumerates the red/flaky CI backlog, `docs-fleet` composes doc-drift detectors, `test-fleet` enumerates coverage gaps, `cleanup-fleet` composes entropy/hotspot detectors, `pr-fleet` reads the open-PR queue. Ownership follows from (item type x the member's queue definition); it does not need to be stored on the issue.
- **The one thing `route:*` distinguished that a type label does not** is which member owns two same-typed items (`route:bug-fleet` and `route:cicd-fleet` are both 100% `bug`). That distinction is resolved by the members' own queue sources, not by a label: a CI-red item is picked up by `cicd-fleet`'s run enumeration whether or not anything labelled it. Where a human genuinely needs to hint, the existing **area** labels carry it.
- **Queue depth for a conductor is probed, never inferred from label counts.** `fleet-command` SELECT uses each member's gate-free `--report-only` path (`fleet-command/SKILL.md:85`), and where a member offers none it records **queue depth unknown** and schedules on the human's call (`:88`).
  - **Affordability, stated honestly:** `--report-only` is a _skill_-level flag, not a CLI command — a grep of `packages/cli/src` finds no member `--report-only` command, so probing costs one bounded agent spawn per member rather than a cheap shell call. At the conductor's scale (13 members, bounded, once per run) that is affordable, and it is the price of a number that is actually about the member's queue. **A cheap-but-wrong proxy is worse than an honest "unknown"** — that is the lesson this run paid for.

### 2. Disposition of the live existing corpus

The family does **not** vanish on acceptance. The corpus is live and grew during the gate round that authorized this ADR: the wave-2 `issue-fleet` lane applied 24 `route:*` labels roughly an hour before drafting; the human routed #2001 and #2009 to `route:roadmap-fleet`; and the human confirmed re-routing six issues into `route:docs-fleet` (#2005, #2000, #1922) and `route:roadmap-fleet` (#1998, #1915, #1272), which the orchestrator was applying during this draft. That last batch is directly visible in the measurements above: `route:adr-fleet` read 10 at SELECT and 4 at draft time.

**Chosen disposition: (ii) migrate, then freeze — sequenced, and performed by a follow-up implementation item, not by acceptance of this ADR.**

1. **Backfill the type axis first.** A follow-up item backfills a type label onto the 171 open issues that lack one, derived from each issue's own signals under the same re-derivation discipline `issue-fleet` already applies in VERIFY (`issue-fleet/SKILL.md:117`: a label with no supporting signal is rejected, not applied), and records the kind for roadmap-tracked items in their shards. **Owner: `issue-fleet` on a subsequent intake run**, since this is exactly its labelling job over a defined slice — not a hand-edit pass.
2. **Only then stop the write.** `issue-fleet`'s label-writing step stops on **that follow-up implementation item, not on acceptance of this ADR.** The order is load-bearing: stopping the write before the backfill lands would strand 62% of the backlog with no routing metadata at all, which is strictly worse than today. Retirement sequence: **backfill -> stop the write -> freeze.**
3. **Freeze the existing labelled corpus in place; do not strip it.** After the write stops, the 274 already-labelled issues keep their `route:*` labels as a **frozen historical triage record that no longer accrues**. The labels are not removed from issues and the label definitions are not deleted from the repo, so closed issues remain readable as the audit trail of what intake decided while the convention was live.
4. **Deletion is rejected.** Stripping the labels would rewrite 274 issue histories, destroy the only record of intake's past verdicts, and produce a large mutation burst for no consumer benefit — nothing reads them, so nothing is harmed by their continued presence once they stop accruing.
5. **Record the outcome on the spine.** `docs/reference/fleet-family.md` should state that no member consumes a `route:*` label, that the family is frozen, and that member ownership derives from item type plus each member's own queue definition.

### Scope boundary

This ADR deletes no label, strips no issue, and edits no member SKILL. Executing the retirement is downstream work a human authorizes separately.

## Consequences

### Positive

- **Removes a misread-as-signal hazard at its source**, evidenced by a consumer that misread it in the very session that produced this record rather than by a hypothetical.
- **Retires a signal measured at 20% precision** and shown to be a degenerate partition (100% of open issues labelled, 71% in one bucket).
- **Costs no member anything** — the zero-consumer grep is the proof that nothing depends on it.
- **Resolves ADR 0096's dangling human-ratification gate** in the negative, closing an ADR that has sat `proposed` since 2026-08-18 while its unratified proposal shipped anyway under a name it never proposed.
- **Strengthens the axis that already has consumers.** Intake's routing verdict lands in the type labels ADR 0103 resolves metadata-first, instead of a parallel vocabulary with none. The 171-issue backfill improves 0103's metadata-first hit rate as a side effect, reducing how often its heuristic rubric fallback has to fire.
- **Ends an unexplained asymmetry** rather than inventing a principle to justify it — the evidence shows the 7-of-13 split is enumeration residue, not design.

### Negative / trade-offs

- **The backfill is real work with a hard ordering constraint.** 171 open issues (62%) need a type label before the write can stop, and doing it out of order is strictly worse than the status quo. Mitigation: the sequence is stated explicitly and owned by `issue-fleet` on a subsequent run; this ADR's acceptance changes nothing by itself, so an out-of-order execution is a gate violation, not an accident.
- **The cheap queue-depth proxy is gone, and its honest replacement is not free.** A conductor must either spend one bounded agent spawn per member on the gate-free `--report-only` path or accept "queue depth unknown". This **raises the value of a real probe path** — relevant to the concurrently-drafted ADR 0126 on cost-aware shed ordering, whose ordering keys off _probed_ depth; that decision is independent of this one, but retiring the label-count proxy removes the tempting cheap substitute for the probe it depends on.
- **The same-type member distinction is not reproduced by the type label alone.** `route:bug-fleet` and `route:cicd-fleet` are both 100% `bug`. The replacement relies on each member's own SELECT source being the real discriminator. That is already how the members behave, but it is now load-bearing rather than incidental.
- **A human scanning the issue list loses an at-a-glance owner column** during the freeze window, since the frozen labels stop reflecting new intake.

### Neutral

- **Nothing is deleted**, so the historical triage record survives and the change is observable only as an absence of new labels.
- **Reversibility is high.** Labels are additive metadata; resuming the write would be a one-line change to `issue-fleet`'s HANDOFF step. Superseding this record requires a replacement ADR, not a code change.
- The corpus counts in Context are a **draft-time snapshot** (274 open issues) and will drift; they are evidence for the shape of the distribution, not a durable inventory.

## Assumptions made

Every recommended-option default taken while drafting, per the family's front-load/park-unforeseen interaction model (ADR 0088):

1. **Corpus disposition = (ii) migrate-then-freeze**, chosen over pure freeze-in-place (i) and rejected deletion (iii). Taken as the recommended default because the 62%-no-type-label measurement showed a pure freeze would leave the replacement axis unpopulated. A human may downgrade to (i) at sign-off.
2. **`issue-fleet`'s write stops on the follow-up implementation item, not on acceptance.** Chosen so acceptance is behaviour-neutral and the ordering constraint cannot be violated by ratification alone.
3. **The labels stay in the repo's label set** after the write stops, so closed-issue history remains readable.
4. **The backfill owner is `issue-fleet` on a subsequent intake run**, not a hand-edit pass, because re-derivation from issue signals is already its verified job.
5. **The `-fleet` suffix naming drift from ADR 0096's proposed `route:<member>` names is treated as unratified drift**, not as a separate decision needing its own record.
6. **Option A vs Option B was not re-litigated** — the human settled on B before this draft began; A and C are recorded as alternatives for the record only.
7. **Advisor discover/analyse/propose artifacts were kept out of the commit**, per this lane's decision-record-only scope; the durable form of the proposal is the alternatives recorded here.
8. **The `supersedes` frontmatter field was deliberately left unset.** This record resolves only ADR 0096's route-label clause (clause 2); 0096 also carries the absent-vs-empty/first-run-readiness clause (#1317) and the whole-set-operations clause (#1311), which stand untouched. Marking 0096 wholly superseded would silently retire two unrelated decisions, so the supersession is scoped in prose under References instead.

## Alternatives Considered

### Option A — Document the family and keep it

Declare `route:*` an advisory human-readable triage record in `docs/reference/fleet-family.md`, state that no member consumes it and that it must not be used as a queue-depth metric, and write down the rule for which members get a label.

**Rejected.** It documents a signal that had already misled an automated consumer, and the caveat "do not use this as a queue-depth metric" is a warning label on a loaded footgun rather than an unloading. It also requires a membership rule that the evidence shows does not exist: the producer/consumer hypothesis is refuted, and the real explanation for the 7-of-13 split is unratified enumeration residue. Documenting it would mean inventing a principle to retrofit onto an accident.

### Option C — Keep the family and make it real

Give the labels a genuine consumer by having each member's SELECT filter its queue on its own route label.

**Rejected.** The members' queues are not the issue backlog: `cicd-fleet` enumerates red CI runs, `bug-fleet` ranks code areas, `roadmap-fleet` scores roadmap candidates. Making the label load-bearing would require replacing each member's actual source of truth with a label query — rearchitecting six members to serve a vocabulary rather than the reverse. It would also inherit the 20%-precision problem as a hard dependency instead of an advisory one.

### Deleting the existing corpus outright

Covered in the Decision's disposition clause 4 — rejected because it rewrites 274 issue histories and destroys the audit trail for no consumer benefit.

## References

- Decision-blocked issue: **#2053**.
- Supersedes the route-label clause of [`0096-fleet-bootstrapping-whole-set-honesty.md`](0096-fleet-bootstrapping-whole-set-honesty.md) (clause 2 / the unmet human-ratification gate); adopts that ADR's own clause-2b fallback.
- Consistent with and subordinate to [`0103-fleet-item-type-routing.md`](0103-fleet-item-type-routing.md) — the accepted routing contract whose type axis survives and absorbs intake's routing verdict.
- Family policy: [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md).
- Spine document to update: `docs/reference/fleet-family.md` (§Item-type routing, `:44-58`).
- Label write site: `agents/skills/claude-code/issue-fleet/SKILL.md:60` (route triage axis) and `:127` (HANDOFF apply).
- Probe-path contract: `agents/skills/claude-code/fleet-command/SKILL.md:85` (gate-free probe) and `:88` (queue-depth-unknown).
