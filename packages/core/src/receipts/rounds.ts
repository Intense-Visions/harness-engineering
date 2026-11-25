/**
 * Fix rounds: the `round-R/` archives of a review directory, and the archive a fix round starts
 * with (docs/changes/shift-left-pipeline-fidelity/proposal.md, "Fix rounds").
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArchivedRound } from '@harness-engineering/types';
import { isReviewDirectory } from './layout';
import { errnoReason, readReviewReceiptFile, reviewFindingsReaderFor } from './load';
import {
  parseReviewReceipt,
  parseReviewerFindingsFile,
  tallyReviewFindings,
  type ReviewerFindingsFile,
} from './schema';

/** An archive of an earlier round of a review: `round-R/` with R a positive integer. */
const ROUND_DIR = /^round-([1-9][0-9]{0,8})$/;
/** The staging directory of an archive: one left behind means the archive was interrupted. */
const STAGING = /^\.round-.*\.partial$/;
const RECEIPT = 'receipt.json';

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

/** The `.round-*.partial` staging directories an interrupted archive left in a review directory. */
export function listInterruptedArchives(reviewDir: string): string[] {
  try {
    return fs
      .readdirSync(reviewDir)
      .filter((name) => STAGING.test(name))
      .sort();
  } catch {
    return [];
  }
}

/** The head a review directory's own receipt.json records, or why it records none. */
function receiptHead(dir: string): { head: string } | { missing: boolean } {
  const read = readReviewReceiptFile(dir);
  const parsed = read.status === 'ok' ? parseReviewReceipt(read.raw) : undefined;
  if (parsed?.ok) return { head: parsed.value.diff.head };
  return { missing: read.status === 'missing' };
}

/**
 * The blocking findings an archived round's findings files hold, counted as the gate counts them
 * for a current receipt; undefined when a file its receipt names cannot be read or parsed.
 */
function archivedBlocking(
  dir: string,
  reviewers: readonly { ran: boolean; findingsPath?: string | undefined }[]
): number | undefined {
  const read = reviewFindingsReaderFor(dir);
  const files: ReviewerFindingsFile[] = [];
  for (const r of reviewers.filter((x) => x.ran)) {
    const text = r.findingsPath === undefined ? undefined : read(r.findingsPath);
    if (text === undefined) return undefined;
    let parsed: ReturnType<typeof parseReviewerFindingsFile>;
    try {
      parsed = parseReviewerFindingsFile(JSON.parse(text));
    } catch {
      return undefined;
    }
    if (!parsed.ok) return undefined;
    files.push(parsed.value);
  }
  return tallyReviewFindings(files).blocking.length;
}

/**
 * Each archived round's head, from its own receipt, and its blocking count, recounted from its
 * own findings files (the archived receipt's `blocking` is a claim); or `unreadable`.
 */
export function readArchivedRounds(reviewDir: string): ArchivedRound[] {
  return listArchivedRounds(reviewDir).map((round): ArchivedRound => {
    const dir = path.join(reviewDir, `round-${round}`);
    const read = readReviewReceiptFile(dir);
    const parsed = read.status === 'ok' ? parseReviewReceipt(read.raw) : undefined;
    if (!parsed?.ok) return { round, unreadable: true };
    const blocking = archivedBlocking(dir, parsed.value.reviewers);
    if (blocking === undefined) return { round, unreadable: true };
    return { round, head: parsed.value.diff.head, blocking };
  });
}

/** The one file operation an archive makes; injectable so a test can fail it part-way. */
export interface ArchiveRoundIo {
  rename(from: string, to: string): void;
}

const nodeArchiveIo: ArchiveRoundIo = { rename: (from, to) => fs.renameSync(from, to) };

export type ArchiveRoundResult =
  | {
      ok: true;
      archived: number;
      next: number;
      /**
       * An archive an earlier run left interrupted: `completed`, it held the whole round and was
       * finished (nothing else was archived); `undone`, its files were moved back first.
       */
      interrupted?: 'completed' | 'undone';
    }
  | { ok: false; error: string };

const notAReviewDir = (dir: string) =>
  `${dir} is not a review directory (phase-N or final-all under ` +
  '.harness/sessions/<slug>/reviews/, or a directory directly under .harness/reviews/)';

/** Where the review directory is, and the round an archive of it makes now. */
function archiveTarget(reviewDir: string): { error: string } | { archived: number } {
  if (!isReviewDirectory(reviewDir)) return { error: notAReviewDir(reviewDir) };
  if (!fs.lstatSync(reviewDir, { throwIfNoEntry: false })?.isDirectory()) {
    return { error: `${reviewDir} is not a directory` };
  }
  const rounds = listArchivedRounds(reviewDir);
  if (rounds.some((r, i) => r !== i + 1)) {
    return {
      error: `the archives in ${reviewDir} are not numbered round-1..round-${rounds.length} (found ${rounds.map((r) => `round-${r}`).join(', ')}); nothing was archived`,
    };
  }
  return { archived: rounds.length + 1 };
}

/** Why the round in `reviewDir` cannot be archived now; undefined when it can. */
function archivePrecondition(reviewDir: string, head: string | undefined): string | undefined {
  const ended = receiptHead(reviewDir);
  if ('missing' in ended) {
    return ended.missing
      ? `no receipt.json in ${reviewDir}: a round that wrote no receipt is not a round, so there is nothing to archive`
      : `receipt.json in ${reviewDir} is not a readable review receipt; rewrite it before archiving`;
  }
  if (!fs.lstatSync(path.join(reviewDir, RECEIPT)).isFile()) {
    return `receipt.json in ${reviewDir} is not a regular file; nothing was archived`;
  }
  if (head === undefined) return 'HEAD could not be resolved; nothing was archived';
  if (head === ended.head) {
    return (
      `HEAD is still ${head}, the head the ended round reviewed: a fix round needs a fix commit. ` +
      'A review run again at the same head stays in its round and overwrites its files'
    );
  }
  return undefined;
}

