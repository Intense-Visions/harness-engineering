import { execFile } from 'node:child_process';

/**
 * A no-op `execFile` replacement for tests that construct real Orchestrator
 * instances. This prevents the PRDetector from shelling out to `gh`, which
 * requires a GH_TOKEN that is unavailable in CI test jobs.
 *
 * The stub invokes the callback with stdout "0\n" (zero open PRs), so
 * filterCandidatesWithOpenPRs passes all candidates through.
 */
export const noopExecFile: typeof execFile = ((...args: unknown[]) => {
  // The last argument is the callback
  const cb = args[args.length - 1];
  if (typeof cb === 'function') {
    // Invoke callback with stdout "0\n" meaning no open PRs
    process.nextTick(() => cb(null, '0\n', ''));
  }
  return undefined as any;
}) as typeof execFile;
