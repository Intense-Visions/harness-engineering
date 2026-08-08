---
number: 0090
title: The adr-fleet decide-stage batch-sign-off gate model
date: 2026-08-08
status: accepted
tier: large
source: docs/changes/adr-fleet/proposal.md
---

## Context

`adr-fleet` is the **decide** stage of the `-fleet` family conveyor (intake → decide → build →
land). Like every family member it fans out over a work-queue and hands the human a batch — but
its queue is **pending architectural decisions** and its terminal act is producing **ADRs**. That
raises a question no build- or land-stage member faces in the same form: **who holds the accept
decision, and where in the pipeline does the drafted-but-unaccepted ADR live?**

The family's non-negotiable invariant is that no member silently ships or accepts unreviewed work
(see the `-fleet` spine and ADR 0088). For the decide stage that tension is sharp. An ADR is,
by definition, the record of a decision a human made. A fleet that drafts ADRs and marks them
`accepted` on its own judgment has manufactured decisions no human made — the exact failure the
family exists to prevent, one stage upstream of code. But a decide stage that only enumerates
pending decisions and never drafts anything gives the human no leverage: they are back to writing
every ADR by hand. The design must let the fleet **draft** ADRs autonomously while keeping the
**accept** decision a human act, and it must place a drafted ADR somewhere that is reviewable as a
first-class ADR without being mistaken for an accepted one.

Three failure modes bound the design. Draft-and-accept on the fleet's own judgment — and the
knowledge graph fills with decisions no human made. Ask the human per-decision at draft time — and
the fleet is no better than advising each decision by hand, breaking the one-touchpoint model.
Draft into the canonical directory as `accepted` and rely on a later cleanup — and the knowledge
pipeline ingests an unratified decision the moment the file lands, so "accepted" silently means
"a machine drafted it."

## Decision

`adr-fleet` adopts a **CONFIRM-scoped, verify-gated, human-signed-off** decide model, the
decide-stage complement to the land-stage merge gate (ADR 0089).

1. **The fleet drafts to `proposed`; it never originates the accept decision.** Each DISPATCH
   subagent runs the real `harness-architecture-advisor` pipeline and writes a well-formed ADR to
   the canonical `docs/knowledge/decisions/NNNN-<slug>.md` carrying **`status: proposed`**. That
   status is the explicit never-auto-accept marker: a `proposed` ADR is a draft awaiting a human,
   distinguishable at a glance (and by the knowledge pipeline) from an `accepted` decision.

2. **The scope decision and the trade-off answers are captured up front in CONFIRM.** In the
   single guaranteed pre-sign-off touchpoint, the human approves/trims the batch and answers each
   decision's key trade-off question (the advisor's DISCOVER question, front-loaded per ADR 0088).
   Those answers feed each subagent's brief so the advisor never re-asks a settled question.

3. **Independent verification stands between drafting and sign-off.** A draft reaches the sign-off
   pass only after VERIFY independently confirms — never by subagent self-report — a well-formed
   `proposed` ADR at its pre-allocated number (required frontmatter + Context/Decision/Consequences)
   on a branch that is CI-green across all OS plus enforce and harness. A malformed or missing
   draft means the advisor pipeline did not run; it is rejected or retried, not carried forward.

4. **Acceptance is a single terminal human sign-off pass; the fleet executes only what was signed
   off.** SIGN-OFF presents every verified draft in one pass. The human ACCEPTS or REJECTS each;
   the fleet flips `status: proposed` → `accepted` for **exactly** the ADRs the human accepted and
   no others. A verified draft the human did not accept stays `proposed` or is dropped — it is
   never accepted on the fleet's judgment or because "it passed VERIFY."

## Consequences

- **Positive:** every `accepted` ADR traces to an explicit human sign-off **and** independent
  verification, so the knowledge graph never ingests a decision no human made; drafts are
  reviewable as ordinary ADR diffs because they live in the canonical directory; the human's
  decision authority is exercised once, up front (scope + trade-offs) and once at the end
  (sign-off), the same one-touchpoint-plus-terminal economics as the rest of the family; the fleet
  still delivers real throughput because enumeration, advising, drafting, and verification are
  autonomous.
- **Negative / tradeoffs:** introducing a `proposed` status extends the repo's ADR status
  vocabulary (previously accepted / superseded / deprecated), so the ADR-README and any status-aware
  ingestion must recognize it; and the human must sign off in a terminal pass rather than accepting
  each ADR as it is drafted — deliberate, since it keeps acceptance a human act rather than letting
  "it drafted cleanly" auto-ratify a decision.
- **Reversibility:** high — the gate's seat and the draft's location/status are interaction policy
  in skill prose plus one vocabulary row. Moving the draft to a staging directory promoted only on
  sign-off (the rejected alternative below), or opting a repo into per-decision sign-off, is a
  prose change, not an architecture change, and would supersede this ADR.

## Alternatives Considered

- **Fleet drafts and marks `accepted` on its own judgment when the draft is well-formed.** Rejected
  — violates the family's never-silently-accept invariant; a well-formed draft is not a human
  choosing to accept this decision, and it would seed the knowledge graph with unratified decisions.
- **Ask the human per-decision at draft time (a touchpoint per ADR).** Rejected — breaks the
  single-up-front-touchpoint model; the human is back to advising each decision one at a time, the
  slog the fleet exists to remove.
- **Draft into a staging directory (e.g. under the change's own folder) and move to
  `docs/knowledge/decisions/` only on sign-off, avoiding a new status.** Rejected as the default —
  it keeps drafts out of the canonical location during review, so the batch is not reviewable as
  ordinary ADR diffs and cross-checking against existing ADRs is harder. Retained as the parked
  fork this ADR's decision is measured against: if a `proposed` status proves costly to support, a
  staging directory is the fallback. (Recorded as a `[PARKED]` fork in the source plan.)
- **All-or-nothing batch acceptance (one sign-off for the whole batch).** Rejected — a batch almost
  always contains a mix of ready and not-ready drafts; per-ADR accept/reject in one pass lets the
  human accept the good ones without blocking on the weak ones, and is no more human effort.

## References

- Source proposal: `docs/changes/adr-fleet/proposal.md`.
- Companion: [`0087-subagent-fanout-vs-workflow-primitive.md`](0087-subagent-fanout-vs-workflow-primitive.md) — the execution architecture the decide stage runs on.
- Companion: [`0088-front-load-park-unforeseen-interaction-model.md`](0088-front-load-park-unforeseen-interaction-model.md) — the interaction model the CONFIRM scope-and-forks round extends.
- Companion: [`0089-pr-fleet-land-stage-human-merge-gate.md`](0089-pr-fleet-land-stage-human-merge-gate.md) — the land-stage twin; the merge gate this sign-off gate mirrors.
- First instance: `agents/skills/claude-code/adr-fleet/SKILL.md` (CONFIRM scope + forks, VERIFY drafted-ADR gate, SIGN-OFF human-authorized accept flip).
- Family overview: `docs/reference/fleet-family.md` (the `-fleet` spine and invariants).
- ADR convention: `docs/knowledge/decisions/README.md` (frontmatter, numbering, status vocabulary).
