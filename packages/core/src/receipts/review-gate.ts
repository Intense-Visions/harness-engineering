import {
  type ArchivedRound,
  CONDITIONAL_REVIEWER_IDS,
  type ReviewBaseSource,
  type ReviewGateFailureCode,
  FULL_TIER_REVIEWER_IDS,
  LIGHT_TIER_REVIEWER_ID,
  type ReviewReceipt,
  type ReviewerRecord,
} from '@harness-engineering/types';
import type { ExpectedMoment } from './layout';
import { normalizeReviewPath, pathEscapes } from '../shared/review-paths';
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
  /** `git merge-base --is-ancestor <base> <head>`: true, false, or undefined (git could not say). */
  baseIsAncestor: boolean | undefined;
  /**
   * `git merge-base <ref> <head>` for the branch the review merges into: the receipt's
   * `diff.target` when it names one, else the default branch. undefined: none resolved.
   */
  mergeBase: string | undefined;
  /** The ref `mergeBase` was taken against, for messages. Absent: the default branch. */
  mergeBaseWith?: string;
  /** The receipt's `diff.target` when it is no remote-tracking branch with a merge base with the head. */
  targetUnresolved?: string;
  /** The receipt's `diff.target` when it is the branch under review (`refs/remotes/<remote>/<its name>`). */
  targetOwnBranch?: string;
  /**
   * The session's starting commit, for a receipt in a session review directory whose
   * autopilot-state.json holds a full sha. Absent: unknown (no session, or no such field).
   */
  startingCommit?: string;
  /** The base a phase receipt must have (`phaseReviewBase`). Read for a `phase` receipt only. */
  phaseBase: PhaseReviewBase;
  /**
   * The rounds archived beside the receipt (`round-R/`), each with what its own receipt says.
   * Absent: not read, and the round fields are not checked.
   */
  archivedRounds?: readonly ArchivedRound[];
  /**
   * The `.round-*.partial` staging directories beside the receipt: an archive that was
   * interrupted. Absent or empty: none.
   */
  interruptedArchives?: readonly string[];
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
  /** The count over the findings files that loaded (tallyReviewFindings). */
  tally: ReviewFindingTally;
  /**
   * Reviewers marked ran whose findings file loaded, and those whose file did not: absent,
   * unreadable, or read and rejected (invalid, shared, a path outside the receipt directory).
   */
  loaded: string[];
  notLoaded: string[];
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
  if (context.baseIsAncestor === false) {
    out.push(
      reviewGateFailure('DIFF_BASE_NOT_ANCESTOR', `diff.base ${base} is not an ancestor of ${head}`)
    );
  } else if (context.baseIsAncestor === undefined) {
    const why = `could not tell whether diff.base ${base} is an ancestor of ${head} (git failed)`;
    out.push(reviewGateFailure('DIFF_UNRESOLVED', why));
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
  if (context.targetOwnBranch !== undefined) {
    return reviewGateFailure(
      'TARGET_OWN_BRANCH',
      `diff.target "${context.targetOwnBranch}" is the branch under review (a configured ` +
        "remote's branch of the same name): its merge base is its own last pushed commit; " +
        'name the branch this one merges into'
    );
  }
  const demanded = finalReviewBase(context.mergeBase, context.startingCommit);
  const starts = 'a final review starts at the merge base, but diff.base is';
  if (demanded.status === 'resolved' && demanded.base === base) {
    // The starting commit stands in for the merge base only when no default branch resolves, and
    // the label says which: starting-commit is refused while a merge base resolves.
    const declaresStart = baseSource === 'starting-commit';
    if (declaresStart === (demanded.baseSource === 'starting-commit')) return undefined;
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

/**
 * The receipt's round against the `round-R/` archives beside it: the archives are numbered
 * round-1..round-n, the round is n + 1, priorRounds lists exactly the archives, and a fix round is
 * at another head than the round before it.
 */
function roundFailures(receipt: ReviewReceipt, context: ReviewGateContext): ReviewGateFailure[] {
  const archives = context.archivedRounds;
  const interrupted = interruptedArchiveFailure(context.interruptedArchives ?? []);
  if (archives === undefined) return interrupted === undefined ? [] : [interrupted];
  return [
    interrupted,
    roundNumberFailure(receipt.round ?? 1, archives),
    priorRoundsFailure(receipt, archives),
    sameHeadFailure(receipt, archives),
  ].filter((f): f is ReviewGateFailure => f !== undefined);
}

/**
 * An archive interrupted before it finished leaves its staging directory: the ended round is in
 * neither the review directory nor a `round-R/` archive, so no round number can be trusted until
 * `--archive-round` finishes or undoes it.
 */
export function interruptedArchiveFailure(
  staging: readonly string[]
): ReviewGateFailure | undefined {
  if (staging.length === 0) return undefined;
  return reviewGateFailure(
    'ROUND_ARCHIVE_INTERRUPTED',
    `an archive of a round was interrupted and left ${staging.join(', ')} in the review ` +
      'directory; run `harness check-review-receipt --archive-round <review-dir>` to finish ' +
      'or undo it, then gate again'
  );
}

function roundNumberFailure(
  round: number,
  archives: readonly ArchivedRound[]
): ReviewGateFailure | undefined {
  const n = archives.length;
  if (archives.some((a, i) => a.round !== i + 1)) {
    const found = archives.map((a) => `round-${a.round}`).join(', ');
    return reviewGateFailure(
      'ROUND_MISMATCH',
      `the round archives beside the receipt must be numbered round-1..round-${n}, but are: ${found}`
    );
  }
  if (round === n + 1) return undefined;
  return reviewGateFailure(
    'ROUND_MISMATCH',
    `the receipt is round ${round}, but ${n} earlier round(s) are archived beside it, so it is round ${n + 1}`
  );
}

const roundText = (p: { round: number; head: string; blocking: number }) =>
  `round ${p.round} at ${p.head}: ${p.blocking} blocking`;
const archivedText = (a: ArchivedRound) =>
  'unreadable' in a ? `round ${a.round}: no readable receipt and findings files` : roundText(a);

/**
 * priorRounds against the archives: the same rounds, the heads their archived receipts name and
 * the blocking counts their archived findings files hold, in any order.
 */
function priorRoundsFailure(
  receipt: ReviewReceipt,
  archives: readonly ArchivedRound[]
): ReviewGateFailure | undefined {
  const want = archives.map(archivedText);
  const got = (receipt.priorRounds ?? []).map(roundText);
  const same = [...want].sort().join('\n') === [...got].sort().join('\n');
  if (same && archives.every((a) => !('unreadable' in a))) return undefined;
  return reviewGateFailure(
    'PRIOR_ROUNDS_MISMATCH',
    'priorRounds must list each archived round with the head its archived receipt names and the ' +
      `blocking count its archived findings files hold; archived: ${want.join('; ') || 'none'}; listed: ${got.join('; ') || 'none'}`
  );
}

/** A fix round re-reviews a fix: a round at the head the round before it reviewed is a re-roll. */
function sameHeadFailure(
  receipt: ReviewReceipt,
  archives: readonly ArchivedRound[]
): ReviewGateFailure | undefined {
  const previous = archives.at(-1);
  if ((receipt.round ?? 1) < 2 || previous === undefined || 'unreadable' in previous)
    return undefined;
  if (previous.head !== receipt.diff.head) return undefined;
  return reviewGateFailure(
    'ROUND_SAME_HEAD',
    `the receipt is round ${receipt.round ?? 1} at ${receipt.diff.head}, the head round ` +
      `${previous.round} already reviewed: a fix round needs a fix commit; a review run again ` +
      'at the same head stays in its round'
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
      // Exactly one reviewer, required: a light receipt lists nothing else, required or not.
      const all = receipt.reviewers;
      if (all.length === 1 && required[0]?.id === LIGHT_TIER_REVIEWER_ID) return [];
      const listed = all.map((r) => `${r.id}${r.required ? '' : ' (not required)'}`).join(', ');
      return [
        reviewGateFailure(
          'LIGHT_TIER_ROSTER',
          `tier light lists exactly the reviewer "${LIGHT_TIER_REVIEWER_ID}", required; the receipt lists: ${listed}`
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
 * A `light` receipt below a computed `full` ran below what the tier command printed: one whose
 * recorded computed tier is `full`, and every standalone one (a standalone review is always
 * computed full, whatever the receipt records; its moment comes from the directory when that
 * states one). That is allowed only for the one demotion a session states (`no-subagent-tool`).
 * A final review is held to `full` by FINAL_NOT_FULL instead.
 */
function demotionFailures(receipt: ReviewReceipt, expected: ExpectedMoment): ReviewGateFailure[] {
  if (receipt.tier !== 'light' || receipt.demotion !== undefined) return [];
  const moment = expected.status === 'known' ? expected.moment : receipt.moment;
  if (moment === 'standalone') {
    return [
      reviewGateFailure(
        'TIER_DEMOTED',
        'the receipt is tier light, but a standalone review is always computed full; a light ' +
          'standalone review is allowed only with demotion "no-subagent-tool"'
      ),
    ];
  }
  if (receipt.computedTier !== 'full') return [];
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
  range: { base: string | undefined; head: string },
  diffSet: ReadonlySet<string> | undefined
): ReviewGateFailure[] {
  const { head } = range;
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
  if (range.base !== undefined && file.base !== range.base) {
    out.push(
      reviewGateFailure(
        'FINDINGS_BASE_MISMATCH',
        `reviewer "${r.id}" reviewed from ${file.base}, but the review's base is ${range.base}; ` +
          'the file covers another range',
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
  /** Reviewers marked ran whose findings file did not load (absent, unreadable or rejected). */
  notLoaded: string[];
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
  const notLoaded: string[] = [];
  for (const r of receipt.reviewers.filter((x) => x.ran)) {
    const loaded = loadFindingsFile(r, context, usedPaths);
    if ('failure' in loaded) {
      failures.push(loaded.failure);
      notLoaded.push(r.id);
      continue;
    }
    files.set(r.id, loaded.file);
    failures.push(...contentFailures(r, loaded.file, receipt.diff, diffSet));
  }
  // Counts are compared only when every file loaded: a file that did not is already a failure,
  // and a count over part of the review would name the wrong number.
  if (notLoaded.length === 0) failures.push(...countFailures(receipt, [...files.values()]));
  return { failures, files, notLoaded, diffSet };
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
      /** The resolved base the file must name. */
      base: string;
      /** The resolved head the file must name. */
      head: string;
      /** `git rev-parse HEAD` where the reviewer read the files; undefined: git could not say. */
      worktreeHead: string | undefined;
      /** `git diff --name-only -z <base>..<head>`; undefined: git could not say. */
      diffFiles: readonly string[] | undefined;
      /** Whether the tracked files equal HEAD; undefined: git could not say. */
      worktreeClean: boolean | undefined;
    };

/**
 * One reviewer findings file checked on its own, with the gate's parser and rules (a reviewer's
 * self-check before it reports). Without a range: shape, a known reviewer id, examined files and
 * unique ids. With one: also the base, the head and that every examined file is in the diff.
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
  if (range.ranged && range.worktreeHead !== range.head) {
    const at = range.worktreeHead ?? 'an unresolved commit';
    const why = `the working tree is at ${at}, not --head ${range.head}, so the files read are not the reviewed ones`;
    out.push(reviewGateFailure('HEAD_MISMATCH', why));
  }
  if (range.ranged) out.push(...worktreeFailures(range.worktreeClean));
  const self = { id: file.reviewerId, required: true, ran: true, findingsPath: name };
  const against = range.ranged ? range : { base: undefined, head: file.head };
  out.push(...contentFailures(self, file, against, diffSet));
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
    // An archive interrupted mid-way is reported beside an invalid receipt too.
    const interrupted = interruptedArchiveFailure(context.interruptedArchives ?? []);
    const failures = [reviewGateFailure('RECEIPT_INVALID', parsed.error.message)];
    if (interrupted !== undefined) failures.push(interrupted);
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
    ...demotionFailures(r, context.expectedMoment),
    ...finalFailures(r),
    ...roundFailures(r, context),
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
    notLoaded: check.notLoaded,
  };
}
