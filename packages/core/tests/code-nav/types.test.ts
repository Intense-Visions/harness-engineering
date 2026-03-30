import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  EXTENSION_MAP,
  type CodeSymbol,
  type OutlineResult,
  type SearchResult,
  type UnfoldResult,
} from '../../src/code-nav/types';

describe('code-nav types', () => {
  describe('detectLanguage', () => {
    it('should detect TypeScript files', () => {
      expect(detectLanguage('foo.ts')).toBe('typescript');
      expect(detectLanguage('bar.tsx')).toBe('typescript');
      expect(detectLanguage('baz.mts')).toBe('typescript');
      expect(detectLanguage('qux.cts')).toBe('typescript');
    });

    it('should detect JavaScript files', () => {
      expect(detectLanguage('foo.js')).toBe('javascript');
      expect(detectLanguage('bar.jsx')).toBe('javascript');
      expect(detectLanguage('baz.mjs')).toBe('javascript');
    });

    it('should detect Python files', () => {
      expect(detectLanguage('foo.py')).toBe('python');
    });

    it('should return null for unsupported extensions', () => {
      expect(detectLanguage('foo.rs')).toBeNull();
      expect(detectLanguage('foo.go')).toBeNull();
      expect(detectLanguage('foo.md')).toBeNull();
    });
  });

  it('should have all expected extensions in EXTENSION_MAP', () => {
    expect(Object.keys(EXTENSION_MAP)).toHaveLength(9);
  });

  it('should allow constructing CodeSymbol', () => {
    const sym: CodeSymbol = {
      name: 'myFunc',
      kind: 'function',
      file: 'test.ts',
      line: 1,
      endLine: 10,
      signature: 'function myFunc(): void',
    };
    expect(sym.kind).toBe('function');
  });
});
