---
module: local-models
tags:
  - calibration-constants
  - math-naming
  - decay-curves
  - test-pinning
problem_type: math-semantic-mismatch
last_updated: '2026-05-29'
track: knowledge-track
category: best-practices
---

# When a constant is named "halflife", the formula must use base-2 decay, not `Math.exp`

## Context

LMLM Phase 2c shipped `applyRecencyDecay` to age benchmark observations against the snapshot date. The initial implementation reached for the familiar exponential form `Math.exp(-ageMonths / HALFLIFE_MONTHS)` because it looks right at a glance and matches countless physics / signal-processing examples. The constant was named `HALFLIFE_MONTHS = 9` — implying that an observation should weigh exactly `0.5` at nine months of age.

The form is wrong for that constant name. `Math.exp(-1) ≈ 0.368`, not `0.5`. The spec's Q5 acceptance criterion bounded the 12-month weight at `[0.3, 0.7]`, which the exponential form just barely missed (`0.264`), and the unit test asserting "weight halves every HALFLIFE_MONTHS" failed outright. The mismatch surfaced only when the recency test ran for the first time during execution — it would have shipped silently otherwise, because the constants and tests were defined in the same commit pair (see [LMLM Phase 2c review fixes](https://github.com/Intense-Visions/harness-engineering/commit/3630fab2)).

## Guidance

When a calibration constant names a _semantic_ (`HALFLIFE_MONTHS`, `THIRD_LIFE_MONTHS`, `QUARTER_LIFE_DAYS`), the formula must reproduce that semantic exactly at `x = constant`:

- **Halflife:** `weight = 0.5 ** (x / HALFLIFE)`, equivalently `Math.pow(0.5, x / HALFLIFE)` or `Math.pow(2, -x / HALFLIFE)`. At `x = HALFLIFE`, weight = `0.5`.
- **Generic e-fold (mean lifetime):** `weight = Math.exp(-x / TAU)`. At `x = TAU`, weight = `1/e ≈ 0.368`. Name the constant `MEAN_LIFETIME_MONTHS` or `TAU_MONTHS` — not `HALFLIFE_*`.

If a future reader sees `HALFLIFE_*` and the formula uses `Math.exp(-x / H)`, the dashboard explanation ("an observation halves every nine months") is a lie about the math. The fix is either to rename the constant (e-fold semantics) or change the formula (true-halflife semantics).

Pin the semantic in a unit test that does **not** redefine the constant inline:

```ts
import { HALFLIFE_MONTHS, applyRecencyDecay } from '@harness-engineering/local-models';

it('halves the weight at exactly HALFLIFE_MONTHS', () => {
  const fresh = applyRecencyDecay({ observedAt: SNAP, snapshotDate: SNAP });
  const halflifeOld = applyRecencyDecay({
    observedAt: monthsBefore(SNAP, HALFLIFE_MONTHS),
    snapshotDate: SNAP,
  });
  expect(halflifeOld.weight / fresh.weight).toBeCloseTo(0.5, 2);
});
```

Importing `HALFLIFE_MONTHS` from the module under test keeps the assertion semantic ("halves at the halflife") rather than numeric ("halves at 9 months"), so re-tuning the constant doesn't break the test as long as the semantic still holds.

## Applicability

Use this guidance any time a calibration constant carries semantic meaning a non-author would read at face value (halflife, doubling time, time constant, e-fold). Skip it for opaque numeric weights where no semantic claim is made.

Trade-offs:

- `Math.exp` is faster than `Math.pow` on most engines, but neither shows up in a profile of the ranker's first-order math. Optimize the constant name first.
- Mixing semantics across calibration constants in the same module is a code-review red flag — adopt one (`HALFLIFE_*` everywhere or `TAU_*` everywhere) and document the choice.

## References

- Commits: `3630fab2` (initial implementation with `Math.exp` — failing tests), `501a274f` (test added that revealed the mismatch), `4334d364` (review fixes).
- Recency module: `packages/local-models/src/ranker/recency.ts:88-104`.
- Spec: `docs/changes/local-model-lifecycle-manager/proposal.md` Q5 success criterion.
