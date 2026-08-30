---
number: 0112
title: A report-to-queue decomposition member for the -fleet intake stage
date: 2026-08-30
status: accepted
tier: medium
source: 'decision-blocked issue #1322'
---

## Context

The `-fleet` family is a conveyor — `ideate-fleet` (ideate) → `issue-fleet` (intake) →
`adr-fleet` (decide) → `roadmap-fleet` (build) → `pr-fleet` (land) — where each member
"autonomously works down a **queue of like items** by fanning out isolated pipelines"
(`docs/reference/fleet-family.md`, §"What a `-fleet` is"). Every member fans out over an
**existing** queue. Nothing in the family converts a multi-finding artifact into that queue.

This is a structural gap, not an incidental one, because multi-finding first-run reports are a
**standard output** of the family. Three already exist: #1259 (`fleet-command` first run, 32
findings), #1295 (`pr-fleet` first run, 8 findings), and #1294 (base-freshness, split out of the
`pr-fleet` run by hand). The family generates these reliably and can consume none of them. #1259
itself predicted the adjacent symptom — "the family is designed to feed itself; on run #1 every
seam is empty" — and this is the same hole one step upstream: **the family cannot manufacture its
own intake.** Splitting #1259 fell to the orchestrator by hand, which is exactly the attention tax
the fleet model exists to remove (issue #1322).

`issue-fleet` is the closest candidate and cannot do the job by its own definition
(`agents/skills/claude-code/issue-fleet/SKILL.md`):

- Its queue is **whole issues** — SELECT step 1 is `gh issue list --state open`, never findings
  inside a body.
- Its four triage axes are **label / dedup / route / prioritize** — none is "split".
- It is explicitly **"NOT for a single issue — label and route it directly"**, and its only
  mutations are labels, routes, and dedup closes.
- Its Iron Law is a **destructive-close** authorization: "An issue is closed only after the human
  authorized closing it up front." It contemplates no **constructive** act — it never _creates_
  issues.

Run literally against #1259, `issue-fleet` produces a one-row queue (label `enhancement`, already
applied; dedup `novel`; rank high); the 32 findings are untouched. The question this ADR settles is
where in the family the report → queue decomposition capability belongs.

## Decision

**Add a new thin `-fleet` family member — a report-to-queue decomposer — at the head of the intake
stage, upstream of `issue-fleet`.** Its queue is multi-finding artifacts (fleet REPORTs, audit
outputs, review batches); its per-item pipeline decomposes one artifact into N independently
actionable findings; its terminal act files each finding as a discrete tracked issue linked back to
the source artifact, with the source retained as an umbrella. The freshly filed issues become the
open-issue backlog that `issue-fleet` then triages by its existing four axes.

Do **not** overload `issue-fleet` with a fifth "split" axis. The member is thin because it inherits
the entire spine (`docs/reference/fleet-family.md`) unchanged — the five-phase skeleton, the
concurrency governor, worktree fan-out with the push-path caveat, independent artifact verification,
and the canonical `FleetHandoffRecord` every worker emits. It defines for itself only what §"What
each member defines for itself" requires:

- **Its queue** — multi-finding artifacts, each carrying N candidate findings, rather than an
  existing tracked-item queue.
- **Its per-item pipeline** — parse the artifact, isolate each independently-actionable finding,
  and draft a scoped issue body for it linked to the umbrella.
- **Its terminal act** — file the discrete issues (a **constructive** act) and cross-link the
  umbrella; it merges nothing and writes no code.
- **Its authorization gate** — a **constructive-creation twin** of `issue-fleet`'s destructive-close
  gate: the human approves the decomposition batch (which findings become issues, and how many) in
  the one up-front CONFIRM round before any issue is filed, exactly as `adr-fleet` batches ADR
  sign-off (ADR 0090) and `pr-fleet` batches merge authorization (ADR 0089).

Crucially, **decomposition and dedup stay separate members.** The decomposer only splits; the
issues it files flow straight into `issue-fleet`, which dedups them against the backlog as part of
its normal intake. The conveyor composes the two — decompose, then triage/dedup — so neither member
carries the other's logic and neither can drift.

