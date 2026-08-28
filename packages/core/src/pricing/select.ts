import type { ModelPricing } from '@harness-engineering/types';
import type { PricingDataset } from './types';

const TOKENS_PER_MILLION = 1_000_000;
const TOKENS_PER_THOUSAND = 1_000;

/**
 * Combined input + output cost per 1k tokens for a model's pricing rates.
 * Normalizes the per-million rates used throughout the pricing module down to
 * a per-thousand basis so callers can compare models on a common scale.
 */
function costPer1kTokens(pricing: ModelPricing): number {
  const per1M = pricing.inputPer1M + pricing.outputPer1M;
  return (per1M / TOKENS_PER_MILLION) * TOKENS_PER_THOUSAND;
}

/**
 * Returns the model id with the lowest combined cost per 1k tokens from `models`.
 * Models absent from the dataset are skipped (exact-match lookup, matching
 * getModelPrice). Returns null when none of the given models have pricing data.
 * On a cost tie the earlier model in `models` wins.
 */
export function cheapestModelByCost(models: string[], dataset: PricingDataset): string | null {
  let cheapest: string | null = null;
  let cheapestCost = Infinity;

  for (const model of models) {
    const pricing = dataset.get(model);
    if (!pricing) continue;

    const cost = costPer1kTokens(pricing);
    if (cost < cheapestCost) {
      cheapestCost = cost;
      cheapest = model;
    }
  }

  return cheapest;
}
