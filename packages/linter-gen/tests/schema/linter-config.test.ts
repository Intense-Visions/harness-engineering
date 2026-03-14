import { describe, it, expect } from 'vitest';
import { RuleConfigSchema, LinterConfigSchema } from '../../src/schema/linter-config';

describe('RuleConfigSchema', () => {
  it('accepts valid rule config', () => {
    const input = {
      name: 'no-ui-in-services',
      type: 'import-restriction',
      severity: 'error',
      config: {
        source: 'src/services/**',
        forbiddenImports: ['react'],
        message: 'No UI in services',
      },
    };

    const result = RuleConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects invalid rule name (not kebab-case)', () => {
    const input = {
      name: 'NoUiInServices', // PascalCase not allowed
      type: 'import-restriction',
      config: {},
    };

    const result = RuleConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('defaults severity to error', () => {
    const input = {
      name: 'my-rule',
      type: 'some-type',
      config: {},
    };

    const result = RuleConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.severity).toBe('error');
    }
  });
});

describe('LinterConfigSchema', () => {
  it('accepts valid linter config', () => {
    const input = {
      version: 1,
      output: './generated/eslint-rules',
      rules: [
        {
          name: 'no-ui-in-services',
          type: 'import-restriction',
          config: { source: 'src/**' },
        },
      ],
    };

    const result = LinterConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('rejects version other than 1', () => {
    const input = {
      version: 2,
      output: './out',
      rules: [{ name: 'r', type: 't', config: {} }],
    };

    const result = LinterConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects empty rules array', () => {
    const input = {
      version: 1,
      output: './out',
      rules: [],
    };

    const result = LinterConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('accepts optional templates mapping', () => {
    const input = {
      version: 1,
      output: './out',
      templates: {
        'custom-type': './templates/custom.ts.hbs',
      },
      rules: [{ name: 'my-rule', type: 'custom-type', config: {} }],
    };

    const result = LinterConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.templates).toEqual({
        'custom-type': './templates/custom.ts.hbs',
      });
    }
  });
});
