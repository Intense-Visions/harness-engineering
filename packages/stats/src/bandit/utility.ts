import type { Pull } from '@harness-engineering/types';

/** The recorded reward pair of a scored pull. The ledger stores this, never a scalar (D8). */
export type Reward = NonNullable<Pull['reward']>;

/** Consumer-supplied scalar over a reward pair; passed to `fold` (spec "Utilities"). */
export type Utility = (reward: Reward) => number;

/** Cost floor for `outcomePerDollar`: one tenth of a US cent. A free or unpriced pull is scored as if it cost this much. */
export const COST_EPSILON_USD = 0.001;

/** `outcomeOnly(r) = r.outcome` — routing quality, fleet landed-PR rate, etc. */
export const outcomeOnly: Utility = (reward) => reward.outcome;

/** `outcomePerDollar(r) = r.outcome / max(r.costUsd, epsilon)` — outcome per dollar spent. */
export const outcomePerDollar: Utility = (reward) =>
  reward.outcome / Math.max(reward.costUsd ?? 0, COST_EPSILON_USD);