/** Move each name from one directory to another, stopping at the first failure. */
function moveAll(io: ArchiveRoundIo, names: readonly string[], from: string, to: string): void {
  for (const name of names) io.rename(path.join(from, name), path.join(to, name));
}

/**
 * Finish or undo the archive an earlier run left in `.round-<archived>.partial`. Its files move
 * last-receipt, so a staging directory holding `receipt.json` (with none in the review directory)
 * holds the whole round: it is renamed to `round-<archived>/`. Otherwise its files go back, unless
 * a name is in both places.
 */
function resumeInterrupted(
  io: ArchiveRoundIo,
  reviewDir: string,
  archived: number
): { error: string } | { resumed: 'completed' | 'undone' } {
  const found = listInterruptedArchives(reviewDir);
  const name = `.round-${archived}.partial`;
  if (found.length !== 1 || found[0] !== name) {
    return {
      error:
        `${found.join(', ')} in ${reviewDir} is not the staging directory of the next archive ` +
        `(${name}); move its files back into the review directory by hand and remove it`,
    };
  }
  const staging = path.join(reviewDir, name);
  let staged: string[];
  try {
    staged = fs.readdirSync(staging);
  } catch (err) {
    return { error: `${name} cannot be read (${errnoReason(err)}); nothing was moved` };
  }
  const receiptHere = fs.lstatSync(path.join(reviewDir, RECEIPT), { throwIfNoEntry: false });
  try {
    if (staged.includes(RECEIPT) && receiptHere === undefined) {
      io.rename(staging, path.join(reviewDir, `round-${archived}`));
      return { resumed: 'completed' };
    }
    const clash = staged.filter((f) => fs.existsSync(path.join(reviewDir, f)));
    if (clash.length > 0) {
      return {
        error:
          `${name} holds ${clash.join(', ')}, which the review directory also holds; nothing was ` +
          'moved: keep the copy of the round it belongs to, then remove the other by hand',
      };
    }
    moveAll(io, staged, staging, reviewDir);
    fs.rmdirSync(staging);
    return { resumed: 'undone' };
  } catch (err) {
    return {
      error:
        `finishing or undoing the interrupted archive in ${name} failed (${errnoReason(err)}); ` +
        'run --archive-round again to resume it',
    };
  }
}

/**
 * Archive the ended round of a review before a fix round re-runs it. The round that ended is the
 * one its `receipt.json` records: with no receipt (or one that is not a regular file) there is no
 * round to archive, and with HEAD still at the head it reviewed there was no fix commit, so these
 * are refused. Every regular file directly in the directory moves into `round-<R>/`, R = 1 + the
 * archives (which must be numbered round-1..round-(R-1)), through a staging directory
 * `.round-<R>.partial` renamed in one step, `receipt.json` last. On an error the moved files go
 * back, so the round is archived whole or not at all. An interruption (the process dies) leaves
 * the staging directory: the gate fails while it exists, and the next run finishes the archive
 * (when the staging directory holds the receipt) or undoes it and then archives. The next review
 * is R + 1.
 */
export function archiveReviewRound(
  reviewDir: string,
  opts: { head: string | undefined; io?: ArchiveRoundIo }
): ArchiveRoundResult {
  const target = archiveTarget(reviewDir);
  if ('error' in target) return { ok: false, error: target.error };
  const { archived } = target;
  const io = opts.io ?? nodeArchiveIo;
  let interrupted: 'completed' | 'undone' | undefined;
  if (listInterruptedArchives(reviewDir).length > 0) {
    const resumed = resumeInterrupted(io, reviewDir, archived);
    if ('error' in resumed) return { ok: false, error: resumed.error };
    if (resumed.resumed === 'completed') {
      return { ok: true, archived, next: archived + 1, interrupted: 'completed' };
    }
    interrupted = 'undone';
  }
  const undone =
    interrupted === undefined ? '' : `undid an interrupted archive of round ${archived}; then `;
  const refused = archivePrecondition(reviewDir, opts.head);
  if (refused !== undefined) return { ok: false, error: undone + refused };
  const moved = moveRound(io, reviewDir, archived);
  if (moved !== undefined) return { ok: false, error: undone + moved };
  return {
    ok: true,
    archived,
    next: archived + 1,
    ...(interrupted !== undefined && { interrupted }),
  };
}

/** Move the round's files into its archive through the staging directory; why not, or undefined. */
function moveRound(io: ArchiveRoundIo, reviewDir: string, archived: number): string | undefined {
  const staging = path.join(reviewDir, `.round-${archived}.partial`);
  const files = fs
    .readdirSync(reviewDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name !== RECEIPT)
    .map((e) => e.name)
    .concat(RECEIPT);
  try {
    fs.mkdirSync(staging);
  } catch (err) {
    return `${path.basename(staging)} cannot be created (${errnoReason(err)}); nothing was archived`;
  }
  try {
    moveAll(io, files, reviewDir, staging);
    io.rename(staging, path.join(reviewDir, `round-${archived}`));
  } catch (err) {
    return rollBack(io, staging, reviewDir, errnoReason(err));
  }
  return undefined;
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
