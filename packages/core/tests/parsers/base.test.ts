import { describe, it, expect } from 'vitest';
import type { AST, Location, Import, Export, ParseError, LanguageParser } from '../../src/shared/parsers/base';

describe('Parser Base Types', () => {
  it('should define AST type correctly', () => {
    const ast: AST = {
      type: 'Program',
      body: { statements: [] },
      language: 'typescript',
    };

    expect(ast.type).toBe('Program');
    expect(ast.language).toBe('typescript');
  });

  it('should define Location type correctly', () => {
    const location: Location = {
      file: 'test.ts',
      line: 10,
      column: 5,
    };

    expect(location.file).toBe('test.ts');
    expect(location.line).toBe(10);
  });

  it('should define Import type correctly', () => {
    const imp: Import = {
      source: './module',
      specifiers: ['foo', 'bar'],
      default: 'Module',
      namespace: undefined,
      location: { file: 'test.ts', line: 1, column: 0 },
      kind: 'value',
    };

    expect(imp.source).toBe('./module');
    expect(imp.specifiers).toContain('foo');
    expect(imp.kind).toBe('value');
  });

  it('should define Export type correctly', () => {
    const exp: Export = {
      name: 'myFunction',
      type: 'named',
      location: { file: 'test.ts', line: 5, column: 0 },
      isReExport: false,
    };

    expect(exp.name).toBe('myFunction');
    expect(exp.type).toBe('named');
    expect(exp.isReExport).toBe(false);
  });

  it('should define ParseError type correctly', () => {
    const error: ParseError = {
      code: 'SYNTAX_ERROR',
      message: 'Unexpected token',
      details: { path: 'test.ts', line: 10 },
      suggestions: ['Check syntax near line 10'],
    };

    expect(error.code).toBe('SYNTAX_ERROR');
    expect(error.suggestions).toHaveLength(1);
  });
});
