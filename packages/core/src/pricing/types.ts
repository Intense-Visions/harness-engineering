import type { ModelPricing } from '@harness-engineering/types';

/** Shape of the LiteLLM pricing JSON (per-model entry). */
export interface LiteLLMModelEntry {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  mode?: string;
  [key: string]: unknown;
}

/** Shape of the full LiteLLM pricing JSON file. */
export interface LiteLLMPricingData {
  [modelName: string]: LiteLLMModelEntry;
}

/** Parsed pricing dataset keyed by model name. */
export type PricingDataset = Map<string, ModelPricing>;

/** Shape of the disk cache file. */
export interface PricingCacheFile {
  fetchedAt: string;
  data: LiteLLMPricingData;
}

/** Shape of the fallback.json file. */
export interface FallbackPricingFile {
  _generatedAt: string;
  _source: string;
  models: Record<string, ModelPricing>;
}
