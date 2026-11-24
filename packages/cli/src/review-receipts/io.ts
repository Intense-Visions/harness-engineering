import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FULL_SHA_PATTERN,
  finalReviewBase,
  readRegularFile,
  readReviewReceiptFile,
  resolveSessionDir,
  type EarlierPhaseReceipt,
  type FinalReviewBase,
  type Result,
} from '@harness-engineering/core';

/**
 * Injectable git seam: trimmed stdout of `git <args>` run in `cwd`. No shell. Named apart from
 * `CwdGit` in ../git/merge-driver-setup, which runs in a fixed directory and returns nothing.
 */
export type CwdGit = (args: string[], cwd: string) => string;

export const runGitIn: CwdGit = (args, cwd) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .toString()
    .trim();

export function tryGit(git: CwdGit, args: string[], cwd: string): string | undefined {
  try {
    return git(args, cwd);
  } catch {
    return undefined;
  }
}

/**
 * The files `<base>..<head>` changes, or undefined when git cannot say. Run it at the repository
 * top (`resolveRepoRoots`): from a subdirectory a user's `diff.relative` config would list paths
 * relative to that directory. Asked for with `-z`:
 * without it git quotes and octal-escapes any path holding a non-ASCII byte (`core.quotepath`),
 * so `é.ts` would come back as `"\303\251.ts"` and match nothing a reviewer listed. Renames are
 * listed as both paths, so a rename of an entry point or of a file a reviewer read is in the set.
 */
export function listDiffFiles(
  git: CwdGit,
  base: string,
  head: string,
  cwd: string
): string[] | undefined {
  return tryGit(git, ['diff', '--name-only', '--no-renames', '-z', `${base}..${head}`], cwd)
    ?.split('\0')
    .filter((s) => s !== '');
}

/**
 * Whether the tracked files equal HEAD: `git status --porcelain=v1 -z --untracked-files=no`
 * prints nothing. Untracked files (a review directory, session state) do not count. undefined:
 * git could not say. Run it at the repository top.
 */
export function worktreeClean(git: CwdGit, top: string): boolean | undefined {
  const status = tryGit(git, ['status', '--porcelain=v1', '-z', '--untracked-files=no'], top);
  return status === undefined ? undefined : status === '';
}

export interface RepoRoots {
  /** Top level of the worktree `cwd` is in: sessions, config and diff paths are under it. */
  top: string;
}

/**
 * The one root rule of the review commands, so each gives the same answer from the root, a
 * subdirectory and a linked worktree. undefined outside a git repository.
 */
export function resolveRepoRoots(git: CwdGit, cwd: string): RepoRoots | undefined {
  const top = tryGit(git, ['rev-parse', '--show-toplevel'], cwd);
  if (top === undefined || top === '') return undefined;
  return { top };
}

/** A session's directory under the worktree `cwd` is in (under `cwd` itself outside a repository). */
export function sessionDirFrom(git: CwdGit, cwd: string, slug: string): Result<string, Error> {
  return resolveSessionDir(resolveRepoRoots(git, cwd)?.top ?? cwd, slug);
}

/**
 * A session's autopilot-state.json, read as a regular file of at most 5 MB (like a receipt);
 * undefined when it is absent, not a regular file, too large or unreadable.
 */
export function readSessionStateText(sessionDir: string): string | undefined {
  const read = readRegularFile(path.join(sessionDir, 'autopilot-state.json'));
  return 'text' in read ? read.text : undefined;
}

/** The session's starting commit when its state holds a full sha; undefined: unknown. */
export function sessionStartingCommit(sessionDir: string | undefined): string | undefined {
  if (sessionDir === undefined) return undefined;
  let state: unknown;
  try {
    state = JSON.parse(readSessionStateText(sessionDir) ?? '');
  } catch {
    return undefined;
  }
  const start =
    state !== null && typeof state === 'object' && !Array.isArray(state)
      ? (state as { startingCommit?: unknown }).startingCommit
      : undefined;
  return typeof start === 'string' && FULL_SHA_PATTERN.test(start) ? start : undefined;
}

export const isSha = (v: unknown): v is string => typeof v === 'string' && FULL_SHA_PATTERN.test(v);
/** The own fields of an unparsed JSON value; none when it is not an object. */
export const fields = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' ? { ...v } : {};

/** `phase-N` with N written as the session layout writes it (no leading zeros). */
const PHASE_LABEL = /^phase-(0|[1-9][0-9]{0,8})$/;

/**
 * The nearest earlier phase review of the same session that holds a `receipt.json`, read as a
 * receipt is read (a regular file of at most 5 MB inside the reviews directory). A phase directory
 * with no receipt is passed over; one whose receipt cannot be read, or holds no full `diff.head`,
 * is returned with no head, so the caller cannot pass over it. `reviewDir` is `phase-N`.
 */
export function earlierPhaseReceipt(reviewDir: string): EarlierPhaseReceipt {
  const n = PHASE_LABEL.exec(path.basename(reviewDir))?.[1];
  if (n === undefined) return { status: 'none' };
  const reviews = path.dirname(reviewDir);
  let entries: string[];
  try {
    entries = fs.readdirSync(reviews);
  } catch {
    return { status: 'none' };
  }
  const earlier = entries
    .map((e) => PHASE_LABEL.exec(e)?.[1])
    .filter((m): m is string => m !== undefined)
    .map(Number)
    .filter((m) => m < Number(n))
    .sort((a, b) => b - a);
  for (const phase of earlier) {
    const file = path.join(reviews, `phase-${phase}`, 'receipt.json');
    const read = readReviewReceiptFile(file, { within: reviews });
    if (read.status === 'missing') continue;
    const head = read.status === 'ok' ? fields(fields(read.raw).diff).head : undefined;
    return { status: 'found', phase, head: isSha(head) ? head : undefined };
  }
  return { status: 'none' };
}

/**
 * `git merge-base origin/<default branch> <head>`: the default branch is origin/HEAD's target,
 * else origin/main, else origin/master, the first for which git answers. undefined: none does.
 * These are local remote-tracking refs, so the answer is only as current as the clone's refs.
 */
export function defaultBranchMergeBase(git: CwdGit, head: string, cwd: string): string | undefined {
  const named = tryGit(
    git,
    ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
    cwd
  );
  for (const ref of [named, 'origin/main', 'origin/master']) {
    const base = ref ? tryGit(git, ['merge-base', '--end-of-options', ref, head], cwd) : undefined;
    if (base) return base;
  }
  return undefined;
}

/**
 * The base a final review must have (core `finalReviewBase` over the default-branch merge base
 * and the session's starting commit). The gate and `harness review-tier` both use this.
 */
export function resolveFinalReviewBase(opts: {
  cwd: string;
  head: string;
  startingCommit?: string | undefined;
  git?: CwdGit;
}): FinalReviewBase {
  const mergeBase = defaultBranchMergeBase(opts.git ?? runGitIn, opts.head, opts.cwd);
  return finalReviewBase(mergeBase, opts.startingCommit);
}
