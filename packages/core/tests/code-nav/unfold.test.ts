import { describe, it, expect, vi } from 'vitest';
import { unfoldSymbol, unfoldRange } from '../../src/code-nav/unfold';
import * as path from 'path';

const FIXTURES = path.resolve(__dirname, '../fixtures/code-nav');

describe('code_unfold', () => {
  describe('unfoldSymbol', () => {
    it('should extract a function by name from TypeScript', async () => {
      const result = await unfoldSymbol(path.join(FIXTURES, 'sample.ts'), 'createAuthMiddleware');
      expect(result.fallback).toBe(false);
      expect(result.symbolName).toBe('createAuthMiddleware');
      expect(result.content).toContain('function createAuthMiddleware');
      expect(result.content).toContain('return new AuthMiddleware');
      expect(result.startLine).toBeGreaterThan(0);
    });

    it('should extract a class by name', async () => {
      const result = await unfoldSymbol(path.join(FIXTURES, 'sample.ts'), 'AuthMiddleware');
      expect(result.fallback).toBe(false);
      expect(result.content).toContain('class AuthMiddleware');
      expect(result.content).toContain('authenticate');
      expect(result.content).toContain('refreshToken');
    });

    it('should extract a function from Python', async () => {
      const result = await unfoldSymbol(path.join(FIXTURES, 'sample.py'), 'create_service');
      expect(result.fallback).toBe(false);
      expect(result.content).toContain('def create_service');
    });

    it('should fall back to raw content for unsupported files', async () => {
      const result = await unfoldSymbol('/tmp/test.xyz', 'foo');
      expect(result.fallback).toBe(true);
      expect(result.warning).toBe('[fallback: raw content]');
    });

    it('should extract a function from Go', async () => {
      const result = await unfoldSymbol(path.join(FIXTURES, 'sample.go'), 'NewAuthMiddleware');
      expect(result.fallback).toBe(false);
      expect(result.content).toContain('func NewAuthMiddleware');
    });

    it('should extract a function from Rust', async () => {
      const result = await unfoldSymbol(path.join(FIXTURES, 'sample.rs'), 'create_middleware');
      expect(result.fallback).toBe(false);
      expect(result.content).toContain('fn create_middleware');
    });

    it('should extract a class from Java', async () => {
      const result = await unfoldSymbol(path.join(FIXTURES, 'sample.java'), 'AuthMiddleware');
      expect(result.fallback).toBe(false);
      expect(result.content).toContain('class AuthMiddleware');
    });

    it('should fall back when symbol not found', async () => {
      const result = await unfoldSymbol(path.join(FIXTURES, 'sample.ts'), 'NonExistentSymbol');
      // Returns the whole file as fallback when symbol is not found
      expect(result.fallback).toBe(true);
      expect(result.warning).toBe('[fallback: raw content]');
    });
  });

  describe('unfoldRange', () => {
    it('should extract lines by range', async () => {
      const result = await unfoldRange(path.join(FIXTURES, 'sample.ts'), 1, 5);
      expect(result.fallback).toBe(false);
      expect(result.startLine).toBe(1);
      expect(result.endLine).toBe(5);
      expect(result.content.split('\n').length).toBeLessThanOrEqual(5);
    });

    it('should clamp range to file bounds', async () => {
      const result = await unfoldRange(path.join(FIXTURES, 'sample.ts'), 1, 99999);
      expect(result.fallback).toBe(false);
      expect(result.endLine).toBeLessThan(99999);
    });

    it('should return fallback for non-existent file', async () => {
      const result = await unfoldRange('/tmp/nonexistent-unfold-test.ts', 1, 10);
      expect(result.fallback).toBe(true);
      expect(result.content).toBe('');
      expect(result.startLine).toBe(0);
      expect(result.endLine).toBe(0);
      expect(result.warning).toBe('[fallback: raw content]');
    });
  });

  describe('unfoldSymbol edge cases', () => {
    it('should fall back when outline returns an error', async () => {
      const outline = await import('../../src/code-nav/outline');
      const spy = vi.spyOn(outline, 'getOutline').mockResolvedValueOnce({
        file: path.join(FIXTURES, 'sample.ts'),
        language: 'typescript',
        totalLines: 0,
        symbols: [],
        error: '[parse-failed]',
      });
      const result = await unfoldSymbol(path.join(FIXTURES, 'sample.ts'), 'AuthMiddleware');
      expect(result.fallback).toBe(true);
      expect(result.warning).toBe('[fallback: raw content]');
      spy.mockRestore();
    });

    it('should fall back with symbol range when parseFile fails after outline succeeds', async () => {
      const outline = await import('../../src/code-nav/outline');
      const parserMod = await import('../../src/code-nav/parser');

      // First, get a real outline so we know the symbol exists
      const realOutline = await outline.getOutline(path.join(FIXTURES, 'sample.ts'));
      const authSym = realOutline.symbols.find((s) => s.name === 'AuthMiddleware');
      expect(authSym).toBeDefined();

      // Mock getOutline to return the real result, and parseFile to fail
      const outlineSpy = vi.spyOn(outline, 'getOutline').mockResolvedValueOnce(realOutline);
      const parseSpy = vi.spyOn(parserMod, 'parseFile').mockResolvedValueOnce({
        ok: false as const,
        error: { code: 'PARSE_FAILED' as const, message: 'boom' },
      });

      const result = await unfoldSymbol(path.join(FIXTURES, 'sample.ts'), 'AuthMiddleware');
      expect(result.fallback).toBe(true);
      expect(result.startLine).toBe(authSym!.line);
      expect(result.endLine).toBe(authSym!.endLine);
      outlineSpy.mockRestore();
      parseSpy.mockRestore();
    });
  });
});
