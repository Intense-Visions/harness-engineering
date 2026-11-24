import * as path from 'node:path';
import {
  FULL_SHA_PATTERN,
  checkReviewerFindingsText,
  escapeTerminalText,
  readRegularFile,
  reviewFindingsReaderFor,
  reviewGateFailure,
  readReviewReceiptFile,
  expectedReviewMoment,
  sessionDirOfReviewDir,
  validateReviewReceipt,
  type ReviewGateContext,
  type ReviewGateFailure,
  type ReviewGateResult,
} from '@harness-engineering/core';
import { REVIEW_MOMENTS, type ReviewMoment, type ReviewReceipt } from '@harness-engineering/types';
import {
  defaultBranchMergeBase,
  listDiffFiles,
  resolveRepoRoots,
  runGitIn,
  sessionStartingCommit,
  tryGit,
  type CwdGit,
} from './io';

export { REVIEW_MOMENTS, escapeTerminalText };
export type { CwdGit, ReviewGateFailure, ReviewMoment };

export interface CheckReviewReceiptOptions {
  /** Path to receipt.json or to the review directory holding it. */
  receiptPath: string;
  cwd?: string;
  git?: CwdGit;
  /**
   * Which review the caller says this is. It counts only where the receipt's directory states
   * nothing (`final-all`, `phase-N` and a directory directly under `.harness/reviews` each state one);
   * a caller that contradicts the directory fails the gate.
   */
  moment?: ReviewMoment;
  /** Refuse a receipt path that leaves `cwd` (the MCP tool, whose arguments are unvalidated). */
  confine?: boolean;
}

export interface CheckReviewReceiptReport {
  pass: boolean;
  receiptPath: string;
  failures: ReviewGateFailure[];
  /** Required reviewers marked ran whose findings file loaded. */
  reviewersRun: number;
  reviewersRequired: number;
  moment?: ReviewReceipt['moment'];
  tier?: ReviewReceipt['tier'];
  backend?: ReviewReceipt['backend'];
}

type Range = { base: string; head: string; final: boolean };

const isSha = (v: unknown): v is string => typeof v === 'string' && FULL_SHA_PATTERN.test(v);
/** The own fields of an unparsed JSON value; none when it is not an object. */
const fields = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' ? { ...v } : {};

/** The receipt's claimed range, only when both ends are full shas (never pass free text to git). */
function claimedRange(raw: unknown): Range | undefined {
  const { base, head } = fields(fields(raw).diff);
  if (!isSha(base) || !isSha(head)) return undefined;
  return { base, head, final: fields(raw).moment === 'final' };
}

/** HEAD, resolved by git; empty when it cannot be resolved. */
function currentHead(git: CwdGit, cwd: string): Pick<ReviewGateContext, 'head'> {
  return { head: tryGit(git, ['rev-parse', 'HEAD'], cwd) ?? '' };
}

type Recomputed = Omit<ReviewGateContext, 'readFindings' | 'expectedMoment' | 'startingCommit'>;

/**
 * What git says about the claimed range. Git is not asked without a range. It runs at the
 * repository top, so the diff is listed repository-relative whatever the caller's directory and
 * diff config (`diff.relative`), which is how reviewers are told to list it.
 */
function recompute(git: CwdGit, raw: unknown, from: string): Recomputed {
  const range = claimedRange(raw);
  if (range === undefined) {
    return { head: '', diffFiles: undefined, baseIsAncestor: false, mergeBase: undefined };
  }
  const cwd = resolveRepoRoots(git, from)?.top ?? from;
  const { base, head } = range;
  return {
    ...currentHead(git, cwd),
    diffFiles: listDiffFiles(git, base, head, cwd),
    baseIsAncestor: tryGit(git, ['merge-base', '--is-ancestor', base, head], cwd) !== undefined,
    mergeBase: range.final ? defaultBranchMergeBase(git, head, cwd) : undefined,
  };
}

/** A receipt file that was not read: missing, unreadable (with the reason) or outside the project. */
export type UnreadReceipt = Exclude<ReturnType<typeof readReviewReceiptFile>, { status: 'ok' }>;

