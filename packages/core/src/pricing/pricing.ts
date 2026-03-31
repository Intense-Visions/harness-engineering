import type { ModelPricing } from '@harness-engineering/types';
import type { LiteLLMPricingData, PricingDataset } from './types';

const TOKENS_PER_MILLION = 1_000_000;

/**
 * Parses LiteLLM's raw pricing JSON into a PricingDataset map.
 * Only includes chat-mode models with valid input/output costs.
 */
export function parseLiteLLMData(raw: LiteLLMPricingData): PricingDataset {
  const dataset: PricingDataset = new Map();

  for (const [modelName, entry] of Object.entries(raw)) {
    // Skip the sample_spec documentation entry
    if (modelName === 'sample_spec') continue;

    // Only include chat models
    if (entry.mode && entry.mode !== 'chat') continue;

    const inputCost = entry.input_cost_per_token;
    const outputCost = entry.output_cost_per_token;

    // Skip models without pricing data
    if (inputCost == null || outputCost == null) continue;

    const pricing: ModelPricing = {
      inputPer1M: inputCost * TOKENS_PER_MILLION,
      outputPer1M: outputCost * TOKENS_PER_MILLION,
    };

    if (entry.cache_read_input_token_cost != null) {
      pricing.cacheReadPer1M = entry.cache_read_input_token_cost * TOKENS_PER_MILLION;
    }

    if (entry.cache_creation_input_token_cost != null) {
      pricing.cacheWritePer1M = entry.cache_creation_input_token_cost * TOKENS_PER_MILLION;
    }

    dataset.set(modelName, pricing);
  }

  return dataset;
}

/**
 * Looks up pricing for a given model name.
 * Returns null and logs a warning if the model is not found.
 */
export function getModelPrice(model: string, dataset: PricingDataset): ModelPricing | null {
  if (!model) {
    console.warn('[harness pricing] No model specified — cannot look up pricing.');
    return null;
  }

  const pricing = dataset.get(model);
  if (!pricing) {
    console.warn(
      `[harness pricing] No pricing data for model "${model}". Consider updating pricing data.`
    );
    return null;
  }

  return pricing;
}
