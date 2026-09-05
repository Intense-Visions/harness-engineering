# Metric denominator ledger

Migration tracker for [#1530](https://github.com/Intense-Visions/harness-engineering/issues/1530). The convention itself is in [`metric-denominators.md`](./metric-denominators.md).

**This list exists to burn down to zero.** Every surface in the repo that emits a derived metric — a ratio, percentage, rate, average, score, or "N of M" figure — is either **adopted** (routed through `denominate` / `verdictForMetrics`) or **grandfathered** (still emitting a bare scalar). A grandfathered entry is a known debt with a named owner-surface, not an exemption.

## Scope

The scope of #1530 was confirmed with the human as **every metric-emitting surface in the repo**, not a chosen subset. A census at base `5cd661d7` found:

| Region              | Emission sites | Renders green on an empty population | Can emit `NaN`/`Infinity` or a fabricated neutral |
| ------------------- | -------------: | -----------------------------------: | ------------------------------------------------: |
| `packages/cli/src/` |           ~108 |                                    5 |                                                 6 |
| Everything else     |            154 |                                    9 |                                                25 |
| **Total**           |       **~262** |                               **14** |                                            **31** |

262 sites is not one reviewable pull request. This ledger is how the full scope stays visible and mechanically trackable while the migration lands in tranches — the alternative, silently narrowing to a handful of surfaces, is the failure mode this ledger exists to prevent.

Status key: **adopted** — routed through the shared envelope · **grandfathered** — still a bare scalar · **correct-by-hand** — already abstains properly through one of the fourteen pre-#1530 conventions, so it is not _wrong_, only un-unified.

---

## Tranche 1 — adopted (this PR)

| Surface                                               | Was                                                                                                              | Now                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/core/src/metrics/`                          | —                                                                                                                | The mechanism: `denominate`, `census`, `unknownPopulation`, `verdictForMetrics`, `formatMetric`. |
| `packages/types/src/metric.ts`                        | —                                                                                                                | The `DenominatedMetric` envelope.                                                                |
| `packages/core/src/harness-strength/scoring.ts`       | `applicable <= 0` returned the raw score — **100/100, tier `solid`, for a mode where no pattern applied**.       | `scoreWithCoverage` returns `null`; the auditor tiers it `incomplete`.                           |
| `packages/cli/src/commands/check-harness-strength.ts` | Printed `${audit.score}/100` unconditionally, even when the coverage line was suppressed for a zero denominator. | Renders the abstention placeholder and the reason.                                               |
| `packages/core/src/validation/file-structure.ts`      | `totalRequired === 0 ? 100 : …` — **100% conformance, `valid: true`, for a project with nothing required**.      | `conformance: null`, `abstained: true`, `valid: false`.                                          |
| `packages/cli/src/mcp/tools/validate.ts`              | `checks.structure = 'pass'` on the vacuous case.                                                                 | `checks.structure = 'abstained'` with an explicit `ABSTAINED:` message.                          |
| `packages/cli/src/commands/roadmap/sync-verdict.ts`   | Hand-rolled zero/unknown/measured branching and the `ZERO DENOMINATOR` exit code.                                | The same behavior, derived from `verdictForMetrics`. All 31 existing tests pass unchanged.       |

---

## Tranche 2 — grandfathered, Tier 1: renders a PASSING number on an empty population

The highest-severity remainder. Each of these currently answers "we measured nothing" with a green figure.

| Surface                                                                              | Symptom                                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/core/src/context/knowledge-map.ts:71`                                      | `agentsTotalLinks > 0 ? … : 100` — **100% link integrity when AGENTS.md has zero links.**                                                                                |
| `packages/core/src/review/evidence-gate.ts:89-95,122`                                | `coveragePercentage: 100` when the review produced zero findings — "nothing was checked" is indistinguishable from "everything cited".                                   |
| `packages/core/src/entropy/detectors/patterns.ts:285-286`                            | `totalChecks > 0 ? … : 1` — a **100% pass rate** when zero files were scanned or zero patterns configured.                                                               |
| `packages/core/src/architecture/timeline-manager.ts:155-167`                         | A missing metric category is imputed `1.0` ("perfectly healthy") — **stability 100 when every category is absent.**                                                      |
| `packages/core/src/security/security-timeline-manager.ts:130-145,328-337`            | `captureSupplyChain` returns a zeroed snapshot on failure, so a **failed `npm audit` yields a perfect security score.**                                                  |
| `packages/core/src/architecture/regression.ts:57`                                    | `ssTot < 1e-12 ? 1` — **r² = 1 (perfect fit)** on a degenerate series; feeds prediction confidence.                                                                      |
| `packages/cli/src/skill/health-snapshot.ts:321,130-132,392`                          | `avg([]) === 0` makes every coupling/complexity predicate false — **an unmeasured codebase reports all-clear.** (`testCoverage` in the same struct is correctly `null`.) |
| `packages/cli/src/commands/fleet/budget-check.ts:111`                                | `$0.00/unit` on zero units — reads as _free_, means _no data_.                                                                                                           |
| `packages/core/src/rework/rework.ts:96` + `packages/cli/src/commands/rework.ts:65`   | **0.0% rework rate** on a zero-commit surface, rendered green.                                                                                                           |
| `packages/signals/src/providers/complexity-trend.ts:99`                              | Zero baseline ⇒ `pct = 0` ⇒ status `'ok'` (green).                                                                                                                       |
| `packages/cli/src/commands/mcp.ts:287`, `packages/cli/src/commands/distortion.ts:71` | `?? 0` turns "class never observed" into a measured frequency of `0.0000`.                                                                                               |
| `packages/cli/src/commands/doctor.ts:691,737`                                        | `[].every() === true` ⇒ `0/0 checks passed` and exit `SUCCESS`. Unreachable today (static check list), but the invariant is unasserted.                                  |
| `packages/core/src/harness-strength/*` residue                                       | See tranche 1 — the score is fixed; `rulesPassing` and the summary counts are not yet denominated.                                                                       |
| `packages/cli/src/commands/graph/bench.ts:182`                                       | `ratio()` returns `0` for a speedup on a zero denominator, while `:240` in the _same file_ correctly returns `null`.                                                     |

## Tranche 3 — grandfathered, Tier 2: emits `NaN` / `Infinity` or a fabricated neutral

Loud rather than green, but still a number nobody can check.

| Surface                                                                   | Symptom                                                                                                               |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/skill/recommendation-engine.ts:156`                     | `/ addr.threshold` with no `!== 0` check ⇒ `1` (max urgency, fabricated) or `NaN` poisoning the recommendation score. |
| `packages/core/src/context/context-budget-trip-wire.ts:134-135`           | `usedTokens / window` unguarded ⇒ `Infinity`/`NaN`.                                                                   |
| `packages/core/src/performance/regression-detector.ts:28`                 | `/ baseline.opsPerSec` unguarded ⇒ `Infinity`.                                                                        |
| `packages/orchestrator/src/tui/components/Stats.tsx:95`                   | Guarded on the numerator only ⇒ `Infinity%` in the TUI.                                                               |
| `packages/orchestrator/src/cost/cost-ceiling-monitor.ts:119`              | `pctOfCeiling` emitted with no `maxUsd > 0` guard.                                                                    |
| `packages/dashboard/src/client/pages/Orchestrator.tsx:298`                | `NaN%` CSS bar width.                                                                                                 |
| `packages/core/src/architecture/regression.ts:71-72`                      | Weighted means over `sumW` unguarded.                                                                                 |
| `packages/core/src/knowledge-mdl/matched-comparison.ts:58,67,107-108,145` | Mean / sample variance / pooled variance unguarded.                                                                   |
| `packages/intelligence/src/effectiveness/{scorer,skill-scorer}.ts`        | Laplace smoothing turns `0/0` into a **fabricated neutral `0.5`**, which is a claim, not an abstention.               |
| `packages/intelligence/src/effectiveness/scorer.ts:218`                   | Unknown systems imputed `NEUTRAL_PRIOR` and averaged in.                                                              |
| `packages/intelligence/src/specialization/scorer.ts:97`                   | `results.length > 0 ? … : 0.5` — same fabricated neutral.                                                             |
| `packages/intelligence/src/triage/rank.ts:33`                             | `(impact × confidence) / effort` with `effort === 0` ⇒ `Infinity`.                                                    |

## Tranche 4 — grandfathered: dashboard renderers

25 client render sites in `packages/dashboard/src/client/` show a percentage or 0–1 score. Only `Cache.tsx` (empty state), `TodoSection.tsx` (returns null) and `FeatureTable.tsx` / `PoolCard.tsx` (guarded `0%`) handle an empty population at all; **there is no dashboard-side abstention rendering**. The adopter-facing goal from the issue — "every percentage an adopter sees carries what it is a percentage of, hover/expand shows population and exclusions" — lands here.

## Tranche 5 — correct-by-hand, to be unified onto the envelope

These already abstain properly. Migrating them is about collapsing fourteen conventions into one, not about fixing a bug — so they are the lowest-risk and lowest-urgency tranche.

`packages/burn/src/{cost-per-pr,summary}.ts` (`ratio() → null`, `denominator_note`, `NO_DATA`) · `packages/types/src/telemetry-synthesis.ts` (`SynthesisSection<T>` / `SourceAbsent`) · `packages/core/src/review/finding-integrity.ts` (`abstained` + `examined`) · `packages/core/src/deployment/exit-code.ts` (`abstained → 3`) · `packages/core/src/context/doc-coverage.ts` (`scanned` sentinel) · `packages/core/src/metabolism/report.ts` (`safeShare` + `denominatorTokens` — the best-modelled site in the repo) · `packages/core/src/gate-loss/compute.ts` (`degraded: true`) · `packages/intelligence/src/triage/precedent.ts` (`{ kind: 'unknown' } | { kind: 'rate' }`) · `packages/graph/src/ingest/CoverageScorer.ts` (`'N/A'` grade + `measuredDomainCount`) · `packages/signals/src/**` (`value: null` + `status: 'pending'`) · `packages/core/src/ranking/stability.ts` (`sampleSize`) · `scripts/main-health-check.mjs` (`indeterminate`) · `scripts/{benchmark-check,coverage-ratchet}.mjs`.

## Not yet built

- **A lint rule** (`@harness-engineering/require-metric-denominator`) that flags a raw division by a `total`-shaped variable outside the envelope. Deferred deliberately: a repo-wide grep-based gate over ~262 sites would be noisy enough to be turned off, and it is only worth adding once the tranches above have burnt down far enough for it to be quiet.
- **A CI check** asserting this ledger matches reality. Same reason — the ledger has to be close to true before a gate on it is anything but friction.
