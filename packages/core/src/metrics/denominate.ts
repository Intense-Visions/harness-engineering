/**
 * The metric constructor (issue #1530): the one way to build a
 * {@link DenominatedMetric}, and the place where "a scalar with no stated
 * population fails the emit" is actually enforced.
 *
 * Pure — no IO, no configuration, no decision. It turns a numerator, a
 * denominator, and a population definition into an envelope whose invariants
 * hold, or it throws.
 */
import type {
  DenominatedMetric,
  MetricBasis,
  MetricPopulation,
  MetricUnit,
} from '@harness-engineering/types';

/**
 * A metric was emitted in violation of the envelope's contract.
 *
 * Thrown, not returned. The contract is a programming invariant rather than a
 * runtime condition a caller can recover from: a metric with no stated
 * population is not a degraded metric, it is a number nobody can check, and
 * silently substituting a placeholder is precisely the failure the envelope
 * exists to prevent. Throwing is what makes the emit fail loudly in dev and in
 * CI — the test suite and the type checker are the two places this is meant to
 * bite, long before an operator reads the figure.
 */
export class MetricContractError extends Error {
  /** The metric id that violated the contract, or `'<unnamed>'` when even that was missing. */
  readonly metric: string;
  /** Which invariant was broken. */
  readonly violation: MetricViolation;

  constructor(metric: string, violation: MetricViolation, detail: string) {
    super(`Metric "${metric}" cannot be emitted (${violation}): ${detail}`);
    this.name = 'MetricContractError';
    this.metric = metric;
    this.violation = violation;
  }
}

/** The invariants {@link denominate} enforces. */
export type MetricViolation =
  | 'missing-metric-id'
  | 'missing-population'
  | 'non-finite-numerator'
  | 'negative-denominator'
  | 'missing-value'
  | 'non-finite-value';

/**
 * Inputs to {@link denominate}.
 *
 * `population` is required and has no default. That is deliberate and is the
 * single most important line in this module: an optional population, or one
 * with a fallback like `'unknown'`, would let every existing bare scalar be
 * wrapped without anybody having to think about what it was computed over —
 * which is the migration failure mode, not the migration.
 */
export interface DenominateInput {
  /** Stable metric id, e.g. `docs.coverage`. Non-blank. */
  metric: string;
  /** How many population members satisfied the metric's predicate. */
  numerator: number;
  /**
   * Population size. `0` records an abstention (an empty population); `null`
   * records an unknown population (the size could not be established, e.g. the
   * query failed). Never pass `0` to mean "we could not tell" — the two are
   * kept apart on purpose.
   */
  denominator: number | null;
  /** What the metric was computed over. Required. */
  population: MetricPopulation;
  /** How to read the value. Defaults to `'ratio'`. */
  unit?: MetricUnit;
  /**
   * The value, for composite metrics whose figure is not `numerator /
   * denominator` (a weighted index, a blended score). Required when
   * `unit === 'score'`; ignored for the derived units, which compute their own.
   */
  value?: number;
  /**
   * Decimal places to round the derived value to. Omit to keep full precision —
   * rounding is a presentation concern and the renderer does its own.
   */
  precision?: number;
}

/**
 * Build a {@link DenominatedMetric}, enforcing every envelope invariant.
 *
 * The three bases fall out of the denominator alone, so a caller cannot claim to
 * have measured something over an empty population:
 * - `denominator > 0` → `measured`, and the value is computed (or taken, for a
 *   composite `score`).
 * - `denominator === 0` → `abstained`, and `value` is `null` regardless of what
 *   the caller passed.
 * - `denominator === null` → `unknown`, and `value` is `null` likewise.
 *
 * @throws {MetricContractError} when the metric id or population definition is
 *   blank, the numerator is not finite, the denominator is negative, or a
 *   `score` was emitted over a real population without a value.
 */
export function denominate(input: DenominateInput): DenominatedMetric {
  const metric = input.metric?.trim() ?? '';
  if (metric.length === 0) {
    throw new MetricContractError('<unnamed>', 'missing-metric-id', 'metric id is blank');
  }
  const population = assertPopulation(metric, input.population);
  assertNumerator(metric, input.numerator);
  assertDenominator(metric, input.denominator);

  const unit = input.unit ?? 'ratio';
  const basis = basisFor(input.denominator);
  const value = basis === 'measured' ? measuredValue(metric, input, unit) : null;

  return {
    metric,
    value,
    numerator: input.numerator,
    denominator: input.denominator,
    population,
    basis,
    unit,
    note: noteFor(basis, input.numerator, input.denominator, population),
  };
}

/**
 * Convenience constructor for the "we could not establish the population" case,
 * so a caller with a failed query does not have to invent a numerator.
 *
 * Distinct from passing `denominator: 0`: this records that the size is unknown,
 * which an operator debugging the abstention needs in order to look at the fetch
 * rather than at the selector.
 */
