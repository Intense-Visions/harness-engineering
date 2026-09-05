# Metrics must declare their denominator

Issue [#1530](https://github.com/Intense-Visions/harness-engineering/issues/1530) · roadmap shard `docs/roadmap.d/denominator-declaration-in-metric-outputs.md` · Priority P0 · milestone v5.0 — Enforcement Hardening.

## Overview and goals

A ratio, percentage, rate, average, or score is a number **over a population**. This change makes the population a required part of the value rather than an optional annotation on it, so that:

1. a metric emitted without a stated population fails loudly, and
2. a zero or unknown denominator reads as an **abstention**, never as a pass.

The second is the same bug class as [#1838](https://github.com/Intense-Visions/harness-engineering/issues/1838) ("zero runs reads as green"), and the repo has already fixed it three times at three individual surfaces ([#1013], [#1146], [#1761]) without ever extracting the shared idea.

## Scope

**Confirmed with the human: every metric-emitting surface in the repo** (fork F4, option (c)) — explicitly overriding the narrower recommendation of `burn` + `assess_project` + `check-perf`.

### What the census found

A derived-metric census at base `5cd661d7` (see `docs/conventions/metric-denominator-ledger.md` for the full inventory):

| Region              | Emission sites | Green on empty population | `NaN`/`Infinity`/fabricated neutral |
| ------------------- | -------------: | ------------------------: | ----------------------------------: |
| `packages/cli/src/` |           ~108 |                         5 |                                   6 |
| Everything else     |            154 |                         9 |                                  25 |
| **Total**           |       **~262** |                    **14** |                              **31** |

Additionally: **68 sites already abstain correctly, through fourteen mutually-incompatible conventions** (`null`, `'unknown'`, `{ present: false }`, `'abstained'`, `'pending'`, `'NO_DATA'`, `'N/A'`, `degraded: true`, `sampleSize: 0`, `scanned: 0`, exit code 3, …) with no shared primitive anywhere in `packages/core` or `packages/types`.

### The split, and why

262 emission sites is not one reviewable pull request. The human authorized splitting — but not narrowing — so the scope is handled as: **one coherent first PR that builds the mechanism and proves it on the worst instances, plus a committed ledger that holds the entire (c) scope open and burns it down.** The ledger is the device that keeps the full scope visible; without it, "we did a few surfaces" is indistinguishable from silently reverting to option (b).

The remaining tranches are enumerated by file and line in the ledger, tiered by severity, with the reason each is deferred.

## Decisions made

| Decision                                                                                                 | Rationale                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The envelope type lives in `@harness-engineering/types`, the constructor in `@harness-engineering/core`. | Mirrors the `GateMeasurement` / `gate-loss` precedent: a result shape can carry a denominated figure without depending on `core`.                                                                                                                                                                                                                               |
| `population.definition` is **required prose**, not an optional field and not an enum.                    | Every one of the five observed failure classes was a wrong _selection rule_. An enum would have accepted all five. A sentence a reviewer can disagree with is what catches them. An optional field, or one with a `'unknown'` default, would let every existing bare scalar be wrapped without anyone thinking — the migration failure mode, not the migration. |
| Three bases (`measured` / `abstained` / `unknown`), never two.                                           | "We looked and found nothing" and "we could not look" need different operator responses. `harness roadmap sync` already draws this distinction by hand (exit 3 vs exit 2); collapsing it is how a failed query becomes a clean bill of health.                                                                                                                  |
| An abstained metric has `value === null`, not `0` and not `100`.                                         | Structural rather than conventional: there is no number available to render by accident. `0` reads as "measured and terrible", `100` as "measured and perfect"; both are claims about a population nobody examined.                                                                                                                                             |
| `denominate` **throws** on a missing population rather than returning a `Result`.                        | It is a programming invariant, not a recoverable runtime condition. Throwing is what makes the emit fail loudly in dev and CI — the type checker and the test suite are where this is meant to bite.                                                                                                                                                            |
| An **empty set of metrics** does not converge.                                                           | The commonest shape of this bug is a loop that ran zero times and then reported success.                                                                                                                                                                                                                                                                        |
| Enforcement is the emit API + the type system, **not** a repo-wide lint rule.                            | The acceptance criterion is that a metric emitted _without a population_ fails — which the required field and the throwing constructor deliver. A grep-based rule over ~262 sites would be noisy enough to be disabled; deferred until the ledger has burnt down.                                                                                               |

## Technical design

`packages/types/src/metric.ts`

```ts
type MetricBasis = 'measured' | 'abstained' | 'unknown';
type MetricUnit = 'ratio' | 'percent' | 'per-item' | 'score';

interface MetricPopulation {
  definition: string; // required, non-blank — the selection rule
  window?: string;
  exclusions?: string[];
  source?: string;
}

interface DenominatedMetric {
  metric: string;
  value: number | null; // null unless basis === 'measured'
  numerator: number;
  denominator: number | null; // 0 => abstained; null => unknown
  population: MetricPopulation;
  basis: MetricBasis;
  unit: MetricUnit;
  note: string; // always present, always names the denominator
}
```

`packages/core/src/metrics/`

| File            | Responsibility                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `denominate.ts` | `denominate()` (the constructor, enforces every invariant), `census()` (the "we examined N of N" shape), `unknownPopulation()`, `describePopulation()`, `MetricContractError`.                   |
| `verdict.ts`    | `verdictForMetrics()` — the pass / abstain / unknown decision, generalizing the `ZERO DENOMINATOR` exit-code pattern. Abstention outranks unknown, because it is the more misleading of the two. |
| `render.ts`     | `formatMetric()`, `formatMetricValue()`, `formatMetricBlock()`, `ABSTENTION_PLACEHOLDER`. A value cannot be rendered without its population.                                                     |

### Integration points

- **Entry points** — new `metrics` module on the `@harness-engineering/core` public surface (auto-discovered by `scripts/generate-core-barrel.mjs`); new type exports on `@harness-engineering/types`. No new CLI command or MCP tool.
- **Registrations required** — core barrel regeneration (`pnpm run generate:barrels`); manual export block in `packages/types/src/index.ts` (that barrel is hand-maintained).
- **Documentation updates** — `docs/conventions/metric-denominators.md` (the convention plus the five-failure-class review checklist) and `docs/conventions/metric-denominator-ledger.md` (the migration tracker).
- **Architectural decisions** — none rises to a standalone ADR. The envelope follows an established in-repo pattern (`GateMeasurement` / `gate-loss`) rather than setting a new one.
- **Knowledge impact** — "denominator", "abstention", "population definition" become first-class vocabulary; the fourteen ad-hoc abstention conventions become one.

## Success criteria

From the issue's acceptance criteria:

- [x] **A metric emitted without a population definition fails loudly in dev and CI.** `population` is a required field (compile-time) and `denominate` throws `MetricContractError` on a blank definition (runtime, covered by tests).
- [x] **The roadmap sync `ZERO DENOMINATOR` exit-code pattern is generalised through the same API.** `sync-verdict.ts` now derives its verdict from `verdictForMetrics`; all 31 pre-existing sync tests pass unchanged, which is the evidence that the shared rule reproduces the hand-rolled one exactly.
- [x] **Docs include the five observed denominator failure classes as a review checklist.** `docs/conventions/metric-denominators.md`.
- [x] Zero/unknown denominator → abstention is covered by tests, including the specific fabrications found in the codebase (`? 0 :` and `? 100 :`).

Deliverables from the issue, honestly reported:

- [x] Metric emit API requires `{value, numerator, denominator, population_definition}`; bare scalars fail.
- [~] **Renderers display the population definition** — the shared renderer does, and the two adopted CLI surfaces do. The dashboard is tranche 4 of the ledger and is **not** done.
- [~] **Migration: wrap existing metric emitters; grandfather list burns down to zero** — the grandfather list exists and is complete (262 sites, tiered). Seven surfaces are adopted; the rest are named, tiered debt.

## Implementation order

### Phase 1: The envelope and the mechanism

The type in `types`, the three modules in `core/src/metrics/`, the barrel wiring, and the mechanism's own tests.

### Phase 2: Generalize the existing pattern

Rewrite `roadmap/sync-verdict.ts` in terms of `verdictForMetrics` without changing behavior — the pre-existing test suite is the oracle.

### Phase 3: Adopt the worst green-on-empty sites

`harness-strength` end-to-end (core scoring → auditor tier → CLI render) and `validation/file-structure` (core → MCP `validate` tool). Both are cases where a zero denominator produced a _perfect_ score.

### Phase 4: Census, convention, ledger

Document the convention and the five failure classes; commit the full 262-site inventory as a tiered burn-down ledger.
