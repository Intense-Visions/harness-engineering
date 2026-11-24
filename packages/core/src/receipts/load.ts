import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ERRNO_REASON,
  type ReceiptReadProblem,
  type ReceiptUnreadReason,
} from '@harness-engineering/types';
import { REVIEW_RECEIPT_FILENAME } from './layout';
import { pathEscapes } from './paths';

/** No receipt or findings file is read past this size. */
export const REVIEW_FILE_MAX_BYTES = 5 * 1024 * 1024;

export type ReviewReceiptFileRead =
  | { status: 'ok'; path: string; dir: string; raw: unknown }
  | { status: 'missing'; path: string; dir: string }
  /** `reason`: an errno code (ERRNO_REASON) or a RECEIPT_UNREAD_REASONS entry. Never a path. */
  | { status: 'unreadable'; path: string; dir: string; reason: ReceiptReadProblem }
  /** The path leads out of the project it was confined to (`within`). Nothing was read. */
  | { status: 'outside'; path: string; dir: string };

/**
 * A review directory resolves to its receipt.json; a file path is used as given. A path that
 * does not exist and does not end in `.json` is read as a review directory, so a missing review
 * is the same review whether it was named by its directory or by its receipt.json.
 */
export function resolveReceiptPath(p: string): string {
  try {
    return fs.statSync(p).isDirectory() ? path.join(p, REVIEW_RECEIPT_FILENAME) : p;
  } catch {
    // Absent: the reader reports it.
    return /\.json$/i.test(p) ? p : path.join(p, REVIEW_RECEIPT_FILENAME);
  }
}

/** The real path of `p`, resolving through its deepest existing ancestor when `p` is absent. */
function realPath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    const parent = path.dirname(p);
    return parent === p ? p : path.join(realPath(parent), path.basename(p));
  }
}

/** Whether `target`, with every symlink resolved, is strictly inside `root`. */
function isInside(root: string, target: string): boolean {
  const rel = path.relative(realPath(root), realPath(target)).replaceAll('\\', '/');
  return rel !== '' && !pathEscapes(rel);
}

export type BoundedRead = { text: string } | { problem: ReceiptReadProblem; absent: boolean };

const ERRNO = new RegExp(`^${ERRNO_REASON}$`);
const notAFile: ReceiptUnreadReason = 'not a regular file';
const tooLarge: ReceiptUnreadReason = 'too large';
const notJson: ReceiptUnreadReason = 'not valid JSON';

/**
 * The errno code of a failed read, as the reader writes it: the code when it matches ERRNO_REASON,
 * `UNKNOWN` otherwise. Only the code: the message holds the absolute path, and the reason can
 * reach a PR body.
 */
export function errnoReason(err: unknown): ReceiptReadProblem {
  const code =
    err !== null && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  return typeof code === 'string' && ERRNO.test(code) ? (code as Uppercase<string>) : 'UNKNOWN';
}

/**
 * Read a regular file of at most `maxBytes`. Anything else (a FIFO, a device, a directory) is
 * refused before it is opened, so a pipe with no writer cannot block the gate.
 */
export function readRegularFile(file: string, maxBytes = REVIEW_FILE_MAX_BYTES): BoundedRead {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return { problem: notAFile, absent: false };
    if (stat.size > maxBytes) return { problem: tooLarge, absent: false };
    return { text: fs.readFileSync(file, 'utf-8') };
  } catch (err) {
    const problem = errnoReason(err);
    return { problem, absent: problem === 'ENOENT' || problem === 'ENOTDIR' };
  }
}

/**
 * Read and JSON-parse a receipt. A missing receipt is its own status: the gate fails on it. With
 * `within`, a path that leads out of that directory, lexically or through a symlink, is not read.
 */
export function readReviewReceiptFile(
  p: string,
  opts: { within?: string; maxBytes?: number } = {}
): ReviewReceiptFileRead {
  const file = resolveReceiptPath(p);
  const at = { path: file, dir: path.dirname(file) };
  if (opts.within !== undefined && !isInside(opts.within, file))
    return { status: 'outside', ...at };
  const read = readRegularFile(file, opts.maxBytes ?? REVIEW_FILE_MAX_BYTES);
  if ('problem' in read) {
    return read.absent
      ? { status: 'missing', ...at }
      : { status: 'unreadable', ...at, reason: read.problem };
  }
  try {
    return { status: 'ok', ...at, raw: JSON.parse(read.text) };
  } catch {
    return { status: 'unreadable', ...at, reason: notJson };
  }
}

/**
 * A reader for the findings files a receipt names. Paths are resolved to real paths first, so a
 * name or a symlink that leads out of `receiptDir` reads as absent, as does anything that is not
 * a regular file of at most `maxBytes`.
 */
export function reviewFindingsReaderFor(
  receiptDir: string,
  maxBytes = REVIEW_FILE_MAX_BYTES
): (findingsPath: string) => string | undefined {
  return (findingsPath) => {
    const full = path.resolve(receiptDir, findingsPath);
    if (!isInside(receiptDir, full)) return undefined;
    const read = readRegularFile(full, maxBytes);
    return 'text' in read ? read.text : undefined;
  };
}
