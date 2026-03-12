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
});
