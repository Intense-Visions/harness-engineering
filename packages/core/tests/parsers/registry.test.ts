import { describe, it, expect, beforeEach } from 'vitest';
import {
  ParserRegistry,
  getDefaultRegistry,
  resetDefaultRegistry,
} from '../../src/shared/parsers/registry';

describe('ParserRegistry', () => {
  beforeEach(() => {
    resetDefaultRegistry();
  });

  describe('getDefaultRegistry', () => {
    it('should return a registry with all built-in languages', () => {
      const registry = getDefaultRegistry();
      const langs = registry.getSupportedLanguages();
      expect(langs).toContain('typescript');
      expect(langs).toContain('javascript');
      expect(langs).toContain('python');
      expect(langs).toContain('go');
      expect(langs).toContain('rust');
      expect(langs).toContain('java');
    });

    it('should cache the registry singleton', () => {
      const r1 = getDefaultRegistry();
      const r2 = getDefaultRegistry();
      expect(r1).toBe(r2);
    });

    it('should support all expected extensions', () => {
      const registry = getDefaultRegistry();
      const exts = registry.getSupportedExtensions();
      expect(exts).toContain('.ts');
      expect(exts).toContain('.go');
      expect(exts).toContain('.rs');
      expect(exts).toContain('.java');
      expect(exts).toContain('.py');
    });
  });

  describe('getForFile', () => {
    it('should return TypeScript parser for .ts files', () => {
      const registry = getDefaultRegistry();
      const parser = registry.getForFile('src/main.ts');
      expect(parser).not.toBeNull();
      expect(parser!.name).toBe('typescript');
    });

    it('should return Go parser for .go files', () => {
      const registry = getDefaultRegistry();
      const parser = registry.getForFile('main.go');
      expect(parser).not.toBeNull();
      expect(parser!.name).toBe('go');
    });

    it('should return Rust parser for .rs files', () => {
      const registry = getDefaultRegistry();
      const parser = registry.getForFile('lib.rs');
      expect(parser).not.toBeNull();
      expect(parser!.name).toBe('rust');
    });

    it('should return Java parser for .java files', () => {
      const registry = getDefaultRegistry();
      const parser = registry.getForFile('Main.java');
      expect(parser).not.toBeNull();
      expect(parser!.name).toBe('java');
    });

    it('should return null for unsupported files', () => {
      const registry = getDefaultRegistry();
      expect(registry.getForFile('README.md')).toBeNull();
    });
  });

  describe('isSupportedExtension', () => {
    it('should return true for supported extensions', () => {
      const registry = getDefaultRegistry();
      expect(registry.isSupportedExtension('.ts')).toBe(true);
      expect(registry.isSupportedExtension('.go')).toBe(true);
      expect(registry.isSupportedExtension('.rs')).toBe(true);
      expect(registry.isSupportedExtension('.java')).toBe(true);
    });

    it('should return false for unsupported extensions', () => {
      const registry = getDefaultRegistry();
      expect(registry.isSupportedExtension('.md')).toBe(false);
      expect(registry.isSupportedExtension('.xyz')).toBe(false);
    });
  });
});
