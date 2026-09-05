/**
 * Denominated metrics (issue #1530) — the shared mechanism for "a metric must
 * declare what it was computed over".
 *
 * A 90-day measurement across 1,957 repositories produced five wrong figures and
 * every one was a denominator error, not a numerator error. Numerators had been
 * cross-validated to 0.24% against git; the divisors were never checked once.
 * The five observed failure classes are catalogued, with the review questions
 * that catch them, in `docs/conventions/metric-denominators.md`.
 *
 * This module is the generalization of three point fixes this repo already made
 * against the same bug class — #1013 (print the denominator so a partial audit
 * never reads as a full pass), #1146 (a scan that read nothing abstained rather
 * than passed), and the `ZERO DENOMINATOR` exit code in `harness roadmap sync`
 * — plus the local convention stated in `harness burn calibrate`: *a zero
 * denominator is an abstention, not a calibration.*
 *
 * Three pieces:
 * - {@link denominate} constructs the envelope and refuses a metric with no
 *   stated population. This is where "bare scalars fail the emit" bites.
 * - {@link verdictForMetrics} turns a set of metrics into the pass / abstain /
 *   unknown decision, generalizing the `ZERO DENOMINATOR` exit-code pattern.
 * - {@link formatMetric} renders a value that structurally cannot be separated
 *   from its population, and renders an abstention as an em dash rather than a
 *   number.
 *
 * The envelope type itself lives in `@harness-engineering/types` so a result
 * shape can carry a denominated figure without depending on this package.
 */
export type {
  DenominatedMetric,
  MetricBasis,
  MetricPopulation,
  MetricUnit,
} from '@harness-engineering/types';

export {
  census,
  denominate,
  describePopulation,
  MetricContractError,
  unknownPopulation,
} from './denominate';
export type { DenominateInput, MetricViolation } from './denominate';

export { verdictForMetrics } from './verdict';
export type { MetricOutcome, MetricVerdict, MetricVerdictOptions } from './verdict';

export {
  ABSTENTION_PLACEHOLDER,
  formatMetric,
  formatMetricBlock,
  formatMetricValue,
  formatPopulation,
} from './render';
export type { FormatMetricOptions } from './render';
