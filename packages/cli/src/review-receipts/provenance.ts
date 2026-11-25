import * as path from 'node:path';
import {
  Err,
  Ok,
  REVIEWS_DIRNAME,
  assembleStamp,
  noteText,
  readSessionReviewState,
  renderProvenanceBlock,
  type Result,
  type ReviewDirRead,
  type StampRow,
} from '@harness-engineering/core';
import { gateReviewReceipt, type CwdGit, type UnreadReceipt } from './gate';
import {
  isDirectory,
  listDirectoryEntries,
  readSessionStateText,
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
  /** The session's starting commit, from the one read of its state. */
  startingCommit: string | undefined;
}

/** Commits HEAD holds after `from`. `unavailable` is never zero. */
function commitsAfter(from: string, env: StampEnv): number | 'unavailable' {
  const count = tryGit(env.git, ['rev-list', '--count', `${from}..HEAD`], env.cwd) ?? '';
  return /^\d+$/.test(count) ? Number(count) : 'unavailable';
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
  if (!gated.read) return { review: label, unread: unreadOf(gated.unread) };
  const result = gated.result;
  if (!result.checked) return { review: label, unread: { status: 'invalid' } };
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
  const env = { cwd, git, startingCommit: state.startingCommit };
  const { rows, notes } = assembleStamp(
    state,
    dirs,
    (label) => readReviewDir(label, path.join(reviewsDir, label), env),
    (from) => commitsAfter(from, env)
  );
  const block = renderProvenanceBlock(rows, notes);
  return Ok({ session: opts.session, reviewsDir, rows, notes: notes.map(noteText), block });
}
