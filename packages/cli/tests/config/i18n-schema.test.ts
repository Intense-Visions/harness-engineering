// packages/cli/tests/config/i18n-schema.test.ts
import { describe, it, expect } from 'vitest';
import {
  I18nConfigSchema,
  I18nCoverageConfigSchema,
  I18nMcpConfigSchema,
  HarnessConfigSchema,
} from '../../src/config/schema';

describe('I18nCoverageConfigSchema', () => {
  it('accepts valid coverage config', () => {
    const result = I18nCoverageConfigSchema.safeParse({
      minimumPercent: 95,
      requirePlurals: true,
      detectUntranslated: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty object with defaults', () => {
    const result = I18nCoverageConfigSchema.parse({});
    expect(result.minimumPercent).toBe(100);
    expect(result.requirePlurals).toBe(true);
    expect(result.detectUntranslated).toBe(true);
  });

  it('rejects minimumPercent below 0', () => {
    const result = I18nCoverageConfigSchema.safeParse({ minimumPercent: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects minimumPercent above 100', () => {
    const result = I18nCoverageConfigSchema.safeParse({ minimumPercent: 101 });
    expect(result.success).toBe(false);
  });
});

describe('I18nMcpConfigSchema', () => {
  it('accepts valid MCP config', () => {
    const result = I18nMcpConfigSchema.safeParse({
      server: 'tolgee',
      projectId: 'my-project',
    });
    expect(result.success).toBe(true);
  });

  it('requires server field', () => {
    const result = I18nMcpConfigSchema.safeParse({ projectId: 'my-project' });
    expect(result.success).toBe(false);
  });
});

describe('I18nConfigSchema', () => {
  it('accepts a valid full i18n config', () => {
    const result = I18nConfigSchema.safeParse({
      enabled: true,
      strictness: 'standard',
      sourceLocale: 'en',
      targetLocales: ['es', 'fr', 'de', 'ja', 'ar'],
      framework: 'auto',
      format: 'json',
      messageFormat: 'icu',
      keyConvention: 'dot-notation',
      translationPaths: {
        web: 'src/locales/{locale}.json',
        backend: 'locales/{locale}.json',
      },
      platforms: ['web', 'backend'],
      industry: 'fintech',
      coverage: {
        minimumPercent: 95,
        requirePlurals: true,
        detectUntranslated: true,
      },
      pseudoLocale: 'en-XA',
      mcp: {
        server: 'tolgee',
        projectId: 'my-project',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal i18n config (all fields optional except enabled)', () => {
    const result = I18nConfigSchema.safeParse({ enabled: true });
    expect(result.success).toBe(true);
  });

  it('defaults enabled to false', () => {
    const result = I18nConfigSchema.parse({});
    expect(result.enabled).toBe(false);
  });

  it('defaults strictness to standard', () => {
    const result = I18nConfigSchema.parse({});
    expect(result.strictness).toBe('standard');
  });

  it('defaults sourceLocale to en', () => {
    const result = I18nConfigSchema.parse({});
    expect(result.sourceLocale).toBe('en');
  });

  it('defaults framework to auto', () => {
    const result = I18nConfigSchema.parse({});
    expect(result.framework).toBe('auto');
  });

  it('defaults targetLocales to empty array', () => {
    const result = I18nConfigSchema.parse({});
    expect(result.targetLocales).toEqual([]);
  });

  it('defaults platforms to empty array', () => {
    const result = I18nConfigSchema.parse({});
    expect(result.platforms).toEqual([]);
  });

  it('accepts strictness: strict', () => {
    const result = I18nConfigSchema.safeParse({ strictness: 'strict' });
    expect(result.success).toBe(true);
  });

  it('accepts strictness: permissive', () => {
    const result = I18nConfigSchema.safeParse({ strictness: 'permissive' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid strictness value', () => {
    const result = I18nConfigSchema.safeParse({ strictness: 'banana' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid framework value', () => {
    const result = I18nConfigSchema.safeParse({ framework: 'nonexistent' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid framework values', () => {
    for (const fw of [
      'auto',
      'i18next',
      'react-intl',
      'vue-i18n',
      'flutter-intl',
      'apple',
      'android',
      'custom',
    ]) {
      const result = I18nConfigSchema.safeParse({ framework: fw });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid platform value', () => {
    const result = I18nConfigSchema.safeParse({ platforms: ['desktop'] });
    expect(result.success).toBe(false);
  });

  it('accepts all valid platform values', () => {
    const result = I18nConfigSchema.safeParse({
      platforms: ['web', 'mobile', 'backend'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid messageFormat value', () => {
    const result = I18nConfigSchema.safeParse({ messageFormat: 'xml' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid keyConvention value', () => {
    const result = I18nConfigSchema.safeParse({
      keyConvention: 'SCREAMING_CASE',
    });
    expect(result.success).toBe(false);
  });

  it('translationPaths must be a record of strings', () => {
    const result = I18nConfigSchema.safeParse({
      translationPaths: { web: 123 },
    });
    expect(result.success).toBe(false);
  });
});

describe('HarnessConfigSchema with i18n block', () => {
  const baseConfig = {
    version: 1 as const,
    name: 'test',
  };

  it('accepts config with i18n block', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      i18n: {
        enabled: true,
        strictness: 'strict',
        sourceLocale: 'en',
        targetLocales: ['es', 'fr'],
        platforms: ['web'],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts config without i18n block', () => {
    const result = HarnessConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
  });

  it('rejects config with invalid i18n block', () => {
    const result = HarnessConfigSchema.safeParse({
      ...baseConfig,
      i18n: { strictness: 'invalid' },
    });
    expect(result.success).toBe(false);
  });
});
