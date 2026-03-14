import { describe, it, expect } from 'vitest';
import { buildRuleContext, type RuleContext } from '../../src/engine/context-builder';
import type { RuleConfig } from '../../src/schema/linter-config';

describe('buildRuleContext', () => {
  it('transforms rule config to template context', () => {
    const rule: RuleConfig = {
      name: 'no-ui-in-services',
      type: 'import-restriction',
      severity: 'error',
      config: {
        source: 'src/services/**',
        forbiddenImports: ['react'],
        message: 'No UI in services',
      },
    };

    const context = buildRuleContext(rule, '/path/to/config.yml');

    expect(context.name).toBe('no-ui-in-services');
    expect(context.nameCamel).toBe('noUiInServices');
    expect(context.namePascal).toBe('NoUiInServices');
    expect(context.severity).toBe('error');
    expect(context.config).toEqual(rule.config);
    expect(context.meta.configPath).toBe('/path/to/config.yml');
    expect(context.meta.generatorVersion).toBeDefined();
  });

  it('converts kebab-case names correctly', () => {
    const cases = [
      { input: 'simple', camel: 'simple', pascal: 'Simple' },
      { input: 'two-words', camel: 'twoWords', pascal: 'TwoWords' },
      { input: 'three-word-name', camel: 'threeWordName', pascal: 'ThreeWordName' },
      { input: 'with-numbers-123', camel: 'withNumbers123', pascal: 'WithNumbers123' },
    ];

    for (const { input, camel, pascal } of cases) {
      const rule: RuleConfig = {
        name: input,
        type: 'test',
        severity: 'error',
        config: {},
      };
      const context = buildRuleContext(rule, '/config.yml');
      expect(context.nameCamel).toBe(camel);
      expect(context.namePascal).toBe(pascal);
    }
  });
});
