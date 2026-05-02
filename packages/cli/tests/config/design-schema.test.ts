// packages/cli/tests/config/design-schema.test.ts
import { describe, it, expect } from 'vitest';
import { DesignConfigSchema, HarnessConfigSchema } from '../../src/config/schema';

describe('DesignConfigSchema', () => {
  it('accepts a valid full design config', () => {
    const result = DesignConfigSchema.safeParse({
      strictness: 'standard',
      platforms: ['web', 'mobile'],
      tokenPath: 'design-system/tokens.json',
      aestheticIntent: 'design-system/DESIGN.md',
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal design config (all fields optional)', () => {
    const result = DesignConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('defaults strictness to standard', () => {
    const result = DesignConfigSchema.parse({});
    expect(result.strictness).toBe('standard');
  });

  it('defaults platforms to empty array', () => {
    const result = DesignConfigSchema.parse({});
    expect(result.platforms).toEqual([]);
  });

  it('accepts strictness: strict', () => {
    const result = DesignConfigSchema.safeParse({ strictness: 'strict' });
    expect(result.success).toBe(true);
  });

  it('accepts strictness: permissive', () => {
    const result = DesignConfigSchema.safeParse({ strictness: 'permissive' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid strictness value', () => {
    const result = DesignConfigSchema.safeParse({ strictness: 'banana' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid platform value', () => {
    const result = DesignConfigSchema.safeParse({ platforms: ['desktop'] });
    expect(result.success).toBe(false);
  });

  it('accepts web platform', () => {
    const result = DesignConfigSchema.safeParse({ platforms: ['web'] });
    expect(result.success).toBe(true);
  });

  it('accepts mobile platform', () => {
    const result = DesignConfigSchema.safeParse({ platforms: ['mobile'] });
    expect(result.success).toBe(true);
  });

  it('accepts both platforms', () => {
    const result = DesignConfigSchema.safeParse({ platforms: ['web', 'mobile'] });
    expect(result.success).toBe(true);
  });

  it('tokenPath must be a string if provided', () => {
    const result = DesignConfigSchema.safeParse({ tokenPath: 123 });
    expect(result.success).toBe(false);
  });

  it('aestheticIntent must be a string if provided', () => {
    const result = DesignConfigSchema.safeParse({ aestheticIntent: 123 });
    expect(result.success).toBe(false);
  });

  it('accepts enabled: true with platforms specified', () => {
    const result = DesignConfigSchema.safeParse({
      enabled: true,
      platforms: ['web'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts enabled: false without platforms', () => {
    const result = DesignConfigSchema.safeParse({ enabled: false });
    expect(result.success).toBe(true);
  });

  it('accepts config without enabled field (tri-state: absent)', () => {
    const result = DesignConfigSchema.parse({});
    expect(result.enabled).toBeUndefined();
  });

  it('preserves enabled: true on parse', () => {
    const result = DesignConfigSchema.parse({
      enabled: true,
      platforms: ['mobile'],
    });
    expect(result.enabled).toBe(true);
  });

  it('preserves enabled: false on parse', () => {
    const result = DesignConfigSchema.parse({ enabled: false });
    expect(result.enabled).toBe(false);
  });

  it('rejects non-boolean enabled value', () => {
    const result = DesignConfigSchema.safeParse({ enabled: 'yes' });
    expect(result.success).toBe(false);
  });
});

describe('HarnessConfigSchema with design block', () => {
  const baseConfig = {
    version: 1 as const,
    name: 'test',
  };

  it('accepts config with design block', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      design: {
        strictness: 'strict',
        platforms: ['web'],
        tokenPath: 'tokens.json',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts config without design block', () => {
    const result = HarnessConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
  });

  it('rejects config with invalid design block', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      design: { strictness: 'invalid' },
    });
    expect(result.success).toBe(false);
  });
});
