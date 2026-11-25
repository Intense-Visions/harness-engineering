import * as path from 'node:path';
import {
  archiveReviewRound,
  checkReviewerFindingsText,
  readRegularFile,
  reviewFindingsReaderFor,
  reviewGateFailure,
  readReviewReceiptFile,
  expectedReviewMoment,
  phaseReviewBase,
  readArchivedRounds,
  sessionDirOfReviewDir,
  validateReviewReceipt,
  type ArchiveRoundResult,
  type FindingsFileRange,
  type PhaseReviewBase,
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

export { REVIEW_MOMENTS };
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
  /** A final receipt whose `diff.target` gives no base: the target, as the receipt names it. */
  finalTargetRefused?: string;
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
): Pick<ReviewGateContext, 'mergeBase' | 'mergeBaseWith' | 'targetUnresolved' | 'targetOwnBranch'> {
  if (!range.final) return { mergeBase: undefined };
  const target = typeof range.target === 'string' ? range.target : undefined;
  const lookup = reviewMergeBase(git, range.head, cwd, target);
  if (lookup.status === 'resolved' && (target === undefined || lookup.with === target))
    return { mergeBase: lookup.mergeBase, mergeBaseWith: lookup.with };
  if (lookup.status === 'none') return { mergeBase: undefined };
  if (lookup.status === 'target-own-branch')
    return { mergeBase: undefined, targetOwnBranch: lookup.ref };
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
      baseIsAncestor: undefined,
      mergeBase: undefined,
      worktreeClean: undefined,
    };
  }
  const { base, head } = range;
  return {
    ...currentHead(git, cwd),
    diffFiles: listDiffFiles(git, base, head, cwd),
    baseIsAncestor: isAncestor(git, base, head, cwd),
    ...finalMergeBase(git, range, cwd),
    worktreeClean: worktreeClean(git, cwd),
  };
}

/**
 * A receipt that was not gated: missing, unreadable (with the reason), outside the project, or in
 * another git repository than the caller's (`outside-repo`, with both repository tops).
 */
export type UnreadReceipt =
  | Exclude<ReturnType<typeof readReviewReceiptFile>, { status: 'ok' }>
  | { status: 'outside-repo'; path: string; dir: string; callerTop?: string; receiptTop?: string };

/** The gate's report, the receipt's directory, and what the gate read or why it could not. */
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
    case 'outside-repo':
      return reviewGateFailure(
        'RECEIPT_OUTSIDE_REPO',
        `the receipt is in the repository at ${unread.receiptTop ?? '(none)'}, but the gate runs ` +
          `in ${unread.callerTop ?? '(no repository)'}; run it from the worktree that holds the receipt`
      );
  }
}

/**
 * The repository the gate runs git in: the top of the worktree that holds the receipt, which must
 * be the caller's. A receipt in another worktree, or under a repository planted in the review
 * directory, would otherwise be checked against that repository's HEAD, tree and history.
 * `top` undefined: neither is in a repository.
 */
function receiptRepository(
  git: CwdGit,
  cwd: string,
  at: { path: string; dir: string }
): { top: string | undefined } | UnreadReceipt {
  const callerTop = resolveRepoRoots(git, cwd)?.top;
  const receiptTop = resolveRepoRoots(git, at.dir)?.top;
  if (callerTop === receiptTop) return { top: receiptTop };
  const tops = {
    ...(callerTop !== undefined && { callerTop }),
    ...(receiptTop !== undefined && { receiptTop }),
  };
  return { status: 'outside-repo', path: at.path, dir: at.dir, ...tops };
}

