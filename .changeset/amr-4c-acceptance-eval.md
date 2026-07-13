---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

feat(orchestrator): opt-in LLM spec-satisfaction verdict for single-agent escalation (4c v2)

Adds the second sound quality-verdict source named in ADR 0069 — an LLM
spec-satisfaction (outcome-eval) judgment — behind a new **default-off** flag
`routing.policy.acceptanceEval.enabled`. It complements the always-on
baseline-relative security-defect feeder shipped earlier.

- On a normal single-agent exit, **after** the cheap security scan comes back clean
  (so a defect never wastes a model call), the orchestrator runs the shared
  `OutcomeEvaluator` over the introduced diff vs the spec's success-criteria
  section and feeds `quality-fail` **only** on a high-confidence `NOT_SATISFIED`
  verdict (`authority === 'blocking'`, derived in TypeScript — an LLM-forged
  `authority` is stripped at the evaluator's strict-parse boundary).
- **Conservative + guarded:** `SATISFIED` / `INCONCLUSIVE` / lower-confidence /
  no-spec / no-provider / empty-diff / any error → neutral (never a premature
  `quality-pass`). Fully no-op when AMR is off or the flag is unset.
- **No new model plumbing:** reuses the SEL-layer `AnalysisProvider` the live
  complexity classifier already builds inline (ADR 0069's "orchestrator can't run a
  model inline" no longer holds). New surface is minimal: a `WorkspaceManager.getIntroducedDiffText`
  raw-diff accessor (merge-base relative, seeded overlay excluded via git pathspec),
  a pure `outcomeVerdictToQualityFail` mapper, and the `acceptanceEval` policy field.

Still deferred: escalation on general logic quality beyond security defects +
spec-satisfaction. `RoutingPolicy` gains `acceptanceEval?: { enabled; model? }`
(also accepted on `PUT /api/v1/routing/policy`).
