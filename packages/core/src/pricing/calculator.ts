import type { UsageRecord } from '@harness-engineering/types';
import type { PricingDataset } from './types';
import { getModelPrice } from './pricing';

const MICRODOLLARS_PER_DOLLAR = 1_000_000;
const TOKENS_PER_MILLION = 1_000_000;

/**
 * Calculates the cost of a usage record in integer microdollars.
 * Returns null if the model is unknown or not specified.
 */
export function calculateCost(record: UsageRecord, dataset: PricingDataset): number | null {
  if (!record.model) return null;

  const pricing = getModelPrice(record.model, dataset);
  if (!pricing) return null;

  let costUSD = 0;

  // Input token cost
  costUSD += (record.tokens.inputTokens / TOKENS_PER_MILLION) * pricing.inputPer1M;

  // Output token cost
  costUSD += (record.tokens.outputTokens / TOKENS_PER_MILLION) * pricing.outputPer1M;

  // Cache read cost
  if (record.cacheReadTokens != null && pricing.cacheReadPer1M != null) {
    costUSD += (record.cacheReadTokens / TOKENS_PER_MILLION) * pricing.cacheReadPer1M;
  }

  // Cache creation/write cost
  if (record.cacheCreationTokens != null && pricing.cacheWritePer1M != null) {
    costUSD += (record.cacheCreationTokens / TOKENS_PER_MILLION) * pricing.cacheWritePer1M;
  }

  // Convert to integer microdollars
  return Math.round(costUSD * MICRODOLLARS_PER_DOLLAR);
}

/**
 * Calculates estimated savings from prompt cache reads in integer microdollars.
 * Savings = cacheReadTokens * (inputPer1M - cacheReadPer1M) / 1M
 * Returns null if model unknown, no cache tokens, or no cache pricing.
 */
export function calculateCacheSavings(record: UsageRecord, dataset: PricingDataset): number | null {
  if (!record.model || record.cacheReadTokens == null || record.cacheReadTokens === 0) return null;

  const pricing = getModelPrice(record.model, dataset);
  if (!pricing || pricing.cacheReadPer1M == null) return null;

  const savingsUSD =
    (record.cacheReadTokens / TOKENS_PER_MILLION) * (pricing.inputPer1M - pricing.cacheReadPer1M);

  return Math.round(savingsUSD * MICRODOLLARS_PER_DOLLAR);
}
