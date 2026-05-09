import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Function signature compatible with Node's `child_process.execFile`.
 * Allows injection for testing.
 */
export type ExecFileFn = typeof nodeExecFile;

/** Reasons `syncMain()` declines to fast-forward (none of which are failures). */
export type SyncSkipReason =
  | 'wrong-branch'
  | 'diverged'
  | 'dirty-conflict'
  | 'no-remote'
  | 'fetch-failed';

/** Total result type for `syncMain()`. Discriminated by `status`. */
export type SyncMainResult =
  | { status: 'updated'; from: string; to: string; defaultBranch: string }
  | { status: 'no-op'; defaultBranch: string }
  | {
      status: 'skipped';
      reason: SyncSkipReason;
      detail: string;
      defaultBranch: string;
    }
  | { status: 'error'; message: string };

/** Options accepted by `syncMain()`. */
export interface SyncMainOptions {
  /** Override the `git` runner; defaults to `node:child_process.execFile`. */
  execFileFn?: ExecFileFn;
}

/**
 * Fast-forward the local default branch from `origin/<default>` if it can be
 * done safely. This stub returns `error` until the algorithm lands in Task 4.
 */
export async function syncMain(
  repoRoot: string,
  opts: SyncMainOptions = {}
): Promise<SyncMainResult> {
  // Implementation arrives in Task 4. Stub keeps the type surface honest.
  void repoRoot;
  void opts;
  void promisify;
  return { status: 'error', message: 'syncMain not yet implemented' };
}
