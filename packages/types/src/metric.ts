/**
 * Denominated metric envelope (issue #1530).
 *
 * A ratio, percentage, rate, average, or score is not a number — it is a number
 * *over a population*. Strip the population and what is left is unfalsifiable:
 * "94%" is indistinguishable from "94% of the three files we happened to look
 * at". A 90-day measurement across 1,957 repositories produced five wrong
 * figures and every one of them was a denominator error, not a numerator error;
 * the numerators had been cross-validated to 0.24% against git while the
 * divisors were never checked once.
 *
 * These types make the population a required part of the value rather than an
 * optional annotation on it. The raw envelope lives here — in
 * `@harness-engineering/types` — so any result shape can carry a denominated
 * figure without taking a dependency on `@harness-engineering/core`, exactly as
 * {@link GateMeasurement} does for gate-loss. The constructor that enforces the
 * envelope's invariants, and the renderer that refuses to print an
 * undenominated number, live in `@harness-engineering/core`'s `metrics` module.
 *
 * ## The abstention rule
 *
 * A zero denominator is an **abstention**, not a pass. A check that examined
 * nothing verified nothing, and the single most damaging thing a measurement
 * system can do is render that as green. The envelope therefore distinguishes
 * three bases, and only one of them carries a value:
 *
 * | `basis`     | `denominator` | `value` | Meaning                                    |
 * | ----------- | ------------- | ------- | ------------------------------------------ |
 * | `measured`  | `> 0`         | number  | A real population was examined.            |
 * | `abstained` | `0`           | `null`  | The population was empty — nothing to say. |
 * | `unknown`   | `null`        | `null`  | The population could not be determined.    |
 *
 * `abstained` and `unknown` are deliberately NOT collapsed. "We looked and there
 * was nothing there" and "we could not look" call for different operator
 * responses — the first is usually a wrong selector, the second is usually a
 * broken fetch — and merging them is how a failed query becomes a clean bill of
 * health. `harness roadmap sync` already draws this exact distinction by hand
 * (exit 3 for zero rows, exit 2 for a failed fetch); this envelope generalizes
 * it so every surface draws it the same way.
 */

/**
 * How a metric's population was arrived at, and therefore whether the metric
 * carries a value at all.
 *
 * - `measured` — a non-empty population was examined; `value` is a real number.
 * - `abstained` — the population was empty (`denominator === 0`). The metric
 *   has no value. It is neither a pass nor a failure; it is a refusal to speak.
 * - `unknown` — the population could not be established (`denominator === null`),
 *   e.g. the query that would have defined it failed. Distinct from `abstained`:
 *   here the size is unknown rather than known-to-be-zero.
 */
export type MetricBasis = 'measured' | 'abstained' | 'unknown';

/**
 * What a metric's unit is, so a renderer knows how to print it and a consumer
 * knows how to compare it. Purely descriptive — nothing derives a decision from
 * the unit.
 *
 * - `ratio` — a dimensionless fraction, conventionally in `[0, 1]`.
 * - `percent` — the same fraction scaled to `[0, 100]`.
 * - `per-item` — a rate expressed per member of the population (cost per PR,
 *   commits per developer).
 * - `score` — a composite index whose scale is defined by its own metric, not by
 *   the population size.
 */
export type MetricUnit = 'ratio' | 'percent' | 'per-item' | 'score';

/**
 * The population a metric was computed over — the answer to "of what?".
 *
 * This is the field whose absence the whole issue is about. It is required, and
 * it is prose rather than an enum on purpose: the five observed failure classes
 * were all cases where the *selection rule* was wrong (a 479-member
 * access-control roster used as engineering headcount, all-time contributors
 * used as a per-developer base, a docs CMS emitting one commit per page edit).
 * An enum would have accepted every one of them. A sentence a reviewer has to
 * write, and can disagree with, is what catches them.
 */
export interface MetricPopulation {
  /**
   * What was counted, in prose a reviewer can falsify. Not the metric's name —
   * the *selection rule*. "Merged PRs authored by a fleet lane" is a definition;
   * "PRs" is not.
   *
   * Required and non-blank. A metric constructed without one fails loudly (see
   * the `metrics` module in `@harness-engineering/core`).
   */
  definition: string;
  /**
   * The bounds the population was selected within, when it is scoped — a time
   * window, a path glob, a milestone. Omit when the population is unbounded.
   *
   * Recorded separately from {@link definition} because a window is the single
   * most common thing to change between two runs, and a reader comparing two
   * figures needs to see at a glance whether they share one.
   */
  window?: string;
  /**
   * Members deliberately removed from the population, each as a reason a
   * reviewer can check. Exclusions are the part of a denominator that is
   * invisible in the number and therefore never questioned; naming them is the
   * point.
   */
  exclusions?: string[];
  /**
   * Where the population was drawn from (a file, a table, an API). Distinguishes
   * "zero because the source was empty" from "zero because the selector matched
   * nothing" when someone is debugging an abstention.
   */
  source?: string;
}

/**
 * A metric that carries its own denominator.
 *
 * Every field is derived deterministically from the numerator, the denominator,
 * and the population by the `denominate` constructor in
 * `@harness-engineering/core`. Construct one through that function rather than
 * by object literal: the invariants below are enforced there, and a hand-built
 * literal can violate all of them.
 *
 * Invariants:
 * - `basis === 'measured'` iff `denominator !== null && denominator > 0`, and
 *   only then is `value` non-null.
 * - `denominator === 0` implies `basis === 'abstained'` and `value === null`.
 * - `denominator === null` implies `basis === 'unknown'` and `value === null`.
 * - `population.definition` is non-blank.
 */
export interface DenominatedMetric {
  /**
   * Stable identifier for the metric, e.g. `docs.coverage` or
   * `burn.cost_per_merged_pr`. Used to correlate the same figure across runs;
   * never rendered as the whole story on its own.
   */
  metric: string;
  /**
   * The figure itself, or `null` when the metric abstained or its population is
   * unknown. `null` is the load-bearing part: it is impossible to render an
   * abstention as a number by accident, because there is no number.
   */
  value: number | null;
  /** How many members of the population satisfied the metric's predicate. */
  numerator: number;
  /**
   * How many members the population had. `0` means the population was empty (an
   * abstention); `null` means its size could not be established (unknown).
   */
  denominator: number | null;
  /** What the metric was computed over. Required — this is the whole point. */
  population: MetricPopulation;
  /** Whether the metric was measured, abstained, or has an unknown population. */
  basis: MetricBasis;
  /** How to read {@link value}. */
  unit: MetricUnit;
  /**
   * A one-line, always-present human explanation that names the denominator.
   * Present even for a `measured` metric, so a figure copied out of a report
   * into a slide carries its population with it.
   */
  note: string;
}
