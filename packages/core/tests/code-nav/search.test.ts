import { describe, it, expect } from 'vitest';
import { searchSymbols } from '../../src/code-nav/search';
import * as path from 'path';

const FIXTURES = path.resolve(__dirname, '../fixtures/code-nav');

describe('code_search', () => {
  it('should find a symbol by exact name', async () => {
    const result = await searchSymbols('AuthMiddleware', FIXTURES);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].symbol.name).toBe('AuthMiddleware');
    expect(result.matches[0].symbol.kind).toBe('class');
  });

  it('should find symbols by pattern', async () => {
    const result = await searchSymbols('create', FIXTURES);
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
    const names = result.matches.map((m) => m.symbol.name);
    expect(names).toContain('createAuthMiddleware');
    expect(names).toContain('createRouter');
  });

  it('should search across multiple languages', async () => {
    const result = await searchSymbols('Service', FIXTURES);
    const files = result.matches.map((m) => m.symbol.file);
    expect(files.some((f) => f.endsWith('.py'))).toBe(true);
  });

  it('should include context string for each match', async () => {
    const result = await searchSymbols('AuthMiddleware', FIXTURES);
    expect(result.matches[0].context).toBeTruthy();
    expect(result.matches[0].context.length).toBeGreaterThan(0);
  });

  it('should skip unsupported files and report them', async () => {
    const result = await searchSymbols('foo', FIXTURES);
    expect(result.skipped).toBeDefined();
    expect(Array.isArray(result.skipped)).toBe(true);
  });

  it('should return empty matches for non-existent symbol', async () => {
    const result = await searchSymbols('NonExistentSymbol12345', FIXTURES);
    expect(result.matches).toHaveLength(0);
  });

  it('should support glob pattern for scope', async () => {
    const result = await searchSymbols('AuthMiddleware', FIXTURES, '*.ts');
    expect(result.matches.length).toBeGreaterThan(0);
    result.matches.forEach((m) => {
      expect(m.symbol.file).toMatch(/\.ts$/);
    });
  });
});
