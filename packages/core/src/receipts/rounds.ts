/**
 * Fix rounds: the `round-R/` archives of a review directory, and the archive a fix round starts
 * with (docs/changes/shift-left-pipeline-fidelity/proposal.md, "Fix rounds").
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { isReviewDirectory } from './layout';
import { errnoReason, readReviewReceiptFile } from './load';
import { parseReviewReceipt } from './schema';

/** An archive of an earlier round of a review: `round-R/` with R a positive integer. */
const ROUND_DIR = /^round-([1-9][0-9]{0,8})$/;

/** The rounds archived in a review directory, in numeric order. None when it does not exist. */
export function listArchivedRounds(reviewDir: string): number[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(reviewDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => ROUND_DIR.exec(e.name)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
}

/** The head a review directory's own receipt.json records, or why it records none. */
function receiptHead(dir: string): { head: string } | { missing: boolean } {
  const read = readReviewReceiptFile(dir);
  const parsed = read.status === 'ok' ? parseReviewReceipt(read.raw) : undefined;
  if (parsed?.ok) return { head: parsed.value.diff.head };
  return { missing: read.status === 'missing' };
}

/** Each archived round's head and blocking count, read from its own receipt, or `unreadable`. */
export function readArchivedRounds(reviewDir: string) {
  // The return type is the contract's ArchivedRound[], written out so that this file's imports
  // stay within the coupling budget; the gate's context, typed with ArchivedRound, checks it.
  return listArchivedRounds(reviewDir).map((round) => {
    const read = readReviewReceiptFile(path.join(reviewDir, `round-${round}`));
    const parsed = read.status === 'ok' ? parseReviewReceipt(read.raw) : undefined;
    if (!parsed?.ok) return { round, unreadable: true as const };
    return { round, head: parsed.value.diff.head, blocking: parsed.value.blocking };
  });
}

/** The one file operation an archive makes; injectable so a test can fail it part-way. */
export interface ArchiveRoundIo {
  rename(from: string, to: string): void;
}

const nodeArchiveIo: ArchiveRoundIo = { rename: (from, to) => fs.renameSync(from, to) };

export type ArchiveRoundResult =
  | { ok: true; archived: number; next: number }
  | { ok: false; error: string };

/** Why the round in `reviewDir` cannot be archived, or the round it would become. */
function archivePrecondition(
  reviewDir: string,
  head: string | undefined
): { error: string } | { archived: number } {
  if (!isReviewDirectory(reviewDir)) {
    return {
      error:
        `${reviewDir} is not a review directory (phase-N or final-all under ` +
        '.harness/sessions/<slug>/reviews/, or a directory directly under .harness/reviews/)',
    };
  }
  if (!fs.lstatSync(reviewDir, { throwIfNoEntry: false })?.isDirectory()) {
    return { error: `${reviewDir} is not a directory` };
  }
  const ended = receiptHead(reviewDir);
  if ('missing' in ended) {
    return ended.missing
      ? {
          error: `no receipt.json in ${reviewDir}: a round that wrote no receipt is not a round, so there is nothing to archive`,
        }
      : {
          error: `receipt.json in ${reviewDir} is not a readable review receipt; rewrite it before archiving`,
        };
  }
  if (head === undefined) return { error: 'HEAD could not be resolved; nothing was archived' };
  if (head === ended.head) {
    return {
      error:
        `HEAD is still ${head}, the head the ended round reviewed: a fix round needs a fix commit. ` +
        'A review run again at the same head stays in its round and overwrites its files',
    };
  }
  const rounds = listArchivedRounds(reviewDir);
  if (rounds.some((r, i) => r !== i + 1)) {
    return {
      error: `the archives in ${reviewDir} are not numbered round-1..round-${rounds.length} (found ${rounds.map((r) => `round-${r}`).join(', ')}); nothing was archived`,
    };
  }
  return { archived: rounds.length + 1 };
}

/** Move each name from one directory to another; on a failure, move back what moved and rethrow. */
function moveAll(io: ArchiveRoundIo, names: readonly string[], from: string, to: string): void {
  const moved: string[] = [];
  try {
    for (const name of names) {
      io.rename(path.join(from, name), path.join(to, name));
      moved.push(name);
    }
  } catch (err) {
    for (const name of moved.reverse()) io.rename(path.join(to, name), path.join(from, name));
    throw err;
  }
}

/**
 * Archive the ended round of a review before a fix round re-runs it. The round that ended is the
 * one its `receipt.json` records: with no receipt there is no round to archive, and with HEAD
 * still at the head it reviewed there was no fix commit, so both are refused. Every regular file
 * directly in the directory moves into `round-<R>/`, R = 1 + the archives (which must be numbered
 * round-1..round-(R-1)), through a staging directory renamed in one step: on any failure the
 * moved files go back, so the round is archived whole or not at all. The next review is R + 1.
 */
export function archiveReviewRound(
  reviewDir: string,
  opts: { head: string | undefined; io?: ArchiveRoundIo }
): ArchiveRoundResult {
  const pre = archivePrecondition(reviewDir, opts.head);
  if ('error' in pre) return { ok: false, error: pre.error };
  const { archived } = pre;
  const io = opts.io ?? nodeArchiveIo;
  const staging = path.join(reviewDir, `.round-${archived}.partial`);
  const files = fs
    .readdirSync(reviewDir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name);
  try {
    fs.mkdirSync(staging);
  } catch (err) {
    const code = errnoReason(err);
    const left = code === 'EEXIST' ? '; an interrupted archive left it, move its files back' : '';
    const why = `${path.basename(staging)} cannot be created (${code})${left}`;
    return { ok: false, error: `${why}; nothing was archived` };
  }
  try {
    moveAll(io, files, reviewDir, staging);
    io.rename(staging, path.join(reviewDir, `round-${archived}`));
  } catch (err) {
    return { ok: false, error: rollBack(io, staging, reviewDir, errnoReason(err)) };
  }
  return { ok: true, archived, next: archived + 1 };
}

/** Undo a failed archive: the staged files go back and the staging directory goes. */
function rollBack(io: ArchiveRoundIo, staging: string, reviewDir: string, why: string): string {
  try {
    moveAll(io, fs.readdirSync(staging), staging, reviewDir);
    fs.rmdirSync(staging);
    return `the archive failed (${why}); nothing was archived`;
  } catch (err) {
    return (
      `the archive failed (${why}) and could not be undone (${errnoReason(err)}): move the ` +
      `files in ${staging} back into ${reviewDir} and remove it`
    );
  }
}
