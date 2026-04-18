import { execFile } from 'node:child_process';

/**
 * A no-op `execFile` replacement for tests that construct real Orchestrator
 * instances. This prevents the PRDetector from shelling out to `gh`, which
 * requires a GH_TOKEN that is unavailable in CI test jobs.
 *
 * The stub invokes the callback with stdout "0\n" (zero open PRs), so
 * filterCandidatesWithOpenPRs passes all candidates through.
 *
 * Supports both callback and promisify usage via custom promisify symbol.
 */
const noopExecFileFn = ((...args: unknown[]) => {
  const cb = args[args.length - 1];
  if (typeof cb === 'function') {
    process.nextTick(() => cb(null, '0\n', ''));
  }
  return undefined as any;
}) as typeof execFile;

// Make promisify(noopExecFile) return { stdout, stderr } like real execFile
(noopExecFileFn as any)[Symbol.for('nodejs.util.promisify.custom')] = () =>
  Promise.resolve({ stdout: '0\n', stderr: '' });

export const noopExecFile: typeof execFile = noopExecFileFn;
