---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(metrics): metrics declare their denominator, and a zero denominator abstains (#1530)

A ratio, percentage, rate, average, or score is a number **over a population**. Strip the population and what is left is unfalsifiable. A 90-day measurement across 1,957 repositories produced five wrong figures and every one was a denominator error, not a numerator error — the numerators had been cross-validated to 0.24% against git while the divisors were never checked once.

Adds `DenominatedMetric` (`@harness-engineering/types`) and the `metrics` module in `@harness-engineering/core`: `denominate()` refuses to emit a metric with no stated population, `verdictForMetrics()` turns a set of metrics into a pass / abstain / unknown decision, and `formatMetric()` renders a value that cannot be separated from its population. A zero denominator produces `value: null` — an abstention, never a pass — and stays distinct from an unknown one (`denominator: null`), because "we looked and found nothing" and "we could not look" send an operator to different places.

This generalizes three point fixes the repo had already made against the same bug class (#1013, #1146, #1761) plus the `ZERO DENOMINATOR` exit code in `harness roadmap sync`, which is now derived from the shared rule with its 31 existing tests passing unmodified.

Behavior changes at the two worst green-on-empty surfaces:

- `harness check-harness-strength` scored **100/100, tier `solid`**, for a mode where no pattern applied at all — the exact bug #1761 was filed to fix, surviving one level up in the same function. `AuditResult.score` is now `number | null`; a null score tiers `incomplete` and renders as an abstention rather than a perfect audit.
- `validateFileStructure` reported **100% conformance and `valid: true`** for a project with no convention marked required. `conformance` is now `number | null` with a new `abstained` flag, and the `validate_project` MCP tool reports a distinct `abstained` check state with an explicit message instead of a green pass.

The full 262-site census is committed as a tiered burn-down ledger at `docs/conventions/metric-denominator-ledger.md`; the convention and the five observed denominator failure classes are a review checklist at `docs/conventions/metric-denominators.md`.
