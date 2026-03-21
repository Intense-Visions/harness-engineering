import { describe, it, expect } from 'vitest';
import { resolveModelTier, DEFAULT_PROVIDER_TIERS } from '../../src/review/model-tier-resolver';
import type { ModelTierConfig } from '../../src/review/types';

describe('DEFAULT_PROVIDER_TIERS', () => {
  it('has defaults for claude provider', () => {
    expect(DEFAULT_PROVIDER_TIERS.claude).toEqual({
      fast: 'haiku',
      standard: 'sonnet',
      strong: 'opus',
    });
  });

  it('has defaults for openai provider', () => {
    expect(DEFAULT_PROVIDER_TIERS.openai).toEqual({
      fast: 'gpt-4o-mini',
      standard: 'gpt-4o',
      strong: 'o1',
    });
  });

  it('has defaults for gemini provider', () => {
    expect(DEFAULT_PROVIDER_TIERS.gemini).toEqual({
      fast: 'gemini-flash',
      standard: 'gemini-pro',
      strong: 'gemini-ultra',
    });
  });
});

describe('resolveModelTier()', () => {
  it('returns undefined when no config and no provider', () => {
    expect(resolveModelTier('fast')).toBeUndefined();
  });

  it('returns undefined when config is undefined and no provider', () => {
    expect(resolveModelTier('standard', undefined)).toBeUndefined();
  });

  it('returns configured value when config has the tier', () => {
    const config: ModelTierConfig = { fast: 'haiku', standard: 'sonnet', strong: 'opus' };
    expect(resolveModelTier('fast', config)).toBe('haiku');
    expect(resolveModelTier('standard', config)).toBe('sonnet');
    expect(resolveModelTier('strong', config)).toBe('opus');
  });

  it('returns undefined for unmapped tier in partial config (no provider)', () => {
    const config: ModelTierConfig = { strong: 'opus' };
    expect(resolveModelTier('fast', config)).toBeUndefined();
    expect(resolveModelTier('standard', config)).toBeUndefined();
    expect(resolveModelTier('strong', config)).toBe('opus');
  });

  it('returns provider default when config is undefined but provider is given', () => {
    expect(resolveModelTier('fast', undefined, 'claude')).toBe('haiku');
    expect(resolveModelTier('standard', undefined, 'openai')).toBe('gpt-4o');
    expect(resolveModelTier('strong', undefined, 'gemini')).toBe('gemini-ultra');
  });

  it('config takes precedence over provider defaults', () => {
    const config: ModelTierConfig = { fast: 'my-custom-fast' };
    expect(resolveModelTier('fast', config, 'claude')).toBe('my-custom-fast');
  });

  it('falls back to provider default for unmapped tier in partial config', () => {
    const config: ModelTierConfig = { strong: 'custom-strong' };
    expect(resolveModelTier('fast', config, 'claude')).toBe('haiku');
    expect(resolveModelTier('strong', config, 'claude')).toBe('custom-strong');
  });

  it('returns undefined for unmapped tier when provider is unknown', () => {
    const config: ModelTierConfig = {};
    expect(resolveModelTier('fast', config)).toBeUndefined();
  });

  it('handles empty config object', () => {
    expect(resolveModelTier('fast', {})).toBeUndefined();
    expect(resolveModelTier('fast', {}, 'claude')).toBe('haiku');
  });

  it('handles all three tiers with each provider', () => {
    for (const tier of ['fast', 'standard', 'strong'] as const) {
      for (const provider of ['claude', 'openai', 'gemini'] as const) {
        const result = resolveModelTier(tier, undefined, provider);
        expect(typeof result).toBe('string');
        expect(result!.length).toBeGreaterThan(0);
      }
    }
  });
});
