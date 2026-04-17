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

    it('should detect Go files', () => {
      expect(detectLanguage('foo.go')).toBe('go');
    });

    it('should detect Rust files', () => {
      expect(detectLanguage('foo.rs')).toBe('rust');
    });

    it('should detect Java files', () => {
      expect(detectLanguage('foo.java')).toBe('java');
    });

    it('should return null for unsupported extensions', () => {
      expect(detectLanguage('foo.md')).toBeNull();
      expect(detectLanguage('foo.xyz')).toBeNull();
    });
  });

  it('should have all expected extensions in EXTENSION_MAP', () => {
    expect(Object.keys(EXTENSION_MAP)).toHaveLength(12);
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
