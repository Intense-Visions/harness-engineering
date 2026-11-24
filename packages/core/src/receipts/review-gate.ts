import {
  CONDITIONAL_REVIEWER_IDS,
  type ReviewBaseSource,
  type ReviewGateFailureCode,
  FULL_TIER_REVIEWER_IDS,
  LIGHT_TIER_REVIEWER_ID,
  type ReviewReceipt,
  type ReviewerRecord,
} from '@harness-engineering/types';
import type { ExpectedMoment } from './layout';
import { normalizeReviewPath, pathEscapes } from './paths';
import {
  parseReviewReceipt,
  parseReviewerFindingsFile,
  tallyReviewFindings,
  type ReviewFindingTally,
  type ReviewerFindingsFile,
} from './schema';

/** One failure of the review receipt gate. */
export interface ReviewGateFailure {
  code: ReviewGateFailureCode;
  /** The reviewer the failure is about, when it is about one. */
  reviewerId?: string;
  message: string;
}

export function reviewGateFailure(
  code: ReviewGateFailureCode,
  message: string,
  reviewerId?: string
): ReviewGateFailure {
  return reviewerId === undefined ? { code, message } : { code, reviewerId, message };
}

/** What the findings half of the gate reads: the recomputed diff and the findings files. */
export interface FindingsSource {
  /** `git diff --name-only -z <base>..<head>` (unquoted names). undefined: could not compute. */
  diffFiles: readonly string[] | undefined;
  /** Read a findings file named by the receipt (relative to its directory). undefined: absent. */
  readFindings: (findingsPath: string) => string | undefined;
}

/** Ids used more than once, each named once, in the order of their first repeat. One pass. */
export function repeatedIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) repeated.add(id);
    else seen.add(id);
  }
  return [...repeated];
}

export interface ReviewGateContext extends FindingsSource {
  /** `git rev-parse HEAD`, resolved by the caller. Empty when git could not resolve it. */
  head: string;
  /**
   * `git status --porcelain=v1 -z --untracked-files=no` printed nothing: the tracked files equal
   * HEAD. undefined: git could not say. Untracked files (the review directory itself) do not count.
   */
  worktreeClean: boolean | undefined;
  /** Which review this is expected to be (`expectedReviewMoment`). */
  expectedMoment: ExpectedMoment;
  /** `git merge-base --is-ancestor <base> <head>` succeeded. */
  baseIsAncestor: boolean;
  /**
   * `git merge-base <ref> <head>` for the branch the review merges into: the receipt's
   * `diff.target` when it names one, else the default branch. undefined: none resolved.
   */
  mergeBase: string | undefined;
  /** The ref `mergeBase` was taken against, for messages. Absent: the default branch. */
  mergeBaseWith?: string;
  /** The receipt's `diff.target` when it is no remote-tracking branch with a merge base with the head. */
  targetUnresolved?: string;
  /**
   * The session's starting commit, for a receipt in a session review directory whose
   * autopilot-state.json holds a full sha. Absent: unknown (no session, or no such field).
   */
  startingCommit?: string;
  /** The base a phase receipt must have (`phaseReviewBase`). Read for a `phase` receipt only. */
  phaseBase: PhaseReviewBase;
}

/**
 * The nearest earlier phase review of the session whose receipt the caller could use: one it could
 * read, holding a full `diff.head` that is an ancestor of the head under review.
 */
export type EarlierPhaseReceipt =
  | { status: 'none' }
  | { status: 'found'; phase: number; head: string };

/** The base a phase review must have, or why none can be named. */
export type PhaseReviewBase =
  | { status: 'resolved'; base: string; source: 'previous-phase'; phase: number }
  | { status: 'resolved'; base: string; source: 'starting-commit' }
  | {
      status: 'unresolved';
      reason: 'not-in-session' | 'starting-commit-unknown' | 'starting-commit-not-ancestor';
    };

/**
 * The one rule for a phase review's base (autopilot REVIEW step 1): the `diff.head` of the
 * nearest earlier phase review with a usable receipt, else the session's starting commit. An
 * earlier phase with no receipt, an unreadable one, or one whose head is not an ancestor of the
 * head under review (a rebase rewrote it) is passed over: passing over only widens the review. A
 * starting commit that is not an ancestor of the head names no base. Outside a session nothing
 * names a phase base.
 */
