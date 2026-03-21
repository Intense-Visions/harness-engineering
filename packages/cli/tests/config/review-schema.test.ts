import { describe, it, expect } from 'vitest';
import {
  ModelTierConfigSchema,
  ReviewConfigSchema,
  HarnessConfigSchema,
} from '../../src/config/schema';

describe('ModelTierConfigSchema', () => {
  it('accepts a full model tier config', () => {
    const result = ModelTierConfigSchema.safeParse({
      fast: 'haiku',
      standard: 'sonnet',
      strong: 'opus',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty object (all tiers optional)', () => {
    const result = ModelTierConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts partial config with only one tier', () => {
    const result = ModelTierConfigSchema.safeParse({ strong: 'opus' });
    expect(result.success).toBe(true);
  });

  it('rejects non-string tier values', () => {
    const result = ModelTierConfigSchema.safeParse({ fast: 123 });
    expect(result.success).toBe(false);
  });

  it('accepts OpenAI model names', () => {
    const result = ModelTierConfigSchema.safeParse({
      fast: 'gpt-4o-mini',
      standard: 'gpt-4o',
      strong: 'o1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts Gemini model names', () => {
    const result = ModelTierConfigSchema.safeParse({
      fast: 'gemini-flash',
      standard: 'gemini-pro',
      strong: 'gemini-ultra',
    });
    expect(result.success).toBe(true);
  });
});

describe('ReviewConfigSchema', () => {
  it('accepts review config with model_tiers', () => {
    const result = ReviewConfigSchema.safeParse({
      model_tiers: { fast: 'haiku', standard: 'sonnet', strong: 'opus' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts review config without model_tiers', () => {
    const result = ReviewConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects model_tiers with invalid structure', () => {
    const result = ReviewConfigSchema.safeParse({
      model_tiers: 'not-an-object',
    });
    expect(result.success).toBe(false);
  });
});

describe('HarnessConfigSchema with review block', () => {
  const baseConfig = {
    version: 1 as const,
    name: 'test',
  };

  it('accepts config with review.model_tiers', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      review: {
        model_tiers: { fast: 'haiku', standard: 'sonnet', strong: 'opus' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts config without review block', () => {
    const result = HarnessConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
  });

  it('accepts config with empty review block', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      review: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects config with invalid review.model_tiers', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      review: { model_tiers: { fast: 123 } },
    });
    expect(result.success).toBe(false);
  });

  it('preserves model_tiers values after parsing', () => {
    const result = HarnessConfigSchema.parse({
      ...baseConfig,
      review: {
        model_tiers: { fast: 'haiku', standard: 'sonnet', strong: 'opus' },
      },
    });
    expect(result.review?.model_tiers?.fast).toBe('haiku');
    expect(result.review?.model_tiers?.standard).toBe('sonnet');
    expect(result.review?.model_tiers?.strong).toBe('opus');
  });
});