/** A gate result for a receipt it did not check. */
function notGated(unread: UnreadReceipt): GatedReviewReceipt {
  const failures = [failureFor(unread)];
  const report = { pass: false, receiptPath: unread.path, failures, reviewersRun: 0 };
  return { read: false, unread, report: { ...report, reviewersRequired: 0 }, dir: unread.dir };
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
  if (read.status !== 'ok') return notGated(read);
  const repo = receiptRepository(git, cwd, read);
  if ('status' in repo) return notGated(repo);
  const sessionDir = sessionDirOfReviewDir(read.dir);
  const startingCommit = sessionStartingCommit(sessionDir);
  const range = claimedRange(read.raw);
  const top = repo.top ?? cwd;
  const phaseBase = phaseBaseOf(git, { dir: read.dir, sessionDir, startingCommit, range, top });
  const recomputed = recompute(git, range, top);
  const result = validateReviewReceipt(read.raw, {
    ...recomputed,
    ...(startingCommit !== undefined && { startingCommit }),
    phaseBase,
    archivedRounds: readArchivedRounds(read.dir),
    readFindings: reviewFindingsReaderFor(read.dir),
    expectedMoment: expectedReviewMoment(read.dir, opts.moment),
  });
  const report = reportOf(result, read.path, recomputed);
  return { read: true, result, report, dir: read.dir };
}

/** The report of a receipt that was read: what the gate found, and what the receipt says it is. */
function reportOf(
  result: ReviewGateResult,
  receiptPath: string,
  final: Pick<Recomputed, 'mergeBaseWith' | 'targetOwnBranch' | 'targetUnresolved'>
): CheckReviewReceiptReport {
  const { pass, failures } = result;
  const at = { pass, receiptPath, failures };
  if (!result.checked) return { ...at, reviewersRun: 0, reviewersRequired: 0 };
  const { reviewersRun, reviewersRequired, receipt } = result;
  const { moment, tier, backend } = receipt;
  const isFinal = moment === 'final';
  const from = isFinal ? final.mergeBaseWith : undefined;
  const refused = isFinal ? (final.targetOwnBranch ?? final.targetUnresolved) : undefined;
  return {
    ...{ ...at, reviewersRun, reviewersRequired, moment, tier, backend },
    ...(from !== undefined && { finalBaseFrom: from }),
    ...(refused !== undefined && { finalTargetRefused: refused }),
  };
}

/**
 * A phase receipt's base (core `phaseReviewBase`): an earlier receipt's head or the starting
 * commit, each usable only as an ancestor of the claimed head. Git is asked only about a claimed
 * range, never about free text.
 */
function phaseBaseOf(
  git: CwdGit,
  at: {
    dir: string;
    sessionDir?: string | undefined;
    startingCommit?: string | undefined;
    range?: Range | undefined;
    top: string;
  }
): PhaseReviewBase {
  const { range, startingCommit, sessionDir } = at;
  const reachable = (sha: string) =>
    range !== undefined && isAncestor(git, sha, range.head, at.top) === true;
  return phaseReviewBase({
    inSession: sessionDir !== undefined,
    earlier: sessionDir === undefined ? { status: 'none' } : earlierPhaseReceipt(at.dir, reachable),
    startingCommit,
    startingCommitIsAncestor: startingCommit !== undefined && reachable(startingCommit),
  });
}

/**
 * `--archive-round`: archive a review's ended round before a fix round re-runs it (core
 * `archiveReviewRound`). HEAD is read in the review directory's repository; the fix round needs
 * a fix commit, so a HEAD still at the ended round's head is refused there.
 */
export function runArchiveReviewRound(opts: {
  reviewDir: string;
  cwd?: string;
  git?: CwdGit;
}): ArchiveRoundResult {
  const { cwd = process.cwd(), git = runGitIn } = opts;
  const dir = path.resolve(cwd, opts.reviewDir);
  const head = tryGit(git, ['rev-parse', 'HEAD'], dir);
  return archiveReviewRound(dir, { head: isSha(head) ? head : undefined });
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
    const unresolved = base === undefined ? ['--base', opts.base] : ['--head', opts.head];
    if (base === undefined || head === undefined) {
      const why = `${unresolved[0]} "${unresolved[1]}" does not resolve to a commit`;
      return {
        pass: false,
        findingsPath: file,
        failures: [reviewGateFailure('DIFF_UNRESOLVED', why)],
      };
    }
    range = {
      ranged: true,
      base,
      head,
      worktreeHead: tryGit(git, ['rev-parse', 'HEAD'], top),
      diffFiles: listDiffFiles(git, base, head, top),
      worktreeClean: worktreeClean(git, top),
    };
  }
  const failures = checkReviewerFindingsText(text, opts.findingsPath, range);
  return { pass: failures.length === 0, findingsPath: file, failures };
}
