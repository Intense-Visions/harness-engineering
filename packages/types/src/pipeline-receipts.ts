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
  /** Resolved 40-character SHAs. */
  diff: { base: string; head: string; baseSource?: ReviewBaseSource };
  coldContext: boolean;
  priorFindingsSupplied: boolean;
  reviewers: ReviewerRecord[];
  blocking: number;
  advisory: number;
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
/** An errno code as the reader writes it (`EACCES`, `UNKNOWN`). */
export const ERRNO_REASON = '[A-Z][A-Z0-9_]{1,30}';

/** Every way the review receipt gate (core `validateReviewReceipt`) can fail. */
export const REVIEW_GATE_FAILURE_CODES = [
  'RECEIPT_MISSING',
  'RECEIPT_INVALID',
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
  'STARTING_COMMIT_UNKNOWN',
  'PHASE_BASE_MISMATCH',
  'PHASE_BASE_UNKNOWN',
  'DIFF_BASE_NOT_ANCESTOR',
  'DIFF_UNRESOLVED',
  'EMPTY_DIFF',
  'FINDINGS_FILE_MISSING',
  'FINDINGS_PATH_INVALID',
  'FINDINGS_FILE_SHARED',
  'FINDINGS_FILE_INVALID',
  'FINDINGS_REVIEWER_MISMATCH',
  'FINDINGS_HEAD_MISMATCH',
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
