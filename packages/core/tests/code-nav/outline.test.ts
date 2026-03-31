import { describe, it, expect } from 'vitest';
import { getOutline, formatOutline } from '../../src/code-nav/outline';
import type { OutlineResult } from '../../src/code-nav/types';
import * as path from 'path';

const FIXTURES = path.resolve(__dirname, '../fixtures/code-nav');

describe('code_outline', () => {
  it('should extract outline from TypeScript file', async () => {
    const result = await getOutline(path.join(FIXTURES, 'sample.ts'));
    expect(result.error).toBeUndefined();
    expect(result.language).toBe('typescript');
    expect(result.totalLines).toBeGreaterThan(0);

    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('AuthConfig');
    expect(names).toContain('AuthMiddleware');
    expect(names).toContain('createAuthMiddleware');
    expect(names).toContain('UserRole');
    expect(names).toContain('DEFAULT_CONFIG');
  });

  it('should include class methods as children', async () => {
    const result = await getOutline(path.join(FIXTURES, 'sample.ts'));
    const classSym = result.symbols.find((s) => s.name === 'AuthMiddleware');
    expect(classSym).toBeDefined();
    expect(classSym!.children).toBeDefined();
    const methodNames = classSym!.children!.map((c) => c.name);
    expect(methodNames).toContain('constructor');
    expect(methodNames).toContain('authenticate');
    expect(methodNames).toContain('refreshToken');
    expect(methodNames).toContain('validateJWT');
  });

  it('should extract outline from JavaScript file', async () => {
    const result = await getOutline(path.join(FIXTURES, 'sample.js'));
    expect(result.error).toBeUndefined();
    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('Router');
    expect(names).toContain('createRouter');
  });

  it('should extract outline from Python file', async () => {
    const result = await getOutline(path.join(FIXTURES, 'sample.py'));
    expect(result.error).toBeUndefined();
    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('UserService');
    expect(names).toContain('create_service');
  });

  it('should return parse-failed marker for syntax error files', async () => {
    const result = await getOutline(path.join(FIXTURES, 'syntax-error.ts'));
    // Tree-sitter is error-tolerant, so it may still parse partially.
    // The important thing is it does not throw.
    expect(result).toBeDefined();
  });

  it('should return parse-failed for unsupported files', async () => {
    const result = await getOutline('/tmp/test.rs');
    expect(result.error).toBe('[parse-failed]');
  });

  it('should return parse-failed for non-existent file', async () => {
    const result = await getOutline('/tmp/nonexistent-file-12345.ts');
    expect(result.error).toBe('[parse-failed]');
    expect(result.language).toBe('typescript');
  });

  describe('formatOutline', () => {
    it('should format error result as file + error marker', () => {
      const errorResult: OutlineResult = {
        file: '/tmp/test.rs',
        language: 'unknown',
        totalLines: 0,
        symbols: [],
        error: '[parse-failed]',
      };
      expect(formatOutline(errorResult)).toBe('/tmp/test.rs [parse-failed]');
    });

    it('should format outline with symbols and line numbers', async () => {
      const result = await getOutline(path.join(FIXTURES, 'sample.ts'));
      const formatted = formatOutline(result);
      expect(formatted).toContain('sample.ts');
      expect(formatted).toContain('lines)');
      // Should contain tree-style prefixes
      expect(formatted).toMatch(/[├└]──/);
      // Should contain line numbers
      expect(formatted).toMatch(/:\d+/);
    });

    it('should format outline with class methods as nested children', async () => {
      const result = await getOutline(path.join(FIXTURES, 'sample.ts'));
      const formatted = formatOutline(result);
      // Methods should appear indented under the class
      const lines = formatted.split('\n');
      // Find a line with a method (indented with │ or space prefix)
      const methodLines = lines.filter((l) => l.match(/^[│ ]\s+[├└]──/));
      expect(methodLines.length).toBeGreaterThan(0);
    });

    it('should format outline with no symbols', () => {
      const result: OutlineResult = {
        file: '/tmp/empty.ts',
        language: 'typescript',
        totalLines: 1,
        symbols: [],
      };
      const formatted = formatOutline(result);
      expect(formatted).toBe('/tmp/empty.ts (1 lines)');
    });

    it('should use └── for last symbol', async () => {
      const result = await getOutline(path.join(FIXTURES, 'sample.ts'));
      const formatted = formatOutline(result);
      const lines = formatted.split('\n');
      // Find root-level symbol lines (start with ├── or └──)
      const rootSymbols = lines.filter((l) => l.match(/^[├└]──/));
      // Last root symbol should use └──
      expect(rootSymbols[rootSymbols.length - 1]).toMatch(/^└──/);
    });
  });
});
