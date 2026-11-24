import type { ReviewMoment } from '@harness-engineering/types';

/**
 * Where review output lives (spec "Artifact layout"). Every review writes one directory holding
 * `receipt.json` and one findings file per reviewer:
 *   session:    <sessionDir>/reviews/<moment>-<phase>/     (phase-0, phase-1, final-all)
 *   standalone: <projectRoot>/.harness/reviews/<branch>-<head sha>/
 */
export const REVIEWS_DIRNAME = 'reviews';
export const REVIEW_RECEIPT_FILENAME = 'receipt.json';
export const FINAL_REVIEW_LABEL = 'final-all';

/**
 * A review directory name inside a session: `final-all`, or `phase-N` with N a non-negative
 * integer written without leading zeros (at most nine digits). Nothing else is a session review.
 */
export const SESSION_REVIEW_LABEL = /^(?:final-all|phase-(?:0|[1-9][0-9]{0,8}))$/;

/**
 * The moment a review directory's place states: `.harness/reviews/<name>` is a standalone review,
 * `final-all` the final review, `phase-<N>` a phase review. undefined: the place does not say.
 */
export function reviewMomentOfDir(dir: string): ReviewMoment | undefined {
  const [label = '', parent, grand] = dir
    .split(/[\\/]+/)
    .filter(Boolean)
    .reverse();
  if (parent === REVIEWS_DIRNAME && grand === '.harness') return 'standalone';
  if (!SESSION_REVIEW_LABEL.test(label)) return undefined;
  return label === FINAL_REVIEW_LABEL ? 'final' : 'phase';
}

/**
 * The session directory a review directory belongs to (`<sessionDir>/reviews/<label>` with
 * `<sessionDir>` under `sessions/`), or undefined when it is not inside a session.
 */
export function sessionDirOfReviewDir(dir: string): string | undefined {
  const parts = dir.replace(/[\\/]+$/, '').split(/[\\/]+/);
  const [label = '', reviews, , sessions] = [...parts].reverse();
  if (reviews !== REVIEWS_DIRNAME || sessions !== 'sessions' || !SESSION_REVIEW_LABEL.test(label)) {
    return undefined;
  }
  return dir.replace(/[\\/]+$/, '').slice(0, -(label.length + REVIEWS_DIRNAME.length + 2));
}

/** Which review a receipt is expected to be, and where that comes from. */
export type ExpectedMoment =
  | { status: 'known'; moment: ReviewMoment }
  /** The directory and the caller both state a moment and they differ. The gate fails on it. */
  | { status: 'conflict'; directory: ReviewMoment; stated: ReviewMoment }
  | { status: 'unknown' };

/**
 * The one precedence rule for a review's moment (spec D11): the directory decides. What the
 * caller states (`--moment`, the MCP `moment` argument) counts only where the directory states
 * nothing, and a caller that contradicts the directory is a conflict, never an override.
 */
export function expectedReviewMoment(dir: string, stated?: ReviewMoment): ExpectedMoment {
  const directory = reviewMomentOfDir(dir);
  if (directory === undefined) {
    return stated === undefined ? { status: 'unknown' } : { status: 'known', moment: stated };
  }
  if (stated !== undefined && stated !== directory)
    return { status: 'conflict', directory, stated };
  return { status: 'known', moment: directory };
}