export function phaseReviewBase(input: {
  inSession: boolean;
  earlier: EarlierPhaseReceipt;
  startingCommit: string | undefined;
  /** `git merge-base --is-ancestor <startingCommit> <head>` succeeded. */
  startingCommitIsAncestor: boolean;
}): PhaseReviewBase {
  if (!input.inSession) return { status: 'unresolved', reason: 'not-in-session' };
  const { earlier } = input;
  if (earlier.status === 'found') {
    const { head: base, phase } = earlier;
    return { status: 'resolved', base, source: 'previous-phase', phase };
  }
  if (input.startingCommit === undefined) {
    return { status: 'unresolved', reason: 'starting-commit-unknown' };
  }
  if (!input.startingCommitIsAncestor) {
    return { status: 'unresolved', reason: 'starting-commit-not-ancestor' };
  }
  return { status: 'resolved', base: input.startingCommit, source: 'starting-commit' };
}

const PHASE_BASE_UNKNOWN_TEXT: Record<
  Extract<PhaseReviewBase, { status: 'unresolved' }>['reason'],
  string
> = {
  'not-in-session':
    'the receipt is not in a session review directory, so no earlier phase or starting commit names its base',
  'starting-commit-unknown':
    "no earlier phase has a usable receipt and the session's autopilot-state.json holds no full startingCommit",
  'starting-commit-not-ancestor':
    "no earlier phase has a usable receipt and the session's startingCommit is not an ancestor of " +
    'the head; after a rebase, record the new starting commit (the merge base with the branch ' +
    'this one merges into) in autopilot-state.json, and the next phase review covers everything since it',
};

/** A phase receipt's base against phaseReviewBase. Standalone and final have their own rules. */
function phaseBaseFailures(
  receipt: ReviewReceipt,
  phaseBase: PhaseReviewBase
): ReviewGateFailure[] {
  if (receipt.moment !== 'phase') return [];
  if (phaseBase.status === 'unresolved') {
    return [
      reviewGateFailure(
        'PHASE_BASE_UNKNOWN',
        `the base a phase review must have is unknown: ${PHASE_BASE_UNKNOWN_TEXT[phaseBase.reason]}`
      ),
    ];
  }
  if (phaseBase.base === receipt.diff.base) return [];
  const from =
    phaseBase.source === 'previous-phase'
      ? `the diff.head of the phase-${phaseBase.phase} receipt`
      : "the session's starting commit";
  return [
    reviewGateFailure(
      'PHASE_BASE_MISMATCH',
      `a phase review starts where the previous reviewed phase ended: diff.base must be ` +
        `${phaseBase.base} (${from}), but is ${receipt.diff.base}`
    ),
  ];
}

/** The base a final review must have, or why there is none to demand. */
export type FinalReviewBase =
  | { status: 'resolved'; base: string; baseSource: ReviewBaseSource }
  | { status: 'unresolved'; reason: 'starting-commit-unknown' };

/** The base a standalone review is advised to take, or why none resolves. */
export type StandaloneReviewBase =
  | { status: 'resolved'; base: string; baseSource: 'merge-base' }
  | { status: 'unresolved'; reason: 'no-default-branch' };

/**
 * A standalone review's base: the merge base with the branch it merges into when one resolves.
 * It is advice: the review takes its base from the range it reviews, and the gate checks only
 * that the base is an ancestor of the head. No session, so no starting-commit fallback.
 */
export function standaloneReviewBase(mergeBase: string | undefined): StandaloneReviewBase {
  return mergeBase === undefined
    ? { status: 'unresolved', reason: 'no-default-branch' }
    : { status: 'resolved', base: mergeBase, baseSource: 'merge-base' };
}

/**
 * The one rule for a final review's base (spec D12 and D27, ADR 0140): the merge base with the default
 * branch when one resolves; otherwise the session's starting commit; otherwise none can be
 * demanded. The gate applies it; `harness review-tier --moment final` prints it.
 */
export function finalReviewBase(
  mergeBase: string | undefined,
  startingCommit: string | undefined
): FinalReviewBase {
  if (mergeBase !== undefined)
    return { status: 'resolved', base: mergeBase, baseSource: 'merge-base' };
  if (startingCommit !== undefined) {
    return { status: 'resolved', base: startingCommit, baseSource: 'starting-commit' };
  }
  return { status: 'unresolved', reason: 'starting-commit-unknown' };
}

