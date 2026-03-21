import type { ModelTier, ModelTierConfig, ModelProvider, ProviderDefaults } from './types';

/**
 * Sensible default model tier mappings per known provider.
 * Used as fallback when project config does not map a tier.
 */
export const DEFAULT_PROVIDER_TIERS: ProviderDefaults = {
  claude: {
    fast: 'haiku',
    standard: 'sonnet',
    strong: 'opus',
  },
  openai: {
    fast: 'gpt-4o-mini',
    standard: 'gpt-4o',
    strong: 'o1',
  },
  gemini: {
    fast: 'gemini-flash',
    standard: 'gemini-pro',
    strong: 'gemini-ultra',
  },
};

/**
 * Resolve an abstract model tier to a concrete model identifier.
 *
 * Resolution order:
 * 1. If config has a mapping for the tier, return it.
 * 2. If a provider is specified and has a default for the tier, return the default.
 * 3. Return undefined (meaning "use whatever model the user is currently running").
 *
 * @param tier - Abstract model tier ('fast', 'standard', 'strong')
 * @param config - Optional model tier config from harness.config.json review.model_tiers
 * @param provider - Optional known provider for default fallback
 * @returns Concrete model identifier string, or undefined if no mapping found
 */
export function resolveModelTier(
  tier: ModelTier,
  config?: ModelTierConfig,
  provider?: ModelProvider
): string | undefined {
  // 1. Check explicit config
  const configValue = config?.[tier];
  if (configValue !== undefined) {
    return configValue;
  }

  // 2. Check provider defaults
  if (provider) {
    const providerDefaults = DEFAULT_PROVIDER_TIERS[provider];
    const defaultValue = providerDefaults[tier];
    if (defaultValue !== undefined) {
      return defaultValue;
    }
  }

  // 3. No mapping — use current model
  return undefined;
}
