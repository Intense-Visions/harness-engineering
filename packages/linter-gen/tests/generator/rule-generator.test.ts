import { describe, it, expect } from 'vitest';
import { generateRule, type GeneratedRule } from '../../src/generator/rule-generator';
import type { RuleConfig } from '../../src/schema/linter-config';
import type { TemplateSource } from '../../src/engine/template-loader';

describe('generateRule', () => {
  const mockTemplate: TemplateSource = {
    type: 'builtin',
    path: '/path/to/template.ts.hbs',
    content: `// Generated rule: {{name}}
export default {
  name: '{{name}}',
  severity: '{{severity}}',
  config: {{{json config}}},
};`,
  };

  it('generates rule file from template and config', () => {
    const rule: RuleConfig = {
      name: 'no-ui-in-services',
      type: 'import-restriction',
      severity: 'error',
      config: {
        source: 'src/services/**',
        forbiddenImports: ['react'],
      },
    };

    const result = generateRule(rule, mockTemplate, './generated', '/config.yml');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.rule.name).toBe('no-ui-in-services');
      expect(result.rule.outputPath).toBe('generated/no-ui-in-services.ts');
      expect(result.rule.content).toContain("name: 'no-ui-in-services'");
      expect(result.rule.content).toContain("severity: 'error'");
      expect(result.rule.content).toContain('"forbiddenImports":["react"]');
    }
  });

  it('returns error if template rendering fails', () => {
    const rule: RuleConfig = {
      name: 'test-rule',
      type: 'test',
      severity: 'warn',
      config: {},
    };

    const badTemplate: TemplateSource = {
      type: 'convention',
      path: '/path/to/bad.ts.hbs',
      content: '{{#if unclosed}',
    };

    const result = generateRule(rule, badTemplate, './generated', '/config.yml');

    expect(result.success).toBe(false);
  });
});