/** The receipt did not parse: nothing was checked, so there is nothing to count. */
export interface InvalidReceiptResult {
  checked: false;
  pass: false;
  failures: ReviewGateFailure[];
}

/** The receipt parsed and every rule was applied to it. */
export interface CheckedReceiptResult {
  checked: true;
  pass: boolean;
  failures: ReviewGateFailure[];
  /** Required reviewers marked ran whose findings file loaded. */
  reviewersRun: number;
  /** Reviewers the receipt marks required. */
  reviewersRequired: number;
  receipt: ReviewReceipt;
  /**
   * The count over the findings files that loaded (tallyReviewFindings). Kept with `loaded` and
   * `unreadable` for the provenance stamp (unit 3), which prints them per review.
   */
  tally: ReviewFindingTally;
  /** Reviewers marked ran whose findings file loaded, and those whose file did not. */
  loaded: string[];
  unreadable: string[];
}

export type ReviewGateResult = InvalidReceiptResult | CheckedReceiptResult;

function momentFailures(receipt: ReviewReceipt, expected: ExpectedMoment): ReviewGateFailure[] {
  switch (expected.status) {
    case 'unknown':
      return [
        reviewGateFailure(
          'MOMENT_UNKNOWN',
          'the receipt directory does not say which review this is (phase-N, final-all, or a ' +
            'directory directly under .harness/reviews, named for the branch sanitised to one ' +
            'path segment and the head sha); state it with --moment'
        ),
      ];
    case 'conflict':
      return [
        reviewGateFailure(
          'MOMENT_MISMATCH',
          `the receipt directory is the ${expected.directory} review, but --moment says ` +
            `${expected.stated}; the directory decides`
        ),
      ];
    case 'known':
      if (expected.moment === receipt.moment) return [];
      return [
        reviewGateFailure(
          'MOMENT_MISMATCH',
          `the receipt says moment ${receipt.moment}, but this is the ${expected.moment} review`
        ),
      ];
  }
}

function headFailures(receipt: ReviewReceipt, context: ReviewGateContext): ReviewGateFailure[] {
  const reviewed = receipt.diff.head;
  if (context.head !== '' && reviewed === context.head) {
    return [];
  }
  const now = context.head === '' ? 'could not be resolved' : `is ${context.head}`;
  return [
    reviewGateFailure(
      'HEAD_MISMATCH',
      `the receipt reviewed ${receipt.diff.head} but HEAD ${now}; the review is stale`
    ),
  ];
}

/**
 * A receipt is bound to one commit, but reviewers and the mechanical checks read the working tree:
 * a tree whose tracked files differ from HEAD was not what the receipt says was reviewed.
 */
function worktreeFailures(worktreeClean: boolean | undefined): ReviewGateFailure[] {
  if (worktreeClean === true) return [];
  const message =
    worktreeClean === false
      ? 'tracked files differ from HEAD, so the review read a tree that is not the reviewed ' +
        'commit; commit or discard the changes, then review again'
      : 'could not tell whether the tracked files equal HEAD (git status failed)';
  return [reviewGateFailure('WORKTREE_DIRTY', message)];
}

function baseFailures(receipt: ReviewReceipt, context: ReviewGateContext): ReviewGateFailure[] {
  const { base, head } = receipt.diff;
  const out: ReviewGateFailure[] = [];
  if (!context.baseIsAncestor) {
    out.push(
      reviewGateFailure('DIFF_BASE_NOT_ANCESTOR', `diff.base ${base} is not an ancestor of ${head}`)
    );
  }
  if (receipt.moment !== 'final') return out;
  const failure = finalBaseFailure(receipt, context);
  return failure === undefined ? out : [...out, failure];
}

