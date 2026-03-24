import { describe, it, expect } from 'vitest';
import { EntityExtractor } from '../../src/nlq/EntityExtractor.js';

const extractor = new EntityExtractor();

describe('EntityExtractor', () => {
  describe('quoted strings', () => {
    it('extracts double-quoted strings', () => {
      const result = extractor.extract('what depends on "AuthMiddleware"?');
      expect(result).toContain('AuthMiddleware');
    });

    it('extracts single-quoted strings', () => {
      const result = extractor.extract("where is 'UserService'?");
      expect(result).toContain('UserService');
    });

    it('extracts multiple quoted strings', () => {
      const result = extractor.extract('what connects "AuthMiddleware" to "UserService"?');
      expect(result).toContain('AuthMiddleware');
      expect(result).toContain('UserService');
    });

    it('does not include the quotes themselves', () => {
      const result = extractor.extract('find "AuthMiddleware"');
      expect(result).not.toContain('"AuthMiddleware"');
      expect(result).toContain('AuthMiddleware');
    });
  });

  describe('PascalCase and camelCase tokens', () => {
    it('extracts PascalCase tokens', () => {
      const result = extractor.extract('what calls UserService?');
      expect(result).toContain('UserService');
    });

    it('extracts camelCase tokens', () => {
      const result = extractor.extract('where is loginHandler?');
      expect(result).toContain('loginHandler');
    });

    it('extracts multiple cased tokens', () => {
      const result = extractor.extract('does UserService call loginHandler?');
      expect(result).toContain('UserService');
      expect(result).toContain('loginHandler');
    });

    it('does not extract ALL_CAPS words as camelCase', () => {
      const result = extractor.extract('what is the API?');
      // API is not PascalCase/camelCase — it's all caps
      expect(result).not.toContain('API');
    });
  });

  describe('file paths', () => {
    it('extracts file paths with extensions', () => {
      const result = extractor.extract('what depends on src/auth/middleware.ts?');
      expect(result).toContain('src/auth/middleware.ts');
    });

    it('extracts paths with .js extension', () => {
      const result = extractor.extract('find src/index.js');
      expect(result).toContain('src/index.js');
    });

    it('extracts paths starting with ./', () => {
      const result = extractor.extract('what is ./lib/utils.ts?');
      expect(result).toContain('./lib/utils.ts');
    });

    it('does not extract plain words without slashes as file paths', () => {
      const result = extractor.extract('what is middleware?');
      // 'middleware' should come from noun extraction, not file path extraction
      expect(result).toContain('middleware');
    });
  });

  describe('remaining significant nouns', () => {
    it('extracts nouns not consumed by intent keywords or stop words', () => {
      const result = extractor.extract('what breaks if I change auth?');
      expect(result).toContain('auth');
    });

    it('does not extract stop words', () => {
      const result = extractor.extract('what is the main entry point?');
      expect(result).not.toContain('the');
      expect(result).not.toContain('is');
    });

    it('does not extract intent keywords as entities', () => {
      const result = extractor.extract('find all controllers');
      // 'find' and 'all' are intent keywords for 'find'
      expect(result).not.toContain('find');
      expect(result).not.toContain('all');
      expect(result).toContain('controllers');
    });

    it('extracts multi-word entity context', () => {
      const result = extractor.extract('what breaks if I change the database layer?');
      expect(result).toContain('database');
      expect(result).toContain('layer');
    });
  });

  describe('deduplication', () => {
    it('returns each entity only once even if matched by multiple strategies', () => {
      const result = extractor.extract('what calls "UserService" and UserService?');
      const count = result.filter((e) => e === 'UserService').length;
      expect(count).toBe(1);
    });

    it('does not re-extract words from multi-word quoted strings as nouns', () => {
      const result = extractor.extract('what about "database layer"?');
      expect(result).toContain('database layer');
      expect(result).not.toContain('database');
      expect(result).not.toContain('layer');
    });
  });

  describe('priority order', () => {
    it('returns quoted strings before PascalCase tokens', () => {
      const result = extractor.extract('"ZModule" calls AModule');
      const zIdx = result.indexOf('ZModule');
      const aIdx = result.indexOf('AModule');
      expect(zIdx).toBeLessThan(aIdx);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty string', () => {
      const result = extractor.extract('');
      expect(result).toEqual([]);
    });

    it('returns empty array for only stop words', () => {
      const result = extractor.extract('the a an is are was were');
      expect(result).toEqual([]);
    });

    it('handles extra whitespace', () => {
      const result = extractor.extract('  what   calls   UserService  ?  ');
      expect(result).toContain('UserService');
    });

    it('strips trailing punctuation from extracted nouns', () => {
      const result = extractor.extract('what about auth?');
      expect(result).toContain('auth');
      expect(result).not.toContain('auth?');
    });

    it('handles queries with only intent keywords', () => {
      const result = extractor.extract('find where locate search');
      expect(result).toEqual([]);
    });
  });

  describe('mixed strategies', () => {
    it('extracts entities from all strategies in one query', () => {
      const result = extractor.extract(
        'what depends on "AuthMiddleware" at src/auth/middleware.ts and calls UserService for auth?'
      );
      expect(result).toContain('AuthMiddleware');
      expect(result).toContain('UserService');
      expect(result).toContain('src/auth/middleware.ts');
      expect(result).toContain('auth');
    });

    it('handles query with only a file path', () => {
      const result = extractor.extract('src/index.ts');
      expect(result).toContain('src/index.ts');
    });

    it('handles query with only a PascalCase token', () => {
      const result = extractor.extract('UserService');
      expect(result).toContain('UserService');
    });
  });
});
