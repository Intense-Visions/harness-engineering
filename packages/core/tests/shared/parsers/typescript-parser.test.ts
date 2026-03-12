import { describe, it, expect } from 'vitest';
import { TypeScriptParser } from '../../../src/shared/parsers/typescript';
import { join } from 'path';

describe('TypeScriptParser', () => {
  const parser = new TypeScriptParser();
  const fixturesDir = join(__dirname, '../../fixtures/typescript-samples');

  describe('parseFile', () => {
    it('should parse a valid TypeScript file', async () => {
      const path = join(fixturesDir, 'simple.ts');
      const result = await parser.parseFile(path);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.type).toBe('Program');
        expect(result.value.language).toBe('typescript');
        expect(result.value.body).toBeDefined();
      }
    });

    it('should return error for non-existent file', async () => {
      const path = join(fixturesDir, 'does-not-exist.ts');
      const result = await parser.parseFile(path);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('health', () => {
    it('should report parser as available', async () => {
      const result = await parser.health();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.available).toBe(true);
      }
    });
  });

  describe('extractImports', () => {
    it('should extract default imports', async () => {
      const path = join(fixturesDir, 'imports.ts');
      const parseResult = await parser.parseFile(path);
      expect(parseResult.ok).toBe(true);
      if (!parseResult.ok) return;

      const result = parser.extractImports(parseResult.value);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const fsImport = result.value.find(i => i.source === 'fs');
      expect(fsImport).toBeDefined();
      expect(fsImport?.default).toBe('fs');
      expect(fsImport?.kind).toBe('value');
    });

    it('should extract named imports', async () => {
      const path = join(fixturesDir, 'imports.ts');
      const parseResult = await parser.parseFile(path);
      if (!parseResult.ok) return;

      const result = parser.extractImports(parseResult.value);
      if (!result.ok) return;

      const pathImport = result.value.find(i => i.source === 'path');
      expect(pathImport).toBeDefined();
      expect(pathImport?.specifiers).toContain('join');
      expect(pathImport?.specifiers).toContain('resolve');
    });

    it('should extract namespace imports', async () => {
      const path = join(fixturesDir, 'imports.ts');
      const parseResult = await parser.parseFile(path);
      if (!parseResult.ok) return;

      const result = parser.extractImports(parseResult.value);
      if (!result.ok) return;

      const osImport = result.value.find(i => i.source === 'os');
      expect(osImport).toBeDefined();
      expect(osImport?.namespace).toBe('os');
    });

    it('should identify type-only imports', async () => {
      const path = join(fixturesDir, 'imports.ts');
      const parseResult = await parser.parseFile(path);
      if (!parseResult.ok) return;

      const result = parser.extractImports(parseResult.value);
      if (!result.ok) return;

      const typeImports = result.value.filter(i => i.kind === 'type');
      expect(typeImports.length).toBeGreaterThan(0);
      expect(typeImports.some(i => i.specifiers.includes('Stats'))).toBe(true);
    });

    it('should include location information', async () => {
      const path = join(fixturesDir, 'imports.ts');
      const parseResult = await parser.parseFile(path);
      if (!parseResult.ok) return;

      const result = parser.extractImports(parseResult.value);
      if (!result.ok) return;

      const firstImport = result.value[0];
      expect(firstImport.location.line).toBeGreaterThan(0);
      expect(firstImport.location.column).toBeGreaterThanOrEqual(0);
    });
  });
});
