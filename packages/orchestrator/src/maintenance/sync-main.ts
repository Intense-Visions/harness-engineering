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
  /** Per-git-call timeout in ms. Defaults to 60_000ms. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** Internal: run a git command, capture stdout/stderr, throw on non-zero exit. */
async function git(
  execFileFn: ExecFileFn,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  const exec = promisify(execFileFn);
  const { stdout, stderr } = await exec('git', args, { cwd, timeout: timeoutMs });
  return { stdout: String(stdout), stderr: String(stderr) };
}

/** True iff `err` represents a missing-binary spawn failure (ENOENT). */
function isSpawnEnoent(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === 'ENOENT';
}

/** True iff `git rev-parse --verify --quiet <ref>` succeeds. ENOENT escapes. */
async function refExists(
  execFileFn: ExecFileFn,
  ref: string,
  cwd: string,
  timeoutMs: number
): Promise<boolean> {
  try {
    await git(execFileFn, ['rev-parse', '--verify', '--quiet', ref], cwd, timeoutMs);
    return true;
  } catch (err) {
    if (isSpawnEnoent(err)) throw err;
    return false;
  }
}

/**
 * Resolves `origin/<default>` via priority: symbolic-ref → origin/main → origin/master.
 * Returns null when none resolve.
 */
async function resolveOriginDefault(
  execFileFn: ExecFileFn,
  cwd: string,
  timeoutMs: number
): Promise<string | null> {
  try {
    const { stdout } = await git(
      execFileFn,
      ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
      cwd,
      timeoutMs
    );
    const v = stdout.trim();
    if (v) return v; // typically 'origin/main'
  } catch (err) {
    if (isSpawnEnoent(err)) throw err;
    // fall through to local fall-back probes
  }
  for (const candidate of ['origin/main', 'origin/master']) {
    if (await refExists(execFileFn, candidate, cwd, timeoutMs)) return candidate;
  }
  return null;
}

/** Strips the leading 'origin/' prefix to get the short branch name. */
function shortName(originRef: string): string {
  return originRef.startsWith('origin/') ? originRef.slice('origin/'.length) : originRef;
}

/** Heuristic for git's "uncommitted edits would be overwritten" stderr. */
function isDirtyConflictStderr(s: string): boolean {
  return /would be overwritten|local changes|Aborting/i.test(s);
}

/**
 * Extracts a printable stderr string from a thrown exec error. Prefers the
 * `stderr` property attached by `child_process.execFile` on non-zero exit,
 * falling back to `Error.message` and finally a String() coercion.
 */
function extractStderr(err: unknown): string {
  if (err && typeof err === 'object' && 'stderr' in err) {
    const raw = (err as { stderr?: unknown }).stderr;
    if (typeof raw === 'string') return raw;
    if (raw instanceof Buffer) return raw.toString('utf8');
  }
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
}

/** True iff `git merge-base --is-ancestor a b` exits 0. ENOENT escapes. */
async function isAncestor(
  execFileFn: ExecFileFn,
  a: string,
  b: string,
  cwd: string,
  timeoutMs: number
): Promise<boolean> {
  try {
    await git(execFileFn, ['merge-base', '--is-ancestor', a, b], cwd, timeoutMs);
    return true;
  } catch (err) {
    if (isSpawnEnoent(err)) throw err;
    return false;
  }
}

/**
 * Fast-forward the local default branch from `origin/<default>` if it can be
 * done safely. This function is total: it never throws under expected
 * conditions. Even unexpected errors are caught and converted to
 * `{ status: 'error', message }` so the maintenance scheduler does not back
 * off on transient git issues.
 */
export async function syncMain(
  repoRoot: string,
  opts: SyncMainOptions = {}
): Promise<SyncMainResult> {
  const execFileFn = opts.execFileFn ?? nodeExecFile;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    // 1. Resolve origin's default ref.
    const originRef = await resolveOriginDefault(execFileFn, repoRoot, timeoutMs);
    if (!originRef) {
      return {
        status: 'skipped',
        reason: 'no-remote',
        detail: 'origin/HEAD unset and neither origin/main nor origin/master resolves',
        defaultBranch: '',
      };
    }
    const defaultBranch = shortName(originRef);

    // 2. Compare current branch to default.
    const { stdout: currentRaw } = await git(
      execFileFn,
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      repoRoot,
      timeoutMs
    );
    const current = currentRaw.trim();
    if (current !== defaultBranch) {
      return {
        status: 'skipped',
        reason: 'wrong-branch',
        detail: `current branch '${current}' is not the default '${defaultBranch}'`,
        defaultBranch,
      };
    }

    // 3. Fetch origin/<default>.
    try {
      await git(execFileFn, ['fetch', 'origin', defaultBranch, '--quiet'], repoRoot, timeoutMs);
    } catch (err) {
      if (isSpawnEnoent(err)) throw err;
      return {
        status: 'skipped',
        reason: 'fetch-failed',
        detail: err instanceof Error ? err.message : String(err),
        defaultBranch,
      };
    }

    // 4. Compare HEAD to origin/<default>.
    const headIsAncestor = await isAncestor(execFileFn, 'HEAD', originRef, repoRoot, timeoutMs);
    const originIsAncestor = await isAncestor(execFileFn, originRef, 'HEAD', repoRoot, timeoutMs);

    if (headIsAncestor && originIsAncestor) {
      return { status: 'no-op', defaultBranch };
    }
    if (!headIsAncestor) {
      return {
        status: 'skipped',
        reason: 'diverged',
        detail: `local '${defaultBranch}' has commits not on '${originRef}'`,
        defaultBranch,
      };
    }
    // headIsAncestor && !originIsAncestor → strictly behind → fast-forward.
    const before = (
      await git(execFileFn, ['rev-parse', 'HEAD'], repoRoot, timeoutMs)
    ).stdout.trim();
    try {
      await git(execFileFn, ['merge', '--ff-only', originRef], repoRoot, timeoutMs);
    } catch (err) {
      const stderr = extractStderr(err);
      if (isDirtyConflictStderr(stderr)) {
        return {
          status: 'skipped',
          reason: 'dirty-conflict',
          detail: stderr.split('\n')[0] ?? 'merge --ff-only failed due to working-tree changes',
          defaultBranch,
        };
      }
      // Unexpected merge failure — bubble up to top-level error path.
      throw err;
    }
    const after = (await git(execFileFn, ['rev-parse', 'HEAD'], repoRoot, timeoutMs)).stdout.trim();
    return { status: 'updated', from: before, to: after, defaultBranch };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
