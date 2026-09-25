---
'@harness-engineering/orchestrator': minor
---

The agent-exit quality verdicts are now DISCRIMINATED, so an operator can tell why a unit escalated. Both feeders (the 4c single-agent security/acceptance-eval feeder and the post-diff routing retrospective) previously returned `'quality-fail' | undefined`, collapsing four situations into two values: a judged defect looked identical to a fail-safe block taken because the triage store could not be read, and "the scan found nothing" looked identical to "there was nothing to scan". Each exit now yields a `QualityVerdict` — `defect`/`clean` with the judging `source` (`security`, `acceptance-eval`, `retrospective`), `unjudged` with a `reason` (`router-off`, `empty-diff`, `triage-off`, `no-external-id`, `no-record`, `eval-declined`, `store-unreadable`, `internal-error`), or `fail-safe` with a `reason` (`store-unreadable`, `prediction-unparseable`, `internal-error`) — and every normal exit emits one structured `amr:quality-verdict` log line carrying both verdicts.

Escalation behaviour is unchanged: `toOutcomeClass` collapses each verdict back to exactly the class the feeder returned before (defect and fail-safe escalate; clean and unjudged are neutral), pinned table-driven over every variant, and the exit seam still composes the collapsed values with `??`. The existing prose `amr:quality-fail — …` lines are untouched.
