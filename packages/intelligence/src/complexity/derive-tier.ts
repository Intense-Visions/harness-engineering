import type {
  CapabilityTier,
  ComplexityVerdict,
  RoutingRisk,
  RoutingPolicy,
  ComplexityLevel,
} from '@harness-engineering/types';

const TIER_RANK = { fast: 0, standard: 1, strong: 2 } satisfies Record<CapabilityTier, number>;
// `RANK_TIER` is the rank→tier inverse of `TIER_RANK`. The `satisfies` below is a
// compile-time exhaustiveness link: the tuple's union of members must equal the
// full `CapabilityTier` union, so adding a tier without extending BOTH tables
// (or leaving RANK_TIER short) fails typecheck instead of silently indexing
// `undefined` at runtime.
const RANK_TIER = ['fast', 'standard', 'strong'] as const satisfies readonly CapabilityTier[];
type _RankTierCoversUnion = CapabilityTier extends (typeof RANK_TIER)[number] ? true : never;
const _rankTierCoversUnion: _RankTierCoversUnion = true;
void _rankTierCoversUnion;

/**
 * Documented seed threshold for the D5 high-blast veto. The spec lists
 * sensitive-path / core|types layer / public API explicitly but pins no numeric
 * blast threshold, so this is a plan-chosen seed — overridable later.
 */
export const SENSITIVE_BLAST_THRESHOLD = 25;

/** Default (complexity level) → required tier matrix. Overridable via policy. */
const DEFAULT_MATRIX: Record<ComplexityLevel, CapabilityTier> = {
  trivial: 'fast',
  simple: 'fast',
  moderate: 'standard',
  complex: 'strong',
};

/** Clamp a rank into the valid tier range and map back to a tier. */
function tierAtRank(rank: number): CapabilityTier {
  const clamped = Math.max(0, Math.min(RANK_TIER.length - 1, rank));
  return RANK_TIER[clamped]!;
}

/**
 * D5: any sensitive-path / core|types layer / public API / high blast → force
 * `strong`, regardless of complexity (SC5). This is a HARD floor; downstream
 * budget clamping (D8) must not undercut it.
 */
export function blastRadiusVeto(risk?: RoutingRisk): boolean {
  if (!risk) return false;
  return (
    risk.sensitivePath === true ||
    risk.publicApi === true ||
    risk.layer === 'core' ||
    risk.layer === 'types' ||
    (typeof risk.blastRadius === 'number' && risk.blastRadius >= SENSITIVE_BLAST_THRESHOLD)
  );
}

/**
 * Pre-budget tier resolution (Task 7): skillTierOverride → matrix → D5 veto →
 * low-confidence bump. Pure; the LLM never influences it (mirrors
 * outcome-eval/authority.ts). Task 8's `deriveRequiredTier` calls this then
 * applies the D8 budget clamp and D10 escalation floor.
 *
 * SC6: a `low`-confidence verdict degrades the tier UP one step (never below the
 * matrix default and never to a cheaper tier) — uncertainty routes to a more
 * capable model, never a Tier-A cheap one.
 */
export function baseTier(
  complexity: ComplexityVerdict,
  risk: RoutingRisk | undefined,
  policy: RoutingPolicy,
  skillKey?: string
): CapabilityTier {
  // D5 veto is a hard `strong` floor — evaluate it up front.
  const veto = blastRadiusVeto(risk);

  // Skill/phase override precedes the matrix.
  const override = skillKey !== undefined ? policy.skillTierOverrides?.[skillKey] : undefined;

  const matrix = policy.complexityTierMatrix ?? {};
  const fromMatrix = matrix[complexity.level] ?? DEFAULT_MATRIX[complexity.level];

  // `: 0` is the identity element for the surrounding `Math.max` (no override ⇒
  // contribute nothing), NOT a `fast`-tier floor. The effective floor is
  // whichever of the override rank / matrix rank is higher.
  let rank = Math.max(override !== undefined ? TIER_RANK[override] : 0, TIER_RANK[fromMatrix]);

  // SC6: low confidence degrades UP one step (never below the resolved default;
  // tierAtRank clamps the bump at `strong`).
  if (complexity.confidence === 'low') {
    rank = rank + 1;
  }

  // D5 veto forces at least `strong`.
  if (veto) rank = Math.max(rank, TIER_RANK.strong);

  return tierAtRank(rank);
}

/** Default budget degrade threshold (% of cap) when policy omits one (D8). */
const DEFAULT_DEGRADE_AT_PCT = 90;

/**
 * D8: while spend is at/above `degradeAtPct` of `capUsd`, clamp the tier DOWN
 * one step (`strong→standard→fast`, `fast→fast`). The D5 blast-radius veto is a
 * HARD `strong` floor the clamp must NOT undercut (SC5 says sensitive-path /
 * core|types / publicApi force `strong` "regardless"), so a vetoed request stays
 * `strong` even under budget pressure. No budget block ⇒ no clamp.
 */
export function applyBudgetClamp(
  tier: CapabilityTier,
  risk: RoutingRisk | undefined,
  policy: RoutingPolicy,
  spend: { spentUsd: number }
): CapabilityTier {
  const budget = policy.budget;
  if (!budget || budget.capUsd <= 0) return tier;

  const degradeAt = (budget.degradeAtPct ?? DEFAULT_DEGRADE_AT_PCT) / 100;
  const spentFraction = spend.spentUsd / budget.capUsd;
  if (spentFraction < degradeAt) return tier;

  // Under budget pressure — but the D5 veto floor is inviolable.
  if (blastRadiusVeto(risk)) return tier; // stays strong

  return tierAtRank(TIER_RANK[tier] - 1);
}

/**
 * Pure (complexity × risk × policy × spend × floor) → required tier.
 *
 * `baseTier` resolves override → matrix → D5 veto → low-confidence bump; the D8
 * budget clamp lowers one step under budget pressure (never below the veto
 * floor); the D10 escalation floor raises the result but never lowers it. The
 * LLM never influences this — mirrors outcome-eval/authority.ts (TS-derived
 * authority). Referentially transparent; never mutates `policy`.
 */
export function deriveRequiredTier(
  complexity: ComplexityVerdict,
  risk: RoutingRisk | undefined,
  policy: RoutingPolicy,
  spend: { spentUsd: number },
  escalationFloor: CapabilityTier,
  skillKey?: string
): CapabilityTier {
  const base = baseTier(complexity, risk, policy, skillKey);
  const clamped = applyBudgetClamp(base, risk, policy, spend);
  // D10: floor raises, never lowers.
  return tierAtRank(Math.max(TIER_RANK[escalationFloor], TIER_RANK[clamped]));
}

export { TIER_RANK, RANK_TIER, DEFAULT_MATRIX, DEFAULT_DEGRADE_AT_PCT };
