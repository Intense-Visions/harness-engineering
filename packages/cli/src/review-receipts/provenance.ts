import * as path from 'node:path';
import {
  Err,
  Ok,
  REVIEWS_DIRNAME,
  assembleStamp,
  noteText,
  phaseOfReviewLabel,
  readArchivedRounds,
  readSessionReviewState,
  renderProvenanceBlock,
  type Result,
  type ReviewDirRead,
  type StampGit,
  type StampRow,
} from '@harness-engineering/core';
import { gateReviewReceipt, phaseBaseAt, type CwdGit, type UnreadReceipt } from './gate';
import {
  isDirectory,
  listDiffFiles,
  listDirectoryEntries,
  readSessionStateText,
  resolveFinalReviewBase,
  resolveRepoRoots,
  runGitIn,
  sessionDirFrom,
  tryGit,
} from './io';

export type { CwdGit };

export interface ReviewProvenanceReport {
  session: string;
  reviewsDir: string;
  /**
   * One entry per review, in stamp order: a reviewed row, or `{ review, unread }` for a review
   * whose receipt was not read, with the decisions recorded for it (status `absent`: an expected
   * review with no directory, the MISSING row; `skipped`: a review a `skipped` decision covers).
   */
  rows: StampRow[];
  /** What the stamp says under the table, as printed. */
  notes: string[];
  /** The Markdown stamp, markers included. */
  block: string;
}

interface StampEnv {
  cwd: string;
  git: CwdGit;
  /** The repository top, where the stamp asks git about ranges. */
  top: string;
  /** The session's reviews directory. */
  reviewsDir: string;
  /** The session's starting commit, from the one read of its state. */
  startingCommit: string | undefined;
}

/** Commits HEAD holds after `from`. `unavailable` is never zero. */
function commitsAfter(from: string, env: StampEnv): number | 'unavailable' {
  const count = tryGit(env.git, ['rev-list', '--count', `${from}..HEAD`], env.cwd) ?? '';
  return /^\d+$/.test(count) ? Number(count) : 'unavailable';
}

/** The base the final gate demands at `head` (`resolveFinalReviewBase`), or undefined. */
function finalBaseAt(head: string, env: StampEnv): string | undefined {
  const { cwd, git, startingCommit } = env;
  const outcome = resolveFinalReviewBase({ cwd, head, startingCommit, git });
  return outcome.status === 'resolved' ? outcome.base : undefined;
}

/**
 * Whether a review's range at `head` lists no file: a phase from the base the gate would demand
 * at that head, the final review from the final base there. undefined: git could not say.
 */
function rangeEmpty(review: string, head: string, env: StampEnv): boolean | undefined {
  const { git, top, startingCommit } = env;
  const reviewDir = path.join(env.reviewsDir, review);
  let base: string | undefined;
  if (phaseOfReviewLabel(review) === undefined) base = finalBaseAt(head, env);
  else {
    const phase = phaseBaseAt(git, { reviewDir, head, startingCommit, top });
    base = phase.status === 'resolved' ? phase.base : undefined;
  }
  const files = base === undefined ? undefined : listDiffFiles(git, base, head, top);
  return files === undefined ? undefined : files.length === 0;
}

/** What the stamp asks git: counts, the final base at HEAD, empty-skip ranges. */
function stampGit(env: StampEnv): StampGit {
  const head = tryGit(env.git, ['rev-parse', 'HEAD'], env.cwd);
  return {
    commitsAfter: (from) => commitsAfter(from, env),
    finalBase: head ? finalBaseAt(head, env) : undefined,
    rangeEmpty: (review, at) => rangeEmpty(review, at, env),
  };
}

/** Why a receipt the gate did not read is not on the stamp, each status as its own row state. */
function unreadOf(unread: UnreadReceipt): Extract<ReviewDirRead, { unread: unknown }>['unread'] {
  switch (unread.status) {
    case 'missing':
      return { status: 'missing' };
    case 'unreadable':
      return { status: 'unreadable', reason: unread.reason };
    case 'outside-repo':
      return { status: 'outside-repo' };
    case 'outside':
      return { status: 'outside' };
    default: {
      const never: never = unread;
      return never;
    }
  }
}

/**
 * The round the gate would count for a review whose receipt it did not check: 1 + the `round-R/`
 * archives in its directory, only when there are any and the directory is the session's own.
 */
function roundOf(gated: { dir: string; read: boolean; unread?: UnreadReceipt }): {
  round?: number;
} {
  const outside = gated.unread?.status === 'outside' || gated.unread?.status === 'outside-repo';
  const archived = outside ? 0 : readArchivedRounds(gated.dir).length;
  return archived > 0 ? { round: archived + 1 } : {};
}

/**
 * One review directory, gated again at render time so the row never presents an ungated review
 * as clean. The `ancestor` head rule: a review of an earlier commit of this branch is not a
 * failure on the PR, and the working tree the stamp is rendered in is not checked (it is not the
 * tree the review read). The gate is handed the state the render already read.
 */
function readReviewDir(label: string, reviewDir: string, env: StampEnv): ReviewDirRead {
  const gated = gateReviewReceipt({
    cwd: env.cwd,
    git: env.git,
    receiptPath: reviewDir,
    headRule: 'ancestor',
    session: { startingCommit: env.startingCommit },
  });
  if (!gated.read) return { review: label, unread: unreadOf(gated.unread), ...roundOf(gated) };
  const result = gated.result;
  if (!result.checked) return { review: label, unread: { status: 'invalid' }, ...roundOf(gated) };
  return { review: label, result };
}

/**
 * `harness review-provenance render`: a session's stamp. autopilot-state.json is read once, and
 * that one reading gives the expected reviews, the decisions and the starting commit every row is
 * gated with.
 */
export function runReviewProvenanceRender(opts: {
  session: string;
  cwd?: string;
  git?: CwdGit;
}): Result<ReviewProvenanceReport, Error> {
  const cwd = opts.cwd ?? process.cwd();
  const git = opts.git ?? runGitIn;
  const resolved = sessionDirFrom(git, cwd, opts.session);
  if (!resolved.ok) return resolved;
  const sessionDir = resolved.value;
  if (!isDirectory(sessionDir)) return Err(new Error(`session not found: ${sessionDir}`));
  const stateText = readSessionStateText(sessionDir);
  const reviewsDir = path.join(sessionDir, REVIEWS_DIRNAME);
  const dirs = listDirectoryEntries(reviewsDir);
  const state = readSessionReviewState(stateText);
  const top = resolveRepoRoots(git, cwd)?.top ?? cwd;
  const env = { cwd, git, top, reviewsDir, startingCommit: state.startingCommit };
  const { rows, notes } = assembleStamp(
    state,
    dirs,
    (label) => readReviewDir(label, path.join(reviewsDir, label), env),
    stampGit(env)
  );
  const block = renderProvenanceBlock(rows, notes);
  return Ok({ session: opts.session, reviewsDir, rows, notes: notes.map(noteText), block });
}
