import { describe, it, expect } from 'vitest';
import { readComprehensionConfig } from '../../src/comprehension/config';
import { HarnessConfigSchema, type HarnessConfig } from '../../src/config/schema';

describe('readComprehensionConfig', () => {
  it('returns all defaults when the block is absent', () => {
    expect(readComprehensionConfig(undefined)).toEqual({
      storage: 'committed',
      semantic: true,
      model: null,
      maxTokensPerRun: 200000,
      concurrency: 4,
      ci: 'verify',
      hook: false,
    });
  });

  it('applies overrides and defaults the rest', () => {
    const config = { comprehension: { semantic: false, concurrency: 2 } } as HarnessConfig;
    expect(readComprehensionConfig(config)).toEqual({
      storage: 'committed',
      semantic: false,
      model: null,
      maxTokensPerRun: 200000,
      concurrency: 2,
      ci: 'verify',
      hook: false,
    });
  });

  it('handles a null config', () => {
    expect(readComprehensionConfig(null).storage).toBe('committed');
  });
});

describe('ComprehensionConfigSchema wired into HarnessConfigSchema', () => {
  it('accepts a valid comprehension block', () => {
    const parsed = HarnessConfigSchema.safeParse({
      version: 1,
      comprehension: { storage: 'cache' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an invalid enum value', () => {
    const parsed = HarnessConfigSchema.safeParse({
      version: 1,
      comprehension: { storage: 'nope' },
    });
    expect(parsed.success).toBe(false);
  });
});