/** A final receipt's base against finalReviewBase. A declared starting commit must be the session's. */
function finalBaseFailure(
  receipt: ReviewReceipt,
  context: ReviewGateContext
): ReviewGateFailure | undefined {
  const { base, baseSource } = receipt.diff;
  if (context.targetUnresolved !== undefined) {
    return reviewGateFailure(
      'TARGET_UNRESOLVED',
      `diff.target "${context.targetUnresolved}" is not a remote-tracking branch (a full ref ` +
        `under refs/remotes/) with a merge base with ${receipt.diff.head}, so the final base cannot be checked`
    );
  }
  const demanded = finalReviewBase(context.mergeBase, context.startingCommit);
  const starts = 'a final review starts at the merge base, but diff.base is';
  if (demanded.status === 'resolved' && demanded.base === base) {
    // The starting commit stands in for the merge base only when no default branch resolves.
    if (demanded.baseSource === 'merge-base' || baseSource === 'starting-commit') return undefined;
  }
  if (context.mergeBase !== undefined) {
    const declared =
      baseSource === 'starting-commit'
        ? ' (baseSource starting-commit is accepted only when the default branch cannot be resolved)'
        : '';
    return reviewGateFailure(
      'FINAL_BASE_NOT_MERGE_BASE',
      `${starts} ${base} and the merge base with ${context.mergeBaseWith ?? 'the default branch'} ` +
        `is ${context.mergeBase}${declared}`
    );
  }
  if (baseSource !== 'starting-commit') {
    return reviewGateFailure(
      'FINAL_BASE_NOT_MERGE_BASE',
      `${starts} ${base} and the default branch could not be resolved`
    );
  }
  if (demanded.status === 'unresolved') {
    return reviewGateFailure(
      'STARTING_COMMIT_UNKNOWN',
      `${starts} ${base}, the default branch could not be resolved, and the session's starting ` +
        'commit is unknown (the receipt is not in a session review directory, or its ' +
        'autopilot-state.json holds no full startingCommit), so baseSource starting-commit cannot be checked'
    );
  }
  return reviewGateFailure(
    'FINAL_BASE_NOT_MERGE_BASE',
    `${starts} ${base} and the default branch could not be resolved, so the base must be the ` +
      `session's starting commit ${demanded.base}`
  );
}

function tierFailures(receipt: ReviewReceipt, required: ReviewerRecord[]): ReviewGateFailure[] {
  const tier = receipt.tier;
  switch (tier) {
    case 'full':
      return FULL_TIER_REVIEWER_IDS.filter((id) => !required.some((r) => r.id === id)).map((id) =>
        reviewGateFailure(
          'CORE_REVIEWER_MISSING',
          `tier full requires reviewer "${id}" with required: true`,
          id
        )
      );
    case 'light': {
      if (required.length === 1 && required[0]?.id === LIGHT_TIER_REVIEWER_ID) return [];
      const listed = required.map((r) => r.id).join(', ') || 'none';
      return [
        reviewGateFailure(
          'LIGHT_TIER_ROSTER',
          `tier light requires exactly the reviewer "${LIGHT_TIER_REVIEWER_ID}"; the receipt requires: ${listed}`
        ),
      ];
    }
    default: {
      const unhandled: never = tier;
      return unhandled;
    }
  }
}

/** Every reviewer a receipt may name: the core four, the conditional reviewers, the light one. */
const KNOWN_REVIEWER_IDS: ReadonlySet<string> = new Set([
  ...FULL_TIER_REVIEWER_IDS,
  ...CONDITIONAL_REVIEWER_IDS,
  LIGHT_TIER_REVIEWER_ID,
]);

/** UNKNOWN_REVIEWER for an id outside KNOWN_REVIEWER_IDS: the one check the gate and the self-check share. */
function unknownReviewer(id: string): ReviewGateFailure | undefined {
  if (KNOWN_REVIEWER_IDS.has(id)) return undefined;
  const known = [...KNOWN_REVIEWER_IDS].join(', ');
  return reviewGateFailure(
    'UNKNOWN_REVIEWER',
    `reviewer "${id}" is not a known reviewer (${known})`,
    id
  );
}

function rosterFailures(receipt: ReviewReceipt): ReviewGateFailure[] {
  const required = receipt.reviewers.filter((r) => r.required);
  const out = tierFailures(receipt, required);
  const seen = new Set<string>();
  for (const r of receipt.reviewers) {
    const unknown = unknownReviewer(r.id);
    if (unknown !== undefined) out.push(unknown);
    if (seen.has(r.id)) {
      out.push(reviewGateFailure('DUPLICATE_REVIEWER', `reviewer "${r.id}" is listed twice`, r.id));
    }
    seen.add(r.id);
  }
  for (const r of required) {
    if (r.ran) continue;
    const why = r.skippedReason === undefined ? '' : ` (${r.skippedReason})`;
    out.push(
      reviewGateFailure(
        'REQUIRED_REVIEWER_NOT_RUN',
        `required reviewer "${r.id}" did not run${why}`,
        r.id
      )
    );
  }
  return out;
}

