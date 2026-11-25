/**
 * Shift-left pipeline fidelity: review receipt contract
 * (docs/changes/shift-left-pipeline-fidelity/proposal.md, "Shared: receipts and attribution").
 * Zod validators and the gate live in packages/core/src/receipts/.
 */

export const REVIEW_MOMENTS = ['phase', 'final', 'standalone'] as const;
export type ReviewMoment = (typeof REVIEW_MOMENTS)[number];

export const REVIEW_TIERS = ['light', 'full'] as const;
export type ReviewTier = (typeof REVIEW_TIERS)[number];

/**
 * Why a review ran below the tier the tier command computed. The only one: a session with no
 * subagent-spawning tool cannot fan out, so it runs `light`.
 */
export const REVIEW_TIER_DEMOTIONS = ['no-subagent-tool'] as const;
export type ReviewTierDemotion = (typeof REVIEW_TIER_DEMOTIONS)[number];

export const REVIEW_BACKENDS = ['agent', 'pipeline'] as const;
export type ReviewBackend = (typeof REVIEW_BACKENDS)[number];

/** A resolved commit id: the only form of a sha a receipt carries. */
export const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;

/** How `diff.base` was resolved. `starting-commit` is the fallback when no default branch resolves. */
export const REVIEW_BASE_SOURCES = ['merge-base', 'starting-commit'] as const;
export type ReviewBaseSource = (typeof REVIEW_BASE_SOURCES)[number];

/** Reviewers a `full` review always requires. */
export const FULL_TIER_REVIEWER_IDS = ['compliance', 'bug', 'security', 'architecture'] as const;
/** Reviewers a `full` review requires only when depth calibration activates them. */
export const CONDITIONAL_REVIEWER_IDS = [
  'adversarial',
  'typescript-strict',
  'frontend-races',
] as const;
/** The single reviewer of a `light` review: compliance and bug detection in one pass. */
export const LIGHT_TIER_REVIEWER_ID = 'compliance-bug';
/**
 * Review domains of the coded pipeline (`run_code_review`) that are no receipt reviewer. Their
 * findings stay outside the receipt and its counts, like hook findings: no findings file is
 * written for them. core's schema-types test ties the pipeline's subagents to the receipt
 * reviewer ids plus this set.
 */
export const PIPELINE_DOMAINS_OUTSIDE_RECEIPT = ['learnings'] as const;

export interface ReviewerRecord {
  /** compliance | bug | security | architecture | adversarial | typescript-strict | frontend-races | compliance-bug */
  id: string;
  /** Required by the tier and the activation set. */
  required: boolean;
  ran: boolean;
  /** Resolved model tier, recorded for visibility. */
  modelTier?: string;
  /** The reviewer's own findings file, relative to the receipt's directory. */
  findingsPath?: string;
  skippedReason?: string;
}

/** What an earlier round of the same review found, before its fix round. */
export interface ReviewPriorRound {
  round: number;
  /** The 40-character SHA that round reviewed. */
  head: string;
  blocking: number;
}

export interface ReviewReceipt {
  schemaVersion: 1;
  moment: ReviewMoment;
  tier: ReviewTier;
  /** The tier `harness review-tier` printed for this review, recorded by the session. */
  computedTier?: ReviewTier;
  /** The reasons it printed for that tier (empty for `light`). */
  tierReasons?: string[];
  /** Set only when `tier` is `light` and `computedTier` is `full`: why the review ran lower. */
  demotion?: ReviewTierDemotion;
  backend: ReviewBackend;
  /**
   * Resolved 40-character SHAs. `target`, on a final receipt only: the remote-tracking branch
   * (full ref, `refs/remotes/...`) a stacked branch merges into; its merge base is the final base.
   */
  diff: { base: string; head: string; baseSource?: ReviewBaseSource; target?: string };
  coldContext: boolean;
  priorFindingsSupplied: boolean;
  reviewers: ReviewerRecord[];
  blocking: number;
  advisory: number;
  /** Which round of this review the receipt is: 1, or higher after a fix round. Default 1. */
  round?: number;
  priorRounds?: ReviewPriorRound[];
}

/**
 * Why a receipt file could not be read, besides an errno code (`ERRNO_REASON`): the reasons the
 * reader writes. Never a path.
 */
export const RECEIPT_UNREAD_REASONS = [
  'not valid JSON',
  'not a regular file',
  'too large',
] as const;
export type ReceiptUnreadReason = (typeof RECEIPT_UNREAD_REASONS)[number];
/**
 * An errno code as the reader writes it (`EACCES`), the pattern it matches. An error that carries
 * no code, or one that does not match, is written `UNKNOWN`.
 */
export const ERRNO_REASON = '[A-Z][A-Z0-9_]{1,30}';
/** A reason matching ERRNO_REASON. */
export type ErrnoReason = Uppercase<string>;
/** Every reason an unread receipt or findings file carries. */
export type ReceiptReadProblem = ReceiptUnreadReason | ErrnoReason;

/**
 * An archived earlier round of a review (`round-R/`): the head its archived receipt names and the
 * blocking count its archived findings files hold, or `unreadable` when either cannot be read.
 */
export type ArchivedRound = ReviewPriorRound | { round: number; unreadable: true };

