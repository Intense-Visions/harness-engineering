// --- Phase 7: Output types ---

import type { ReviewFinding } from './fan-out';
import type { EvidenceCoverageReport } from './mechanical';

/**
 * Assessment decision — determines exit code and PR review action.
 */
export type ReviewAssessment = 'approve' | 'comment' | 'request-changes';

/**
 * A strength identified during review (positive feedback).
 */
export interface ReviewStrength {
  /** File path (project-relative), or null for project-wide strengths */
  file: string | null;
  /** One-line description of what's done well */
  description: string;
}

/**
 * Options for formatting review output.
 */
export interface ReviewOutputOptions {
  /** Deduplicated findings from Phase 6 */
  findings: ReviewFinding[];
  /** Strengths identified during review */
  strengths: ReviewStrength[];
  /** PR number (required for GitHub comments) */
  prNumber?: number;
  /** Repository in owner/repo format (required for GitHub comments) */
  repo?: string;
  /** Evidence coverage report to append to output (optional) */
  evidenceCoverage?: EvidenceCoverageReport;
}

/**
 * A formatted GitHub inline comment ready for posting.
 */
export interface GitHubInlineComment {
  /** File path (project-relative) */
  path: string;
  /** Line number for the comment */
  line: number;
  /** Side of the diff ('RIGHT' for additions) */
  side: 'RIGHT';
  /** Comment body (markdown) */
  body: string;
}

// --- Phase 1: Eligibility Gate types ---

/**
 * Information about a prior review on this PR.
 */
export interface PriorReview {
  /** The head commit SHA that was reviewed */
  headSha: string;
  /** ISO timestamp of when the review was submitted */
  reviewedAt: string;
}

/**
 * PR metadata used by the eligibility gate.
 * This is a pure data object — the caller is responsible for fetching
 * this data from GitHub (via `gh` CLI, GitHub MCP, or mock).
 */
export interface PrMetadata {
  /** PR state: open, closed, or merged */
  state: 'open' | 'closed' | 'merged';
  /** Whether the PR is marked as draft */
  isDraft: boolean;
  /** List of changed file paths (project-relative) */
  changedFiles: string[];
  /** The HEAD commit SHA of the PR branch */
  headSha: string;
  /** Prior reviews submitted on this PR */
  priorReviews: PriorReview[];
}

/**
 * Result of the eligibility gate check.
 */
export interface EligibilityResult {
  /** Whether the PR is eligible for review */
  eligible: boolean;
  /** Human-readable reason when not eligible */
  reason?: string;
}

/** What the grouping did, so a caller can report it instead of guessing. */
export interface ClumpedCommentReport {
  /** Findings handed in. */
  findings: number;
  /** Comments emitted. */
  comments: number;
  /** Findings that kept their own anchored comment (above the floor, or solo). */
  individual: number;
  /** Clumps emitted. */
  clumps: number;
  /** Findings folded into a clump. */
  grouped: number;
  /** Sub-floor findings whose conflict keys were all inside the touched set (D4). */
  act: number;
  /** Sub-floor findings that fell outside it, or ran with no touched set. */
  file: number;
  /**
   * Sub-floor findings kept as their own anchored comment because they carry a
   * committable ```suggestion``` block (#2476). Not counted in `act` / `file`:
   * they never became grouping candidates.
   */
  committable: number;
  /** Groups past `maxClumps`, degraded back to individual comments rather than dropped. */
  overCapFindings: number;
}
