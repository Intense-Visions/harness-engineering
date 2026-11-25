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

/** N of a session review label `phase-N` (SESSION_REVIEW_LABEL); undefined for any other name. */
export function phaseOfReviewLabel(label: string): number | undefined {
  return SESSION_REVIEW_LABEL.test(label) && label !== FINAL_REVIEW_LABEL
    ? Number(label.slice('phase-'.length))
    : undefined;
}

/**
 * The moment a review directory's place states. The session layout is tested first: a directory
 * `sessions/<slug>/reviews/<label>` is that session's `final-all` or `phase-<N>` review whatever
 * the slug is, so a session whose slug is `.harness` cannot turn its final review into a
 * standalone one. Then `.harness/reviews/<name>` is a standalone review, and a bare `final-all`
 * or `phase-<N>` the final or a phase review. undefined: the place does not say.
 */
export function reviewMomentOfDir(dir: string): ReviewMoment | undefined {
  const labelMoment = (label: string): ReviewMoment =>
    label === FINAL_REVIEW_LABEL ? 'final' : 'phase';
  if (sessionDirOfReviewDir(dir) !== undefined) return labelMoment(lastSegments(dir)[0] ?? '');
  const [label = '', parent, grand] = lastSegments(dir);
  if (parent === REVIEWS_DIRNAME && grand === '.harness') return 'standalone';
  return SESSION_REVIEW_LABEL.test(label) ? labelMoment(label) : undefined;
}

/**
 * Whether `dir` is a review directory of the layout, by its place alone: a session's `phase-N`
 * or `final-all` under `.harness/sessions/<slug>/reviews/`, or a standalone review directly under
 * `.harness/reviews/`. Anything else (the repository top, a source directory) is not, so a caller
 * that moves a review's files never moves those of another directory.
 */
export function isReviewDirectory(dir: string): boolean {
  const [label = '', reviews, slugOrHarness, sessions, harness] = lastSegments(dir);
  if (reviews !== REVIEWS_DIRNAME || label === '') return false;
  if (slugOrHarness === '.harness') return true;
  return sessions === 'sessions' && harness === '.harness' && SESSION_REVIEW_LABEL.test(label);
}

/** The path's segments, last first, on either separator. */
function lastSegments(dir: string): string[] {
  return dir
    .split(/[\\/]+/)
    .filter(Boolean)
    .reverse();
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