/** Every way the review receipt gate (core `validateReviewReceipt`) can fail. */
export const REVIEW_GATE_FAILURE_CODES = [
  'RECEIPT_MISSING',
  'RECEIPT_INVALID',
  'RECEIPT_OUTSIDE_REPO',
  'GATE_ERROR',
  'MOMENT_MISMATCH',
  'MOMENT_UNKNOWN',
  'HEAD_MISMATCH',
  'WORKTREE_DIRTY',
  'REQUIRED_REVIEWER_NOT_RUN',
  'CORE_REVIEWER_MISSING',
  'LIGHT_TIER_ROSTER',
  'TIER_DEMOTED',
  'DUPLICATE_REVIEWER',
  'UNKNOWN_REVIEWER',
  'FINAL_NOT_FULL',
  'FINAL_NOT_COLD',
  'FINAL_PRIOR_FINDINGS',
  'FINAL_BASE_NOT_MERGE_BASE',
  'TARGET_UNRESOLVED',
  'TARGET_OWN_BRANCH',
  'STARTING_COMMIT_UNKNOWN',
  'PHASE_BASE_MISMATCH',
  'PHASE_BASE_UNKNOWN',
  'ROUND_MISMATCH',
  'PRIOR_ROUNDS_MISMATCH',
  'ROUND_SAME_HEAD',
  'ROUND_ARCHIVE_INTERRUPTED',
  'DIFF_BASE_NOT_ANCESTOR',
  'DIFF_UNRESOLVED',
  'EMPTY_DIFF',
  'FINDINGS_FILE_MISSING',
  'FINDINGS_PATH_INVALID',
  'FINDINGS_FILE_SHARED',
  'FINDINGS_FILE_INVALID',
  'FINDINGS_REVIEWER_MISMATCH',
  'FINDINGS_HEAD_MISMATCH',
  'FINDINGS_BASE_MISMATCH',
  'EXAMINED_FILES_EMPTY',
  'EXAMINED_OUTSIDE_DIFF',
  'DUPLICATE_FINDING_ID',
  'COUNTS_MISMATCH',
] as const;
export type ReviewGateFailureCode = (typeof REVIEW_GATE_FAILURE_CODES)[number];

/** The earliest stage that should have caught a finding. `none`: only a review could have. */
export const ESCAPED_FROM_STAGES = ['spec', 'plan', 'execution', 'verification', 'none'] as const;
export type EscapedFrom = (typeof ESCAPED_FROM_STAGES)[number];

export const FINDING_CLASSES = [
  'stale-claim',
  'edge-case',
  'weak-test',
  'collateral',
  'design',
  'other',
] as const;
export type FindingClass = (typeof FINDING_CLASSES)[number];

export const REVIEW_DECISION_KINDS = ['gate', 'findings', 'dismissed', 'skipped'] as const;
export type ReviewDecisionKind = (typeof REVIEW_DECISION_KINDS)[number];

/**
 * Why a review was not run: its range changed no files (`empty`), or the phase was dropped from
 * the plan (`dropped`, the entry kept with `status: "skipped"`).
 */
export const REVIEW_SKIP_REASONS = ['empty', 'dropped'] as const;
export type ReviewSkipReason = (typeof REVIEW_SKIP_REASONS)[number];

/**
 * Who took a review decision: the human; the agent after a blind-then-refute self-audit agreed
 * (`audited`); or the agent with no audit (`unaudited`).
 */
export const REVIEW_DECIDERS = ['human', 'audited', 'unaudited'] as const;
export type ReviewDecider = (typeof REVIEW_DECIDERS)[number];

/** The fields every review decision has. `D` is who may be named as having taken it. */
interface ReviewDecisionFields<D extends string> {
  state: 'REVIEW' | 'FINAL_REVIEW';
  /** The phase's 0-based position in `phases[]`. Required for `REVIEW`. */
  phase?: number | string;
  rationale: string;
  /** Who decided. */
  decidedBy: D;
  /**
   * The round of the review the decision was taken in: 1 + the `round-R/` archives of its review
   * directory. Default 1. A decision applies only to the receipt of the same round.
   */
  round?: number;
}

/**
 * A review decision in autopilot's `decisions[]`, as written: the human let a review state be
 * left over a failed receipt gate (`gate`, naming the failure codes) or over blocking findings
 * (`findings`); blocking findings were set aside as not applying (`dismissed`, naming their ids);
 * or the review was not run (`skipped`, with why, and for an empty range the head it was found
 * empty at). Other fields of the entry are not read.
 */
export type ReviewDecisionRecord<D extends string = ReviewDecider> =
  | (ReviewDecisionFields<D> & { kind: 'gate'; codes: ReviewGateFailureCode[] })
  | (ReviewDecisionFields<D> & { kind: 'findings' })
  | (ReviewDecisionFields<D> & { kind: 'dismissed'; findingIds: string[] })
  | (ReviewDecisionFields<D> & { kind: 'skipped'; reason: ReviewSkipReason; head?: string });

/**
 * A review decision as the session reader gives it: one written before `decidedBy` existed (no
 * such key at all) reads as decided by `unknown`. Never written.
 */
export type ReadReviewDecision = ReviewDecisionRecord<ReviewDecider | 'unknown'>;

/**
 * One entry of `phases[]` in a session's `autopilot-state.json`, as far as code reads it; other
 * fields pass through. A phase is identified by its 0-based position in the list. That number is
 * the `N` of its review directory `phase-N` and the `phase` of a review decision record.
 */
export interface AutopilotPhaseEntry {
  /** Optional. When present it must be the entry's 0-based position in `phases[]`. */
  index?: number;
  name: string;
  status?: string;
  planPath?: string | null;
  complexity?: string;
}

/** The part of `autopilot-state.json` that code reads. Other fields pass through. */
export interface AutopilotSessionState {
  specPath?: string;
  /** The commit the session started from: the base of the first phase. A full sha. */
  startingCommit?: string;
  phases?: AutopilotPhaseEntry[];
  /** Mixed entries; a review decision among them is a `ReviewDecisionRecord`. */
  decisions?: unknown[];
}