export function unknownPopulation(metric: string, population: MetricPopulation): DenominatedMetric {
  return denominate({ metric, numerator: 0, denominator: null, population });
}

/**
 * A **census**: the population is itself the measurement — "we examined N of the
 * N there were".
 *
 * This is the shape behind every `0/0 checks passed`, `0/0 rows compared`,
 * `0 files scanned` line in the codebase, and it is where the bug class is
 * cheapest to catch: a census of zero is unambiguously an abstention, with no
 * numerator subtlety to argue about. Pass `null` for a size that could not be
 * established (a failed fetch) rather than `0`.
 *
 * The resulting metric is `measured` with `value === 1` for any non-empty
 * population — the value is uninteresting, and the point is the denominator and
 * the basis, which is what {@link verdictForMetrics} reads.
 */
export function census(
  metric: string,
  size: number | null,
  population: MetricPopulation
): DenominatedMetric {
  return denominate({ metric, numerator: size ?? 0, denominator: size, population });
}

/** `measured` iff the population is known and non-empty. */
function basisFor(denominator: number | null): MetricBasis {
  if (denominator === null) return 'unknown';
  return denominator === 0 ? 'abstained' : 'measured';
}

function assertPopulation(metric: string, population: MetricPopulation): MetricPopulation {
  const definition = population?.definition?.trim() ?? '';
  if (definition.length === 0) {
    throw new MetricContractError(
      metric,
      'missing-population',
      'no population definition — state what this number was computed over ' +
        '(the selection rule, not the metric name). A scalar with no stated ' +
        'population cannot be checked by anyone and is refused at the emit.'
    );
  }
  return { ...population, definition };
}

function assertNumerator(metric: string, numerator: number): void {
  if (!Number.isFinite(numerator)) {
    throw new MetricContractError(
      metric,
      'non-finite-numerator',
      `numerator is ${String(numerator)} — a metric never carries NaN or Infinity`
    );
  }
}

function assertDenominator(metric: string, denominator: number | null): void {
  if (denominator === null) return;
  if (!Number.isFinite(denominator) || denominator < 0) {
    throw new MetricContractError(
      metric,
      'negative-denominator',
      `denominator is ${String(denominator)} — a population size is a non-negative ` +
        'count, or null when it could not be established'
    );
  }
}

/** Derive (or accept) the value for a measured metric. Denominator is known `> 0`. */
function measuredValue(metric: string, input: DenominateInput, unit: MetricUnit): number {
  const denominator = input.denominator as number;
  if (unit === 'score') {
    if (input.value === undefined) {
      throw new MetricContractError(
        metric,
        'missing-value',
        "unit 'score' is a composite, so it cannot be derived from numerator/denominator — " +
          'pass an explicit value (the population is still required, and still recorded)'
      );
    }
    return round(assertFinite(metric, input.value), input.precision);
  }
  const raw = input.value ?? input.numerator / denominator;
  const scaled = unit === 'percent' ? raw * 100 : raw;
  return round(assertFinite(metric, scaled), input.precision);
}

function assertFinite(metric: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new MetricContractError(
      metric,
      'non-finite-value',
      `computed value is ${String(value)} — a metric never carries NaN or Infinity`
    );
  }
  return value;
}

function round(value: number, precision?: number): number {
  if (precision === undefined) return value;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

/**
 * The always-present one-liner that names the denominator.
 *
 * Written so that a figure copied out of a report — into a slide, a Slack
 * message, a status update — carries its population with it. The abstention and
 * unknown wordings deliberately avoid any word that could be read as a verdict:
 * an abstention is not "clean", "passing", or "0 problems".
 */
function noteFor(
  basis: MetricBasis,
  numerator: number,
  denominator: number | null,
  population: MetricPopulation
): string {
  const of = describePopulation(population);
  if (basis === 'abstained') {
    return `abstained — the population was empty (0 ${of}); this verifies nothing and is not a pass`;
  }
  if (basis === 'unknown') {
    return `abstained — the size of the population (${of}) could not be established; this is not a pass`;
  }
  return `${numerator} of ${String(denominator)} ${of}`;
}

/**
 * Render a population as a single readable clause: the definition, then any
 * window and exclusions that qualify it.
 *
 * Exclusions are appended rather than summarized because they are the part of a
 * denominator that is invisible in the number itself and therefore never
 * questioned unless it is written down next to it.
 */
export function describePopulation(population: MetricPopulation): string {
  const qualifiers: string[] = [];
  if (population.window) qualifiers.push(population.window);
  if (population.source) qualifiers.push(`from ${population.source}`);
  if (population.exclusions?.length) {
    qualifiers.push(`excluding ${population.exclusions.join('; ')}`);
  }
  return qualifiers.length === 0
    ? population.definition
    : `${population.definition} (${qualifiers.join(', ')})`;
}
