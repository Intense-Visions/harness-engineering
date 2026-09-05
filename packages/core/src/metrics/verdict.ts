/**
 * The pass / abstain / unknown decision over a set of denominated metrics
 * (issue #1530).
 *
 * This generalizes the exit-code pattern `harness roadmap sync` works out by
 * hand — exit 3 when it compared zero rows or fetched zero tickets, exit 2 when
 * the fetch itself failed, exit 0 only when a real population was examined — so
 * every surface that emits metrics draws the same three-way distinction instead
 * of each inventing its own.
 *
 * The rule the whole module exists to enforce: **a run that examined nothing has
 * abstained, not passed.** An abstention is more misleading than an error,
 * because an error announces itself and an abstention is the one that would
 * otherwise be reported as green.
 */
import type { DenominatedMetric } from '@harness-engineering/types';

import { describePopulation } from './denominate';

/**
 * The three outcomes a set of metrics can produce.
 *
 * - `converged` — every required metric was measured over a non-empty population.
 * - `abstained` — at least one required metric had an empty population. Never
 *   report this as a pass.
 * - `unknown` — at least one required metric's population size could not be
 *   established, and none abstained. Distinguished from `abstained` because the
 *   operator response differs: a broken fetch, not an empty selector.
 */
export type MetricOutcome = 'converged' | 'abstained' | 'unknown';

/** Options for {@link verdictForMetrics}. */
export interface MetricVerdictOptions {
  /**
   * Metric ids that must be `measured` for the verdict to converge. Omit to
   * require every supplied metric — strict by default, because the whole point
   * is that a silently-empty population must not slip through.
   */
  required?: readonly string[];
  /**
   * What the caller was measuring, used in the message when the set is empty.
   * e.g. `'the documentation coverage check'`.
   */
  subject?: string;
}

/** The decision, plus everything needed to explain it to an operator. */
export interface MetricVerdict {
  /** True only when the outcome is `converged`. */
  ok: boolean;
  /** Which of the three outcomes applies. */
  outcome: MetricOutcome;
  /**
   * The metrics responsible for a non-converged outcome, in the order supplied.
   * Empty when `ok`.
   */
  offenders: DenominatedMetric[];
  /**
   * Operator-facing explanation, or `null` when converged. Leads with
   * `ZERO DENOMINATOR:` for an abstention so the string is greppable in a log
   * and matches the wording `harness roadmap sync` already emits.
   */
  message: string | null;
}

/**
 * Decide whether a set of metrics converged, abstained, or has an unknown
 * population.
 *
 * Denominator discipline comes first: when both an abstention and an unknown
 * population are present, the outcome is `abstained`, because a known-empty
 * population is the case most likely to be mistaken for a clean result.
 *
 * An **empty set of metrics is itself a zero denominator** and never converges.
 * A reporting path that emitted no metrics at all measured nothing, and the
 * commonest way this whole class of bug survives is a loop that ran zero times
 * and then reported success.
 */
export function verdictForMetrics(
  metrics: readonly DenominatedMetric[],
  options: MetricVerdictOptions = {}
): MetricVerdict {
  if (metrics.length === 0) {
    return {
      ok: false,
      outcome: 'abstained',
      offenders: [],
      message:
        `ZERO DENOMINATOR: no metrics were emitted at all` +
        `${options.subject ? ` by ${options.subject}` : ''} — nothing was measured. ` +
        'This is an abstention, not a pass: check that the thing being measured ' +
        'really produced a population.',
    };
  }

  const required = options.required;
  if (required) {
    // Membership, not a length comparison: a metric emitted twice under the same
    // id would otherwise make the counts line up while a required id was still
    // missing — a denominator bug in the denominator check.
    const emitted = new Set(metrics.map((m) => m.metric));
    if (required.some((id) => !emitted.has(id))) return missingRequired(metrics, required);
  }
  const considered = required ? metrics.filter((m) => required.includes(m.metric)) : metrics;

  const abstained = considered.filter((m) => m.basis === 'abstained');
  if (abstained.length > 0) {
    return { ok: false, outcome: 'abstained', offenders: abstained, message: zeroMsg(abstained) };
  }

  const unknown = considered.filter((m) => m.basis === 'unknown');
  if (unknown.length > 0) {
    return { ok: false, outcome: 'unknown', offenders: unknown, message: unknownMsg(unknown) };
  }

  return { ok: true, outcome: 'converged', offenders: [], message: null };
}

/**
 * A required metric was never emitted. Treated as an abstention rather than a
 * misconfiguration: from the reader's side, a metric that was supposed to be
 * measured and is simply absent is indistinguishable from one measured over an
 * empty population, and both must refuse to read as green.
 */
function missingRequired(
  metrics: readonly DenominatedMetric[],
  required: readonly string[]
): MetricVerdict {
  const seen = new Set(metrics.map((m) => m.metric));
  const missing = required.filter((id) => !seen.has(id));
  return {
    ok: false,
    outcome: 'abstained',
    offenders: [],
    message:
      `ZERO DENOMINATOR: required metric(s) never emitted: ${missing.join(', ')}. ` +
      'A metric that was supposed to be measured and is absent verifies nothing — ' +
      'an abstention, not a pass.',
  };
}

function zeroMsg(offenders: readonly DenominatedMetric[]): string {
  const lines = offenders.map((m) => `  - ${m.metric}: 0 ${describePopulation(m.population)}`);
  return (
    `ZERO DENOMINATOR: ${offenders.length} metric(s) were computed over an empty ` +
    `population, so they measured nothing:\n${lines.join('\n')}\n` +
    'This is an abstention, not a pass: an empty population usually means the ' +
    'selector matched nothing, not that everything is fine.'
  );
}

function unknownMsg(offenders: readonly DenominatedMetric[]): string {
  const lines = offenders.map((m) => `  - ${m.metric}: ${describePopulation(m.population)}`);
  return (
    `UNKNOWN DENOMINATOR: ${offenders.length} metric(s) could not establish the size ` +
    `of their population:\n${lines.join('\n')}\n` +
    'The population is unknown rather than known-to-be-empty — look at whatever ' +
    'was supposed to produce it, not at the selector.'
  );
}
