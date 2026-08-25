/**
 * Base-freshness classification for the `-fleet` family's CI verification
 * discipline (issue #1294).
 *
 * A CI conclusion is evidence only about the `(commit, base)` it ran against.
 * When GitHub's `required_status_checks.strict` is `false` — the default, not an
 * exotic setting — a green conclusion gathered against a base that `main` has
 * since moved past is stale: "CI is green" and "safe on today's `main`" are no
 * longer the same claim. A stale-green PR that merges on that evidence can break
 * the default branch even though neither the PR nor the base is defective alone.
 *
 * ```
 * CI is green   ≠   this change is safe on today's main
 * ```
 *
 * This helper is the mechanical counterpart to the prose clause in
 * `docs/reference/fleet-family.md` § _Base freshness_: it decides whether a green
 * conclusion may be trusted as `verified` (merge-ready) or must be downgraded to
 * `degraded` until it is re-run against current `main`. It is pure — the caller
 * derives the SHAs and the `baseAdvancedSinceTest` / `strictRequired` booleans
 * from `gh pr view --json` + `gh api` / branch protection and passes them in.
 */

/** Whether a CI conclusion may be trusted as merge-ready, or only as degraded. */
export type BaseFreshnessTrust = 'verified' | 'degraded';

export interface BaseFreshnessInput {
  /** SHA of the base the PR's green CI actually ran against (the tested base). */
  testedBaseSha: string;
  /** Current tip SHA of the base branch — today's `main`. */
  currentBaseSha: string;
  /**
   * Whether the base branch has advanced past `testedBaseSha` since CI ran — i.e.
   * `currentBaseSha` is a descendant of, and not equal to, `testedBaseSha`. This
   * is the stale case. Derive from `git merge-base --is-ancestor` or the
   * `gh api .../compare/<testedBaseSha>...<currentBaseSha>` ahead-by count.
   */
  baseAdvancedSinceTest: boolean;
  /**
   * Whether branch protection enforces strict / up-to-date-before-merge
   * (`required_status_checks.strict === true`). When `true`, GitHub itself
   * refuses to merge a branch that is behind its base, so the green that actually
   * lands is guaranteed to have run against the current base — freshness holds
   * regardless of `baseAdvancedSinceTest`.
   */
  strictRequired: boolean;
}

export interface BaseFreshnessVerdict {
  /** `verified` when the green may be trusted as merge-ready; else `degraded`. */
  trust: BaseFreshnessTrust;
  /** Whether the green ran against a base that is still current. */
  fresh: boolean;
  /** Human-readable rationale, naming the stale base SHA vs current `main`. */
  reason: string;
}

/** First 7 characters of a SHA, for compact reporting. */
function short(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * Classify whether a green CI conclusion is fresh enough to trust as merge-ready.
 *
 * - Strict protection enforced → `verified`: GitHub refuses a stale merge, so the
 *   landing green ran against the current base.
 * - Base has not advanced since the test → `verified`: CI ran against current `main`.
 * - Base advanced since the test → `degraded`: the green is stale; it must be
 *   re-run against current `main` before it can authorize a merge.
 */
export function classifyBaseFreshness(input: BaseFreshnessInput): BaseFreshnessVerdict {
  const { testedBaseSha, currentBaseSha, baseAdvancedSinceTest, strictRequired } = input;

  if (strictRequired) {
    return {
      trust: 'verified',
      fresh: true,
      reason:
        'Branch protection enforces strict / up-to-date-before-merge; GitHub refuses a stale ' +
        'merge, so the green that lands runs against current main.',
    };
  }

  if (!baseAdvancedSinceTest) {
    return {
      trust: 'verified',
      fresh: true,
      reason: `CI ran against the current base tip (${short(currentBaseSha)}); green is safe on today's main.`,
    };
  }

  return {
    trust: 'degraded',
    fresh: false,
    reason:
      `Base advanced from the tested SHA ${short(testedBaseSha)} to current main ${short(currentBaseSha)} ` +
      'since CI ran; the green is stale and is downgraded to degraded until re-run against current main.',
  };
}