/**
 * A `light` receipt whose recorded computed tier is `full` ran below what the tier command
 * printed. That is allowed only for the one demotion a session states (`no-subagent-tool`).
 */
function demotionFailures(receipt: ReviewReceipt): ReviewGateFailure[] {
  if (receipt.tier !== 'light' || receipt.computedTier !== 'full') return [];
  if (receipt.demotion !== undefined) return [];
  const why = (receipt.tierReasons ?? []).join(', ') || 'no reasons recorded';
  return [
    reviewGateFailure(
      'TIER_DEMOTED',
      `the receipt is tier light, but the tier command computed full (${why}); a light review ` +
        'of a full phase is allowed only with demotion "no-subagent-tool"'
    ),
  ];
}

function finalFailures(receipt: ReviewReceipt): ReviewGateFailure[] {
  if (receipt.moment !== 'final') return [];
  const out: ReviewGateFailure[] = [];
  if (receipt.tier !== 'full') {
    out.push(
      reviewGateFailure('FINAL_NOT_FULL', `the final review must be tier full, not ${receipt.tier}`)
    );
  }
  if (!receipt.coldContext) {
    out.push(
      reviewGateFailure('FINAL_NOT_COLD', 'the final review must run with coldContext: true')
    );
  }
  if (receipt.priorFindingsSupplied) {
    out.push(
      reviewGateFailure(
        'FINAL_PRIOR_FINDINGS',
        'the final review must not supply prior findings to any reviewer'
      )
    );
  }
  return out;
}

type Loaded = { file: ReviewerFindingsFile } | { failure: ReviewGateFailure };

