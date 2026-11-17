/**
 * Shared failure reporting for the routing subcommands. Kept apart from the
 * HTTP helpers so tests that mock `./http-client` still exercise it.
 */
import { orchestratorBase } from './http-client';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

/**
 * Reports a failed routing call and exits `ExitCode.ERROR`.
 *
 * The message always goes to stderr. Under `--json` the same failure is ALSO
 * emitted on stdout as `{ "error": <message>, "status": <http status, 0 when
 * unreachable> }`, so a machine consumer gets one parseable document whose
 * verdict agrees with the non-zero exit instead of an empty stdout.
 */
export function failRoutingCall(message: string, status: number, json: boolean | undefined): void {
  if (json) console.log(JSON.stringify({ error: message, status }, null, 2));
  logger.error(message);
  process.exit(ExitCode.ERROR);
}

/** Maps a failed routing response to its user-facing error message. */
export function routingFailureMessage(
  r: { status: number; error?: string },
  opts: { unavailableOn503?: boolean; failedLabel?: string } = {}
): string {
  if (r.status === 0) {
    return `Failed to reach orchestrator at ${orchestratorBase()}: ${r.error ?? 'unknown error'}`;
  }
  if (r.status === 503 && opts.unavailableOn503) {
    return 'Routing observability not available — orchestrator has no BackendRouter (legacy single-backend config)';
  }
  return `${opts.failedLabel ?? 'Request failed'} (${r.status}): ${r.error ?? ''}`;
}
