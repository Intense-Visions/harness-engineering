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
 */

/**
 * Decide whether the run failed, abstained, or converged. `null` means converged.
 *
 * Denominator discipline comes FIRST: an abstention is more misleading than an
 * error, because it is the one that would otherwise be reported as green. A sync
 * that compared zero rows, or fetched zero tickets against a configured
 * tracker, has verified nothing — it must never read as a pass.
 */
export function verdictFor(report: RoadmapSyncReport): CLIError | null {
  const { roadmapRows, ticketsFetched } = report.examined;

  if (roadmapRows === 0) {
    return new CLIError(
      'ZERO DENOMINATOR: 0 roadmap rows parsed — the sync compared nothing. ' +
        'This is an abstention, not a pass: check that the roadmap source really ' +
        'contains rows (the shards under docs/roadmap.d/, or the monolith aggregate ' +
        'when the project has not been sharded).',
      ExitCode.ZERO_DENOMINATOR
    );
  }

  // A FAILED fetch is an error, not an abstention: the denominator is unknown
  // rather than zero, and the two must stay distinguishable to an operator.
  if (ticketsFetched === null) {
    return new CLIError(
      `Ticket fetch failed, so nothing could be compared against the tracker ` +
        `(${roadmapRows} roadmap row(s) parsed). See the errors above.`,
      ExitCode.ERROR
    );
  }

  if (ticketsFetched === 0) {
    return new CLIError(
      `ZERO DENOMINATOR: 0 tickets fetched from the configured tracker ` +
        `(${roadmapRows} roadmap row(s) parsed). A tracker is configured, so zero ` +
        'tickets means the selector labels match nothing, the token cannot see the ' +
        'repo, or the repo is wrong — an abstention, not a pass.',
      ExitCode.ZERO_DENOMINATOR
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
