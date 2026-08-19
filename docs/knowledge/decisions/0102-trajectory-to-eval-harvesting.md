---
number: 0102
title: Trajectory-to-eval harvesting — turn black-box run records into regression eval seeds
date: 2026-08-19
status: proposed
tier: large
source: docs/architecture/harness-ecosystem-pattern-adoption/analysis.md
---

## Context

The community field treats **traces as the raw material for repeatable evals**: turning
agent trajectories into JSONL eval cases, trace grading for multi-step workflows, and
trajectory critics for reranking / early-stopping (`walkinglabs/awesome-harness-engineering`;
`QoderAI/better-harness`). The premise is that a failure once observed should become a
permanent test, so the harness measurably improves over time rather than re-encountering the
same class of failure.

We already have both endpoints of this loop but they are not connected:

- **Production side:** `FlightRecorder` writes durable per-run forensic records to
  `.harness/black-box/run-*/` (provenance, verdicts, gate reasons; CLI `harness orchestrator
black-box list|show`, `packages/cli/src/commands/orchestrator-black-box.ts`). Dozens of real
  run records already exist in `.harness/black-box/`.
- **Consumption side:** `acceptance_eval` (upstream, advisory) and `outcome_eval` (blocking
  ship gate) judge spec-satisfaction from the spec acceptance section, the change diff, and
  test output, with authority derived in TypeScript.

Nothing harvests recorded trajectories into a **growing regression eval suite** that feeds
those evaluators. Each run's forensic value is currently one-shot (forensics after the fact),
not compounding (a permanent case the next run is measured against).

## Decision

Build a **harvester** that reads `FlightRecorder` run records and emits structured eval seed
cases into the `acceptance_eval` / `outcome_eval` corpus.

- **Selection:** harvest runs that carry a decisive, reproducible verdict (e.g. a
  high-confidence `NOT_SATISFIED` that was later fixed, or a gate rejection with a clear reason)
  — the cases where a permanent regression test has the most value.
- **Shape:** each seed case captures the pinned base state, the spec acceptance criteria, the
  observed verdict, and the gate reason, in the eval corpus's existing case format — not a new
  eval engine.
- **Loop:** the harvested corpus becomes standing input to the evaluators, so a failure class
  observed once is measured against thereafter. Optionally, a `harness evals harvest` command
  runs the pass on demand.

This ADR is **recommended deferred** until the `FlightRecorder` record format is confirmed
stable enough to depend on as a harvest source; it is documented now so the decision and its
dependency are on record.

## Alternatives Considered

- **Do nothing; keep black-box records forensic-only.** Rejected long-term: forfeits the field's
  compounding-eval benefit and leaves recorded failures non-repeatable. Acceptable short-term,
  which is why this is deferred rather than dropped.
- **Author eval cases by hand from notable failures.** Rejected as the primary mechanism: does not
  scale and loses the "every observed failure becomes a permanent test" property; hand-authoring
  remains available for cases the harvester cannot infer.
- **Build a separate trajectory-critic / reranker.** Rejected for now: larger surface, and our
  blocking value already lives in `outcome_eval`; feeding _it_ better cases is higher leverage
  than a parallel critic.

## Consequences

**Positive:**

- Closes the compounding loop the field prizes: observed failures become permanent regression evals.
- Reuses assets we already own on both ends (recorder + evaluators); no new eval engine.
- Strengthens the `outcome_eval` ship gate over time with real, reproduced failure cases.

**Negative:**

- Eval-suite maintenance and noise are real risks — a poorly-selected harvest floods the corpus
  with brittle or redundant cases. Mitigated by conservative selection (decisive, reproduced
  verdicts only) and by keeping harvested cases advisory until reviewed.
- Depends on `FlightRecorder` format stability; a format change mid-build is rework — the reason
  for deferral.

**Neutral:**

- Until the harvester runs, both endpoints keep their current behavior unchanged.

## Related

- ADR 0100 — Rule-to-failure provenance (sibling adoption from the same analysis)
- ADR 0101 — Minimum-Viable-Harness init tier (sibling adoption from the same analysis)
- Analysis: `docs/architecture/harness-ecosystem-pattern-adoption/analysis.md`
- `FlightRecorder` / `packages/cli/src/commands/orchestrator-black-box.ts`;
  `acceptance_eval` / `outcome_eval` skills

## Action Items

- [ ] Confirm `FlightRecorder` record format is stable enough to depend on (gate for starting) — owner: TBD
- [ ] Define the eval seed-case shape and selection criteria (decisive, reproduced verdicts) — owner: TBD
- [ ] Build the harvester + optional `harness evals harvest` command — owner: TBD
- [ ] Keep harvested cases advisory until human-reviewed; measure corpus noise — owner: TBD