### Assumptions made

Absent a live fork answer, this draft assumes: (1) the family should preserve each member's single
responsibility and its compositional conveyor shape over the smaller expedient of overloading
`issue-fleet`; (2) the decomposer files **GitHub issues** as its queue-item substrate, matching
`issue-fleet`'s queue so the downstream seam is native; (3) the default granularity is one
finding → one scoped issue with the source artifact retained as a linked umbrella. The member name
(`report-fleet` is used illustratively here) is tunable and not load-bearing to this decision.

## Consequences

- **Positive:** every member keeps one responsibility; the family gains the ability to manufacture
  its own intake, closing the #1259/#1295/#1294 gap. `issue-fleet`'s "queue is whole issues"
  contract and "NOT for a single issue" scope are left intact. Dedup happens once, where it already
  lives, and the decomposer's output is deduped for free by the immediately-downstream `issue-fleet`.
  The new member inherits the whole spine, so it is genuinely thin.
- **Negative / tradeoffs:** it is a new member to author, document, and maintain (more surface than
  a single new axis on an existing member). It introduces the family's first **constructive**
  authorization gate — issue _creation_ under human approval — which is new territory the existing
  destructive-close model does not cover and which must be specified carefully so a mis-decomposition
  cannot flood the backlog. Two members now sit in the intake stage, so the conveyor diagram and
  spine `Members` table must be updated to show the decomposer feeding `issue-fleet`.
- **Reversibility:** high — this is a member-boundary and dispatch-policy decision expressed in skill
  prose plus the shared spine doc; the decomposition logic could later be folded elsewhere by a
  superseding ADR without changing execution architecture.

## Alternatives Considered

- **Add a `split` axis to `issue-fleet`** (issue #1322 option 1). Rejected. It is the smaller change
  and keeps the conveyor's shape, but it violates `issue-fleet`'s own contract on three counts: its
  queue is whole issues (not findings inside a body), its scope is explicitly "NOT for a single
  issue", and its mutations are label/route/dedup-close only. Most decisively, it makes `issue-fleet`
  _create_ issues — a constructive act its destructive-close Iron Law does not contemplate — so the
  authorization model would need a constructive twin grafted onto a member whose gate is defined
  around the opposite operation. Overloading one member with two responsibilities is the drift the
  family's single-responsibility, compositional design exists to prevent.
- **Fold decomposition into each report-producing member** (every fleet emits discrete issues
  directly instead of one report). Rejected — it spreads identical splitting logic across every
  member that can emit a report, guarantees drift, and cannot cover audit outputs or review batches
  that are not produced by a fleet at all. There would be no single place the capability lives.
- **Do nothing — keep hand-splitting reports at the orchestrator.** Rejected — this is precisely the
  per-item attention tax the fleet model exists to remove (#1322), and it does not scale as the
  family reliably produces more multi-finding reports.

## References

- Decision-blocked issue: #1322 — "The -fleet family has no member that decomposes a multi-finding
  run report into a queue".
- Motivating reports the family cannot currently consume: #1259 (32 findings), #1295 (8 findings),
  #1294 (base-freshness split by hand).
- Family spine and member contract: `docs/reference/fleet-family.md` (§"The conveyor", §"What a
  `-fleet` is", §"What each member defines for itself", §"The worker handoff record", §Members).
- Closest existing member and its contract this decision preserves:
  `agents/skills/claude-code/issue-fleet/SKILL.md` (SELECT `gh issue list`, four triage axes,
  destructive-close Iron Law).
- Batch-authorization gate models the new constructive gate mirrors:
  [`0090-adr-fleet-decide-stage-batch-signoff.md`](0090-adr-fleet-decide-stage-batch-signoff.md) and
  [`0089-pr-fleet-land-stage-human-merge-gate.md`](0089-pr-fleet-land-stage-human-merge-gate.md).
- Family interaction and execution policies inherited unchanged:
  [`0087-subagent-fanout-vs-workflow-primitive.md`](0087-subagent-fanout-vs-workflow-primitive.md)
  and
  [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md).