/** The gate's report, plus what it loaded, for callers that go on to read the review. */
export type GatedReviewReceipt = {
  report: CheckReviewReceiptReport;
  /** The receipt's directory, which its findings paths are relative to. */
  dir: string;
} & ({ read: false; unread: UnreadReceipt } | { read: true; result: ReviewGateResult });

function failureFor(unread: UnreadReceipt): ReviewGateFailure {
  switch (unread.status) {
    case 'outside':
      return reviewGateFailure('GATE_ERROR', 'the receipt path must be inside the project');
    case 'missing':
      return reviewGateFailure('RECEIPT_MISSING', `no review receipt at ${unread.path}`);
    case 'unreadable':
      return reviewGateFailure(
        'RECEIPT_INVALID',
        `review receipt at ${unread.path} is unreadable: ${unread.reason}`
      );
  }
}

/**
 * The review receipt gate. It recomputes HEAD, the diff's file set and the base's ancestry with
 * git, derives the expected moment from the receipt's directory, and reads each reviewer's
 * findings file itself; the receipt's fields are claims. No model, no network.
 */
export function gateReviewReceipt(opts: CheckReviewReceiptOptions): GatedReviewReceipt {
  const { cwd = process.cwd(), git = runGitIn } = opts;
  const target = path.resolve(cwd, opts.receiptPath);
  const read = readReviewReceiptFile(target, opts.confine ? { within: cwd } : {});
  const counts = { reviewersRun: 0, reviewersRequired: 0 };
  if (read.status !== 'ok') {
    const failures = [failureFor(read)];
    const report = { pass: false, receiptPath: read.path, failures, ...counts };
    return { read: false, unread: read, report, dir: read.dir };
  }
  const startingCommit = sessionStartingCommit(sessionDirOfReviewDir(read.dir));
  const result = validateReviewReceipt(read.raw, {
    ...recompute(git, read.raw, cwd),
    ...(startingCommit !== undefined && { startingCommit }),
    readFindings: reviewFindingsReaderFor(read.dir),
    expectedMoment: expectedReviewMoment(read.dir, opts.moment),
  });
  const { pass, failures } = result;
  const at = { pass, receiptPath: read.path, failures };
  if (!result.checked) return { read: true, result, report: { ...at, ...counts }, dir: read.dir };
  const { reviewersRun, reviewersRequired, receipt } = result;
  const { moment, tier, backend } = receipt;
  const report = { ...at, reviewersRun, reviewersRequired, moment, tier, backend };
  return { read: true, result, report, dir: read.dir };
}

export function runCheckReviewReceipt(opts: CheckReviewReceiptOptions): CheckReviewReceiptReport {
  return gateReviewReceipt(opts).report;
}

export interface CheckFindingsFileReport {
  pass: boolean;
  findingsPath: string;
  failures: ReviewGateFailure[];
}

/**
 * A reviewer's self-check: one findings file with the gate's parser and, given `--base` and
 * `--head`, against that range (`git diff -z`) and that head. Works from any directory of a
 * repository, and with a released CLI, because it needs nothing but this command.
 */
export function runCheckFindingsFile(opts: {
  findingsPath: string;
  base?: string;
  head?: string;
  cwd?: string;
  git?: CwdGit;
}): CheckFindingsFileReport {
  const { cwd = process.cwd(), git = runGitIn } = opts;
  const file = path.resolve(cwd, opts.findingsPath);
  const read = readRegularFile(file);
  const text = 'text' in read ? read.text : undefined;
  const top = resolveRepoRoots(git, cwd)?.top ?? cwd;
  const commit = (ref: string) =>
    tryGit(git, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`], top) ||
    undefined;
  let range = {};
  if (opts.base !== undefined && opts.head !== undefined) {
    const base = commit(opts.base);
    const head = commit(opts.head);
    const diffFiles = base && head ? listDiffFiles(git, base, head, top) : undefined;
    range = { head: head ?? opts.head, diffFiles };
  }
  const failures = checkReviewerFindingsText(text, opts.findingsPath, range);
  return { pass: failures.length === 0, findingsPath: file, failures };
}
