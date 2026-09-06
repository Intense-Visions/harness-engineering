/**
 * Rendering for denominated metrics (issue #1530).
 *
 * The rule these functions exist to make unavoidable: **a renderer never prints
 * a metric's value without its population, and never prints an abstention as a
 * number.** Both properties are structural rather than conventional — the
 * functions take a {@link DenominatedMetric}, which cannot exist without a
 * population, and an abstained metric has `value === null`, so there is no
 * number available to print even by accident.
 *
 * Presentation only. Nothing here decides anything; see `verdict.ts` for that.
 */
import type { DenominatedMetric } from '@harness-engineering/types';

import { describePopulation } from './denominate';

/**
 * What a renderer shows in place of a value when the metric abstained.
 *
 * An em dash, not `0`, not `n/a`, and not `100%`. A zero would be read as a
 * measurement ("no failures!"), which is exactly the misreading the envelope
 * exists to prevent; a dash reads as absence and prompts the reader to look at
 * the note next to it.
 */
export const ABSTENTION_PLACEHOLDER = '—';

/** Options for {@link formatMetric}. */
export interface FormatMetricOptions {
  /** Decimal places for the value. Defaults to 1. */
  precision?: number;
}

/**
 * Render just the value, or the abstention placeholder.
 *
 * Use this only where the population is rendered separately and adjacently (a
 * table with a dedicated population column). Everywhere else prefer
 * {@link formatMetric}, which cannot separate the two.
 */
export function formatMetricValue(
  metric: DenominatedMetric,
  options: FormatMetricOptions = {}
): string {
  if (metric.value === null) return ABSTENTION_PLACEHOLDER;
  const precision = options.precision ?? 1;
  const shown = metric.value.toFixed(precision);
  return metric.unit === 'percent' ? `${shown}%` : shown;
}

/**
 * Render a metric as one line that carries its own denominator.
 *
 * A measured metric reads `docs.coverage: 94.0% (312 of 332 markdown files under
 * docs/)`. An abstained one reads `docs.coverage: — (abstained — the population
 * was empty (0 markdown files under docs/); this verifies nothing and is not a
 * pass)`, which is deliberately harder to skim past than a green `100%` would be.
 */
export function formatMetric(metric: DenominatedMetric, options: FormatMetricOptions = {}): string {
  return `${metric.metric}: ${formatMetricValue(metric, options)} (${metric.note})`;
}

/**
 * Render a set of metrics as a block, abstentions last.
 *
 * Ordering is not cosmetic: an abstention buried between two healthy figures is
 * the thing a reader's eye slides over, and it is the one datapoint that most
 * needs to be acted on. Trailing them puts them where a reader stops.
 */
export function formatMetricBlock(
  metrics: readonly DenominatedMetric[],
  options: FormatMetricOptions = {}
): string {
  if (metrics.length === 0) {
    return 'No metrics emitted — nothing was measured (an abstention, not a pass).';
  }
  const measured = metrics.filter((m) => m.basis === 'measured');
  const withheld = metrics.filter((m) => m.basis !== 'measured');
  return [...measured, ...withheld].map((m) => formatMetric(m, options)).join('\n');
}

/**
 * The population clause on its own, for renderers with a dedicated column or a
 * hover/expand affordance (the dashboard case).
 */
export function formatPopulation(metric: DenominatedMetric): string {
  return describePopulation(metric.population);
}
