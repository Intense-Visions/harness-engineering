import { describe, it, expect } from 'vitest';
import { renderTemplate, TemplateError } from '../../src/engine/template-renderer';
import type { RuleContext } from '../../src/engine/context-builder';

describe('renderTemplate', () => {
  const mockContext: RuleContext = {
    name: 'no-ui-in-services',
    nameCamel: 'noUiInServices',
    namePascal: 'NoUiInServices',
    severity: 'error',
    config: {
      source: 'src/services/**',
      forbiddenImports: ['react', 'src/ui/**'],
      message: 'No UI in services',
    },
    meta: {
      generatedAt: '2026-03-13T00:00:00.000Z',
      generatorVersion: '0.1.0',
      configPath: '/path/to/config.yml',
    },
  };

  it('renders simple template with context', () => {
    const template = 'Rule name: {{name}}';
    const result = renderTemplate(template, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe('Rule name: no-ui-in-services');
    }
  });

  it('provides json helper for serialization', () => {
    const template = 'const forbidden = {{{json config.forbiddenImports}}};';
    const result = renderTemplate(template, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe('const forbidden = ["react","src/ui/**"];');
    }
  });

  it('provides jsonPretty helper for formatted output', () => {
    const template = 'const forbidden = {{{jsonPretty config.forbiddenImports}}};';
    const result = renderTemplate(template, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain('[\n');
      expect(result.output).toContain('"react"');
    }
  });

  it('provides camelCase helper', () => {
    const template = '{{camelCase "some-kebab-name"}}';
    const result = renderTemplate(template, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe('someKebabName');
    }
  });

  it('provides pascalCase helper', () => {
    const template = '{{pascalCase "some-kebab-name"}}';
    const result = renderTemplate(template, mockContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe('SomeKebabName');
    }
  });

  it('returns error for invalid template syntax', () => {
    const template = '{{#if unclosed';
    const result = renderTemplate(template, mockContext);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(TemplateError);
    }
  });
});
