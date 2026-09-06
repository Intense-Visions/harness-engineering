import { census, unknownPopulation, verdictForMetrics } from '@harness-engineering/core';
import type { DenominatedMetric } from '@harness-engineering/core';

import { CLIError, ExitCode } from '../../utils/errors';
import type { RoadmapSyncReport } from './sync-report';

/**
 * The pass / abstain / fail decision for `harness roadmap sync`.
 *
 * One responsibility: turn a {@link RoadmapSyncReport} into the command's exit
 * status. Kept separate from the report itself because this is where the
 * project's no-silent-abstention doctrine actually bites, and it should be
 * readable — and testable — without the commander wiring around it.
 *
 * ## Exit codes
 *
 * | Code | Meaning |
 * | ---- | ------- |
 * | 0    | Converged: a non-zero denominator was examined and no errors occurred. |
 * | 2    | `ExitCode.ERROR` — misconfiguration or a sync error (no roadmap source, no tracker config, no token, ticket fetch failed, per-feature push/pull errors). |
 * | 3    | `ExitCode.ZERO_DENOMINATOR` — the run examined NOTHING (zero roadmap rows parsed, or zero tickets fetched with a tracker configured). |
 *
 * Exit code 1 (`VALIDATION_FAILED`) is deliberately unused: this command either
 * abstained (3), broke (2), or converged (0).
 *
 * ## Why this routes through the shared metrics API (issue #1530)
 *
 * This command worked the abstention rule out by hand first, and for a while it
 * was the only place in the repo that drew the zero / unknown / measured
 * distinction properly. It is now expressed in terms of
 * `denominate` + `verdictForMetrics` from `@harness-engineering/core` instead —
 * the decision rule lives in one place, and every other surface that adopts the
 * envelope inherits exactly this behavior rather than re-deriving it. The
 * command-specific wording is still appended here, because what an operator
 * should go and look at is domain knowledge the shared layer does not have.
 */

/**
 * The two populations this command examines, as denominated metrics.
 *
 * Both are censuses — the population *is* the measurement ("we compared the N
 * rows there were"). `ticketsFetched: null` becomes an `unknown` population
 * rather than a zero one, which is the distinction that keeps a broken token
 * from reading like an empty label selector.
 */
export function syncMetrics(report: RoadmapSyncReport): DenominatedMetric[] {
  const { roadmapRows, ticketsFetched } = report.examined;
  return [
    census('roadmap.rows_compared', roadmapRows, {
      definition: 'roadmap rows parsed and compared',
      source:
        'the shards under docs/roadmap.d/, or the monolith aggregate when the ' +
        'project has not been sharded',
    }),
    ticketsFetched === null
      ? unknownPopulation('tracker.tickets_fetched', {
          definition: 'tickets fetched from the configured tracker',
          source: 'a tracker query that did not return',
        })
      : census('tracker.tickets_fetched', ticketsFetched, {
          definition: 'tickets fetched from the configured tracker',
          source: 'the configured tracker, filtered by the selector labels',
        }),
  ];
}

/**
 * Decide whether the run failed, abstained, or converged. `null` means converged.
 *
 * Denominator discipline comes FIRST: an abstention is more misleading than an
 * error, because it is the one that would otherwise be reported as green. A sync
 * that compared zero rows, or fetched zero tickets against a configured
 * tracker, has verified nothing — it must never read as a pass. That ordering is
 * now the shared `verdictForMetrics` rule rather than a local one.
 */
export function verdictFor(report: RoadmapSyncReport): CLIError | null {
  const { roadmapRows } = report.examined;
  const verdict = verdictForMetrics(syncMetrics(report), { subject: 'harness roadmap sync' });

  if (verdict.outcome === 'abstained') {
    return new CLIError(
      `${verdict.message}\n${abstentionHint(verdict.offenders)}`,
      ExitCode.ZERO_DENOMINATOR
    );
  }

  // A FAILED fetch is an error, not an abstention: the denominator is unknown
  // rather than zero, and the two must stay distinguishable to an operator.
  if (verdict.outcome === 'unknown') {
    return new CLIError(
      `Ticket fetch failed, so nothing could be compared against the tracker ` +
        `(${roadmapRows} roadmap row(s) parsed). See the errors above.`,
      ExitCode.ERROR
    );
  }

  if (report.errors.length > 0) {
    return new CLIError(
      `Sync completed with ${report.errors.length} error(s); see the report above`,
      ExitCode.ERROR
    );
  }

  return null;
}

/**
 * What to go and check, per empty population. The shared message says the
 * population was empty and that this is not a pass; only this command knows
 * that an empty ticket set usually means the selector labels, the token scope,
 * or the repo name.
 */
function abstentionHint(offenders: readonly DenominatedMetric[]): string {
  const ids = new Set(offenders.map((m) => m.metric));
  const hints: string[] = [];
  if (ids.has('roadmap.rows_compared')) {
    hints.push(
      'Check that the roadmap source really contains rows (the shards under ' +
        'docs/roadmap.d/, or the monolith aggregate when the project has not been sharded).'
    );
  }
  if (ids.has('tracker.tickets_fetched')) {
    hints.push(
      'A tracker is configured, so zero tickets means the selector labels match ' +
        'nothing, the token cannot see the repo, or the repo is wrong.'
    );
  }
  return hints.join(' ');
}
