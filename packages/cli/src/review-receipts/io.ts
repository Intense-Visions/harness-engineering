import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import {
  FULL_SHA_PATTERN,
  finalReviewBase,
  readRegularFile,
  resolveSessionDir,
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
