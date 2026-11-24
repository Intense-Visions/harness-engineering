import * as path from 'node:path';
import {
  checkReviewerFindingsText,
  escapeTerminalText,
  readRegularFile,
  reviewFindingsReaderFor,
  reviewGateFailure,
  readReviewReceiptFile,
  expectedReviewMoment,
  phaseReviewBase,
  sessionDirOfReviewDir,
  validateReviewReceipt,
  type FindingsFileRange,
  type ReviewGateContext,
  type ReviewGateFailure,
  type ReviewGateResult,
} from '@harness-engineering/core';
import { REVIEW_MOMENTS, type ReviewMoment, type ReviewReceipt } from '@harness-engineering/types';
import {
  earlierPhaseReceipt,
  fields,
  isAncestor,
  isSha,
  listDiffFiles,
  resolveCommit,
  resolveRepoRoots,
  reviewMergeBase,
  runGitIn,
  sessionStartingCommit,
  tryGit,
  worktreeClean,
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
  /** A final receipt: the ref whose merge base its base was checked against (absent: none resolved). */
  finalBaseFrom?: string;
}

type Range = { base: string; head: string; final: boolean; target: unknown };

/** The receipt's claimed range, only when both ends are full shas (never pass free text to git). */
function claimedRange(raw: unknown): Range | undefined {
  const { base, head, target } = fields(fields(raw).diff);
  if (!isSha(base) || !isSha(head)) return undefined;
  return { base, head, final: fields(raw).moment === 'final', target };
}

/**
 * The merge base a final receipt is checked against: its `diff.target`, which must be the full
 * name of a remote-tracking branch, else the default branch.
 */
function finalMergeBase(
  git: CwdGit,
  range: Range,
  cwd: string
): Pick<ReviewGateContext, 'mergeBase' | 'mergeBaseWith' | 'targetUnresolved'> {
  if (!range.final) return { mergeBase: undefined };
  const target = typeof range.target === 'string' ? range.target : undefined;
  const lookup = reviewMergeBase(git, range.head, cwd, target);
  if (lookup.status === 'resolved' && (target === undefined || lookup.with === target))
    return { mergeBase: lookup.mergeBase, mergeBaseWith: lookup.with };
  if (lookup.status === 'none') return { mergeBase: undefined };
  return { mergeBase: undefined, targetUnresolved: String(target) };
}

/** HEAD, resolved by git; empty when it cannot be resolved. */
function currentHead(git: CwdGit, cwd: string): Pick<ReviewGateContext, 'head'> {
  return { head: tryGit(git, ['rev-parse', 'HEAD'], cwd) ?? '' };
}

type Recomputed = Omit<
  ReviewGateContext,
  'readFindings' | 'expectedMoment' | 'startingCommit' | 'phaseBase'
>;

/**
 * What git says about the claimed range. Git is not asked without a range. It runs at the
 * repository top, so the diff is listed repository-relative whatever the caller's directory and
 * diff config (`diff.relative`), which is how reviewers are told to list it.
 */
function recompute(git: CwdGit, range: Range | undefined, cwd: string): Recomputed {
  if (range === undefined) {
    return {
      head: '',
      diffFiles: undefined,
      baseIsAncestor: false,
      mergeBase: undefined,
      worktreeClean: undefined,
    };
  }
  const { base, head } = range;
  return {
    ...currentHead(git, cwd),
    diffFiles: listDiffFiles(git, base, head, cwd),
    baseIsAncestor: tryGit(git, ['merge-base', '--is-ancestor', base, head], cwd) !== undefined,
    ...finalMergeBase(git, range, cwd),
    worktreeClean: worktreeClean(git, cwd),
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
  const sessionDir = sessionDirOfReviewDir(read.dir);
  const startingCommit = sessionStartingCommit(sessionDir);
  const range = claimedRange(read.raw);
  // Git is asked only about a claimed range (never about free text), at the repository top.
  const top = range === undefined ? cwd : (resolveRepoRoots(git, cwd)?.top ?? cwd);
  const reachable = (sha: string) =>
    range !== undefined && isAncestor(git, sha, range.head, top) === true;
  const phaseBase = phaseReviewBase({
    inSession: sessionDir !== undefined,
    earlier:
      sessionDir === undefined ? { status: 'none' } : earlierPhaseReceipt(read.dir, reachable),
    startingCommit,
    startingCommitIsAncestor: startingCommit !== undefined && reachable(startingCommit),
  });
  const recomputed = recompute(git, range, top);
  const result = validateReviewReceipt(read.raw, {
    ...recomputed,
    ...(startingCommit !== undefined && { startingCommit }),
    phaseBase,
    readFindings: reviewFindingsReaderFor(read.dir),
    expectedMoment: expectedReviewMoment(read.dir, opts.moment),
  });
  const { pass, failures } = result;
  const at = { pass, receiptPath: read.path, failures };
  if (!result.checked) return { read: true, result, report: { ...at, ...counts }, dir: read.dir };
  const { reviewersRun, reviewersRequired, receipt } = result;
  const { moment, tier, backend } = receipt;
  const from = moment === 'final' ? recomputed.mergeBaseWith : undefined;
  const report = {
    ...{ ...at, reviewersRun, reviewersRequired, moment, tier, backend },
    ...(from !== undefined && { finalBaseFrom: from }),
  };
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
 * `--head`, against that range (`git diff -z`), that head and a working tree whose tracked files
 * equal HEAD. Works from any directory of a
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
  const commit = (ref: string) => resolveCommit(git, ref, top);
  let range: FindingsFileRange = { ranged: false };
  if (opts.base !== undefined && opts.head !== undefined) {
    const base = commit(opts.base);
    const head = commit(opts.head);
    const diffFiles = base && head ? listDiffFiles(git, base, head, top) : undefined;
    range = {
      ranged: true,
      head: head ?? opts.head,
      diffFiles,
      worktreeClean: worktreeClean(git, top),
    };
  }
  const failures = checkReviewerFindingsText(text, opts.findingsPath, range);
  return { pass: failures.length === 0, findingsPath: file, failures };
}
