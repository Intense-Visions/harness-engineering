# Metrics must declare their denominator

> A ratio, percentage, rate, average, or score is not a number — it is a number **over a population**. Strip the population and what is left is unfalsifiable.

Issue [#1530](https://github.com/Intense-Visions/harness-engineering/issues/1530). The mechanism is `@harness-engineering/core`'s `metrics` module; the envelope type is `DenominatedMetric` in `@harness-engineering/types`.

## Why this convention exists

A 90-day measurement across 1,957 repositories produced five wrong figures. **Every one of them was a denominator error, not a numerator error.** The numerators had been cross-validated to 0.24% against git. The divisors were never checked once.

That asymmetry is the whole point. Numerators get checked because they are what the metric is _about_ — somebody notices when "commits" looks wrong. Denominators are the part nobody reads, so a wrong one survives every review, every test, and every dashboard, and the resulting figure is confidently, precisely, quietly wrong.

## The abstention rule

**A zero denominator is an abstention, not a pass.**

A check that examined nothing verified nothing. The single most damaging thing a measurement system can do is render that as green — and it is also the most likely thing for it to do, because the natural fallbacks (`0`, `100`, `1.0`, an empty progress bar, `[].every() === true`) all read as measurements.

Three states, and they must stay distinct:

| Denominator | Basis       | Value  | What the operator should do                        |
| ----------- | ----------- | ------ | -------------------------------------------------- |
| `> 0`       | `measured`  | number | Read the number.                                   |
| `0`         | `abstained` | `null` | Look at the **selector** — it matched nothing.     |
| `null`      | `unknown`   | `null` | Look at the **source** — the query did not return. |

Collapsing `abstained` into `unknown` is how a failed query becomes a clean bill of health.

## The five observed failure classes — a review checklist

Use these as questions to ask of any diff that computes a ratio, rate, percentage, average, or score. Each one is a real, observed failure from the study; each is invisible in the numerator.

### 1. Nominal population used where effective population was meant

> Nominal team size used for effective FTE: **8 people versus 5.8 effective** — and a first pass mis-stated it as 1.3.

**Ask:** is the denominator the count of things that _exist_, or the count of things that _participated_? A per-engineer rate divided by headcount silently assumes every head was engineering, full-time, for the whole window.

### 2. A roster from a different system used as the population

> A **479-member access-control roster** treated as engineering headcount.

**Ask:** where did this list come from, and was it built for this question? An access-control list, a mailing list, and an org chart are three different populations with three different inclusion rules, and only one of them (maybe) is "engineers".

### 3. All-time population used for a windowed metric

> All-time contributor counts used for per-developer rates, overstating the comparison base **~8x**.

**Ask:** does the numerator's window match the denominator's window? A 30-day numerator over an all-time denominator is not a rate; it is an arbitrary number that shrinks as the project ages.

### 4. A source that emits at a different granularity than assumed

> A documentation CMS emitting one commit per page edit inflated an org commit total by **26%**.

**Ask:** is one row in the source one member of the population? Automation, bots, generated files, and CMS-backed repos all break the assumed one-event-per-human-action mapping. Name the exclusions.

### 5. The population selected by the metric being measured

> A scored population selected by the metric carrying the heaviest weight — a closed loop that hid heavy reviewers entirely.

**Ask:** could a member be excluded _because of_ the thing being measured? If the selection rule and the metric share an input, the metric is measuring its own selection and the most extreme members are the ones missing.

## How to comply

Use the constructor. It refuses a metric with no stated population, so this fails at the emit rather than in a report:

```ts
import { denominate, formatMetric, verdictForMetrics } from '@harness-engineering/core';

const coverage = denominate({
  metric: 'docs.coverage',
  numerator: documented.length,
  denominator: scanned.length,
  unit: 'percent',
  population: {
    definition: 'source files under src/ reachable from a docs/ markdown link',
    window: 'the working tree at HEAD',
    exclusions: ['generated files', 'test fixtures'],
  },
});

console.log(formatMetric(coverage));
// docs.coverage: 94.0% (312 of 332 source files under src/ …)
// or, over an empty population:
// docs.coverage: — (abstained — the population was empty …; this verifies nothing and is not a pass)
```

Then let the shared verdict decide, rather than re-deriving the rule:

```ts
const verdict = verdictForMetrics([coverage], { subject: 'the docs coverage check' });
if (!verdict.ok) fail(verdict.message);
```

Three rules for the `population.definition` field:

1. **Write the selection rule, not the metric name.** "Merged PRs authored by a fleet lane" is a definition. "PRs" is not.
2. **Name the exclusions.** They are the part of the denominator that is invisible in the number, and therefore the part nobody questions.
3. **Make it falsifiable.** A reviewer should be able to read it and disagree. An enum cannot be disagreed with — which is why this field is prose.

## Prior art in this repo

This convention generalizes point fixes the repo had already made against the same bug class, each of which fixed one surface and left the rest:

| Where                                       | What it worked out                                                   |
| ------------------------------------------- | -------------------------------------------------------------------- |
| [#1013] `harness check-harness-strength`    | Print the denominator so a partial audit never reads as a full pass. |
| [#1146] `harness check-docs`                | A scan that read nothing abstained rather than passed.               |
| [#1761] `harness-strength` coverage scaling | Partial coverage must cost score.                                    |
| `harness roadmap sync`                      | `ZERO DENOMINATOR` exit code 3, distinct from error exit code 2.     |
| `harness burn calibrate`                    | "A zero denominator is an abstention, not a calibration."            |

Before #1530 there were **fourteen mutually-incompatible conventions** for the same idea across the codebase — `null`, `'unknown'`, `{ present: false }`, `'abstained'`, `'pending'`, `'NO_DATA'`, `'N/A'`, `degraded: true`, `sampleSize: 0`, `scanned: 0`, exit code 3, and more. The migration status of every surface is tracked in [`metric-denominator-ledger.md`](./metric-denominator-ledger.md).

[#1013]: https://github.com/Intense-Visions/harness-engineering/issues/1013
[#1146]: https://github.com/Intense-Visions/harness-engineering/issues/1146
[#1761]: https://github.com/Intense-Visions/harness-engineering/issues/1761