/** Read and parse the findings file a reviewer record names. */
function loadFindingsFile(
  r: ReviewerRecord,
  context: FindingsSource,
  usedPaths: Set<string>
): Loaded {
  const fail = (code: ReviewGateFailureCode, message: string): Loaded => ({
    failure: reviewGateFailure(code, message, r.id),
  });
  if (r.findingsPath === undefined) {
    return fail(
      'FINDINGS_FILE_MISSING',
      `reviewer "${r.id}" is marked ran but names no findings file`
    );
  }
  const named = `findings file "${r.findingsPath}" of reviewer "${r.id}"`;
  if (pathEscapes(r.findingsPath)) {
    return fail(
      'FINDINGS_PATH_INVALID',
      `${named} must be a relative path that stays inside the receipt directory`
    );
  }
  const key = normalizeReviewPath(r.findingsPath);
  if (usedPaths.has(key)) {
    return fail(
      'FINDINGS_FILE_SHARED',
      `${named} is already named by another reviewer; each reviewer writes its own`
    );
  }
  usedPaths.add(key);
  const text = context.readFindings(r.findingsPath);
  if (text === undefined) {
    return fail(
      'FINDINGS_FILE_MISSING',
      `${named} is not a regular file of at most 5 MB inside the receipt directory`
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail('FINDINGS_FILE_INVALID', `${named} is not JSON`);
  }
  const parsed = parseReviewerFindingsFile(json);
  return parsed.ok
    ? { file: parsed.value }
    : fail('FINDINGS_FILE_INVALID', `${named}: ${parsed.error.message}`);
}

/** What a findings file that parsed says against the receipt and the recomputed diff. */
function contentFailures(
  r: ReviewerRecord,
  file: ReviewerFindingsFile,
  head: string,
  diffSet: ReadonlySet<string> | undefined
): ReviewGateFailure[] {
  const out: ReviewGateFailure[] = [];
  if (file.reviewerId !== r.id) {
    out.push(
      reviewGateFailure(
        'FINDINGS_REVIEWER_MISMATCH',
        `findings file "${r.findingsPath}" was written by "${file.reviewerId}", not "${r.id}"`,
        r.id
      )
    );
  }
  if (file.head !== head) {
    out.push(
      reviewGateFailure(
        'FINDINGS_HEAD_MISMATCH',
        `reviewer "${r.id}" reviewed ${file.head}, but the receipt is for ${head}; the file is from another round`,
        r.id
      )
    );
  }
  if (file.examinedFiles.length === 0) {
    out.push(
      reviewGateFailure('EXAMINED_FILES_EMPTY', `reviewer "${r.id}" lists no examined files`, r.id)
    );
  }
  const outside = file.examinedFiles
    .map(normalizeReviewPath)
    .filter((f) => diffSet !== undefined && !diffSet.has(f));
  if (outside.length > 0) {
    const more = outside.length > 5 ? ` (+${outside.length - 5} more)` : '';
    out.push(
      reviewGateFailure(
        'EXAMINED_OUTSIDE_DIFF',
        `reviewer "${r.id}" lists files that are not in the diff: ${outside.slice(0, 5).join(', ')}${more}`,
        r.id
      )
    );
  }
  return out;
}

function diffFailures(receipt: ReviewReceipt, diffSet: ReadonlySet<string> | undefined) {
  const range = `${receipt.diff.base}..${receipt.diff.head}`;
  if (diffSet === undefined) {
    return [reviewGateFailure('DIFF_UNRESOLVED', `could not recompute the file set of ${range}`)];
  }
  if (diffSet.size > 0) return [];
  return [reviewGateFailure('EMPTY_DIFF', `${range} changes no files; nothing was reviewed`)];
}

export interface FindingsCheck {
  failures: ReviewGateFailure[];
  /** Findings files that loaded, by reviewer id, in receipt order. */
  files: Map<string, ReviewerFindingsFile>;
  unreadable: string[];
  diffSet: ReadonlySet<string> | undefined;
}

/**
 * The findings half of the review receipt gate: each reviewer's findings file, read through the
 * caller's reader, parsed, and compared with the receipt and the recomputed diff.
 */
export function checkFindings(receipt: ReviewReceipt, context: FindingsSource): FindingsCheck {
  const diffSet =
    context.diffFiles === undefined
      ? undefined
      : new Set(context.diffFiles.map(normalizeReviewPath));
  const failures = diffFailures(receipt, diffSet);
  const usedPaths = new Set<string>();
  const files = new Map<string, ReviewerFindingsFile>();
  const unreadable: string[] = [];
  for (const r of receipt.reviewers.filter((x) => x.ran)) {
    const loaded = loadFindingsFile(r, context, usedPaths);
    if ('failure' in loaded) {
      failures.push(loaded.failure);
      unreadable.push(r.id);
      continue;
    }
    files.set(r.id, loaded.file);
    failures.push(...contentFailures(r, loaded.file, receipt.diff.head, diffSet));
  }
  // Counts are compared only when every file loaded: a file that did not is already a failure,
  // and a count over part of the review would name the wrong number.
  if (unreadable.length === 0) failures.push(...countFailures(receipt, [...files.values()]));
  return { failures, files, unreadable, diffSet };
}

/** The receipt's `blocking` and `advisory` are claims; the findings files are the evidence. */
function countFailures(
  receipt: ReviewReceipt,
  loaded: readonly ReviewerFindingsFile[]
): ReviewGateFailure[] {
  const repeated = repeatedIds(loaded.flatMap((file) => file.findings.map((f) => f.id)));
  if (repeated.length > 0) {
    return [
      reviewGateFailure(
        'DUPLICATE_FINDING_ID',
        `finding ids must be unique across a review; used more than once: ${repeated.join(', ')}`
      ),
    ];
  }
  const tally = tallyReviewFindings(loaded);
  const blocking = tally.blocking.length;
  if (blocking === receipt.blocking && tally.advisory === receipt.advisory) return [];
  return [
    reviewGateFailure(
      'COUNTS_MISMATCH',
      `the receipt claims ${receipt.blocking} blocking and ${receipt.advisory} advisory, but its ` +
        `findings files hold ${blocking} blocking and ${tally.advisory} advisory ` +
        '(one per finding: critical and important are blocking, suggestion is advisory)'
    ),
  ];
}

/** What a single findings file is checked against: nothing, or a range (`--base`, `--head`). */
export type FindingsFileRange =
  | { ranged: false }
  | {
      ranged: true;
      /** The resolved head the file must name. */
      head: string;
      /** `git diff --name-only -z <base>..<head>`; undefined: git could not say. */
      diffFiles: readonly string[] | undefined;
      /** Whether the tracked files equal HEAD; undefined: git could not say. */
      worktreeClean: boolean | undefined;
    };

/**
 * One reviewer findings file checked on its own, with the gate's parser and rules (a reviewer's
 * self-check before it reports). Without a range: shape, a known reviewer id, examined files and
 * unique ids. With one
 * (`diffFiles` present): also the head and that every examined file is in the diff.
 */
export function checkReviewerFindingsText(
  text: string | undefined,
  name: string,
  range: FindingsFileRange
): ReviewGateFailure[] {
  const invalid = (why: string) => [reviewGateFailure('FINDINGS_FILE_INVALID', `${name} ${why}`)];
  if (text === undefined) {
    return [
      reviewGateFailure('FINDINGS_FILE_MISSING', `${name} is not a regular file of at most 5 MB`),
    ];
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return invalid('is not JSON');
  }
  const parsed = parseReviewerFindingsFile(json);
  if (!parsed.ok) return invalid(`is not a findings file: ${parsed.error.message}`);
  const file = parsed.value;
  const diffSet =
    range.ranged && range.diffFiles !== undefined
      ? new Set(range.diffFiles.map(normalizeReviewPath))
      : undefined;
  const out: ReviewGateFailure[] = [];
  const unknown = unknownReviewer(file.reviewerId);
  if (unknown !== undefined) out.push(unknown);
  if (range.ranged && diffSet === undefined) {
    out.push(reviewGateFailure('DIFF_UNRESOLVED', 'could not compute the file set of the range'));
  } else if (diffSet?.size === 0) {
    out.push(reviewGateFailure('EMPTY_DIFF', 'the range changes no files'));
  }
  if (range.ranged) out.push(...worktreeFailures(range.worktreeClean));
  const self = { id: file.reviewerId, required: true, ran: true, findingsPath: name };
  out.push(...contentFailures(self, file, range.ranged ? range.head : file.head, diffSet));
  const repeated = repeatedIds(file.findings.map((f) => f.id));
  if (repeated.length > 0) {
    out.push(
      reviewGateFailure(
        'DUPLICATE_FINDING_ID',
        `finding ids in "${name}" must be unique; used more than once: ${repeated.join(', ')}`
      )
    );
  }
  return out;
}

/**
 * The review receipt gate (spec D3, D4). The receipt is a set of claims. The caller recomputes
 * what it can (current HEAD, the working tree, the diff's file set, the base's ancestry, the
 * phase and final bases, each reviewer's findings file) and passes it in as `context`; this
 * function compares, and recounts `blocking` and `advisory` from the findings files it loaded. It
 * is pure and reads no environment, so it passes or fails identically with no model credential.
 *
 * What it cannot prove: that reviewers ran in separate contexts. One context that deliberately
 * writes four files passes.
 */
export function validateReviewReceipt(
  receipt: unknown,
  context: ReviewGateContext
): ReviewGateResult {
  const parsed = parseReviewReceipt(receipt);
  if (!parsed.ok) {
    const failures = [reviewGateFailure('RECEIPT_INVALID', parsed.error.message)];
    return { checked: false, pass: false, failures };
  }
  const r = parsed.value;
  const check = checkFindings(r, context);
  const failures = [
    ...momentFailures(r, context.expectedMoment),
    ...headFailures(r, context),
    ...worktreeFailures(context.worktreeClean),
    ...baseFailures(r, context),
    ...phaseBaseFailures(r, context.phaseBase),
    ...rosterFailures(r),
    ...demotionFailures(r),
    ...finalFailures(r),
    ...check.failures,
  ];
  const required = r.reviewers.filter((x) => x.required);
  return {
    checked: true,
    pass: failures.length === 0,
    failures,
    reviewersRun: required.filter((x) => x.ran && check.files.has(x.id)).length,
    reviewersRequired: required.length,
    receipt: r,
    tally: tallyReviewFindings([...check.files.values()]),
    loaded: [...check.files.keys()],
    unreadable: check.unreadable,
  };
}
