import * as path from 'node:path';
import {
  Err,
  Ok,
  REVIEWS_DIRNAME,
  assembleStamp,
  noteText,
  phaseOfReviewLabel,
  readSessionReviewState,
  renderProvenanceBlock,
  type Result,
  type ReviewDirRead,
  type StampRow,
} from '@harness-engineering/core';
import { gateReviewReceipt, type CwdGit } from './gate';
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
   * One entry per review, in stamp order: a reviewed row, `{ review, unread }` for a directory
   * whose receipt could not be read, with the decisions recorded for it (status `absent`: an
   * expected review with no directory, the MISSING row).
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

/** Commits HEAD holds after the head the final review read. `unavailable` is never zero. */
function commitsAfter(head: string, env: StampEnv): number | 'unavailable' {
  const count = tryGit(env.git, ['rev-list', '--count', `${head}..HEAD`], env.cwd) ?? '';
  return /^\d+$/.test(count) ? Number(count) : 'unavailable';
}

/**
 * One review directory, gated again at render time so the row never presents an ungated review
 * as clean. The `ancestor` head rule: a phase receipt reviewed an earlier commit of this branch,
 * and that is not a failure on the PR. The gate is handed the state the render already read.
 */
function readReviewDir(label: string, reviewDir: string, env: StampEnv): ReviewDirRead {
  const gated = gateReviewReceipt({
    cwd: env.cwd,
    git: env.git,
    receiptPath: reviewDir,
    headRule: 'ancestor',
    session: { startingCommit: env.startingCommit },
  });
  if (!gated.read) {
    const { unread } = gated;
    if (unread.status === 'unreadable') return { review: label, unread };
    return { review: label, unread: { status: 'missing' } };
  }
  const result = gated.result;
  if (!result.checked) return { review: label, unread: { status: 'invalid' } };
  // Labels reach here already checked by assembleStamp: one that is no phase is final-all.
  if (phaseOfReviewLabel(label) !== undefined) return { review: label, result };
  return { review: label, result, unreviewedCommits: commitsAfter(result.receipt.diff.head, env) };
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
  const { rows, notes } = assembleStamp(state, dirs, (label) =>
    readReviewDir(label, path.join(reviewsDir, label), env)
  );
  const block = renderProvenanceBlock(rows, notes);
  return Ok({ session: opts.session, reviewsDir, rows, notes: notes.map(noteText), block });
}
