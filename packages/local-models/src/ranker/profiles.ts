/**
 * Task-aware ranking profiles (Consumption Phase 4 / T12).
 *
 * The composite `RankedModel.score` blends every benchmark a model has. But a
 * coding task and a math-reasoning task are not served equally well by the same
 * model, and the snapshot already carries per-benchmark slugs (`humaneval`,
 * `gsm8k`, `livebench-coding`, …). This module classifies each benchmark slug
 * into a task profile and computes a per-profile score by merging only the
 * profile-relevant observations.
 *
 * Design (matches the plan's degradation note): when a model has no observation
 * relevant to a profile, that profile's score falls back to the composite — the
 * feature degrades to plain score-order rather than burying an un-tagged model.
 * So `scoresByProfile.general` always equals the composite, and `coding` /
 * `reasoning` differ only where the data supports it.
 *
 * @see docs/changes/lmlm-pool-consumption/proposal.md (D5)
 */

/** Task profiles the resolver routes use-cases to. `general` is the composite. */
export const RANK_PROFILES = ['general', 'coding', 'reasoning'] as const;
export type RankProfile = (typeof RANK_PROFILES)[number];

/** Narrow an arbitrary string to a {@link RankProfile}. */
export function isRankProfile(value: string): value is RankProfile {
  return (RANK_PROFILES as readonly string[]).includes(value);
}

/**
 * Classify a benchmark slug into the specialized profile it measures, or `null`
 * when it's a general-knowledge benchmark (or unrecognized). Matching is
 * substring/keyword based and case-insensitive so new leaderboard slugs on the
 * same theme (`livecodebench`, `swe-bench`, `math-500`, …) map without a code
 * change. Coding is checked before reasoning because some coding benchmarks
 * ("code reasoning") contain reasoning keywords.
 */
export function classifyBenchmark(benchmark: string): Exclude<RankProfile, 'general'> | null {
  const b = benchmark.toLowerCase();
  if (
    /(cod|humaneval|mbpp|swe[-_ ]?bench|repobench|bigcode|leetcode|program|polyglot|apps)/.test(b)
  ) {
    return 'coding';
  }
  if (
    /(reason|math|gsm|gpqa|\barc\b|aqua|\bbbh\b|theorem|aime|logic|proof|drop|\bmath[-_]?500\b)/.test(
      b
    )
  ) {
    return 'reasoning';
  }
  return null;
}
