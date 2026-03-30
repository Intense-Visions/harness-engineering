import { describe, it, expect } from 'vitest';
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
      const result = await unfoldSymbol('/tmp/test.rs', 'foo');
      expect(result.fallback).toBe(true);
      expect(result.warning).toBe('[fallback: raw content]');
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
  });
});
