import { describe, it, expect } from 'vitest';
import { IntegrationsConfigSchema, HarnessConfigSchema } from '../../src/config/schema';

describe('IntegrationsConfigSchema', () => {
  it('accepts valid integrations config', () => {
    const result = IntegrationsConfigSchema.safeParse({
      enabled: ['perplexity'],
      dismissed: ['augment-code'],
    });
    expect(result.success).toBe(true);
  });

  it('defaults enabled to empty array', () => {
    const result = IntegrationsConfigSchema.parse({});
    expect(result.enabled).toEqual([]);
  });

  it('defaults dismissed to empty array', () => {
    const result = IntegrationsConfigSchema.parse({});
    expect(result.dismissed).toEqual([]);
  });

  it('rejects non-array enabled', () => {
    const result = IntegrationsConfigSchema.safeParse({
      enabled: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-array dismissed', () => {
    const result = IntegrationsConfigSchema.safeParse({
      dismissed: 123,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-string array elements in enabled', () => {
    const result = IntegrationsConfigSchema.safeParse({
      enabled: [123],
    });
    expect(result.success).toBe(false);
  });
});

describe('HarnessConfigSchema with integrations', () => {
  it('accepts config with integrations block', () => {
    const result = HarnessConfigSchema.safeParse({
      version: 1,
      integrations: {
        enabled: ['perplexity'],
        dismissed: ['augment-code'],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts config without integrations block', () => {
    const result = HarnessConfigSchema.safeParse({
      version: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts config with empty integrations block', () => {
    const result = HarnessConfigSchema.safeParse({
      version: 1,
      integrations: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.integrations?.enabled).toEqual([]);
      expect(result.data.integrations?.dismissed).toEqual([]);
    }
  });

  it('rejects config with invalid integrations block', () => {
    const result = HarnessConfigSchema.safeParse({
      version: 1,
      integrations: {
        enabled: 'invalid',
      },
    });
    expect(result.success).toBe(false);
  });
});
