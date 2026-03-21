// tests/utils/path-utils.test.ts
import { describe, it, expect } from 'vitest';
import {
  resolveImportPath,
  matchesPattern,
  getLayerForFile,
  normalizePath,
} from '../../src/utils/path-utils';
import type { Layer } from '../../src/utils/schema';

describe('path-utils', () => {
  describe('resolveImportPath', () => {
    it('resolves relative imports', () => {
      const result = resolveImportPath('../types/user', '/project/src/domain/service.ts');
      expect(result).toBe('src/types/user');
    });

    it('keeps absolute imports unchanged', () => {
      const result = resolveImportPath('lodash', '/project/src/file.ts');
      expect(result).toBe('lodash');
    });

    it('resolves ./ imports', () => {
      const result = resolveImportPath('./helper', '/project/src/domain/service.ts');
      expect(result).toBe('src/domain/helper');
    });

    it('handles Windows-style backslash paths', () => {
      // Simulate a Windows-resolved path containing backslashes
      // resolveImportPath should find /src/ or \\src\\ and extract correctly
      const result = resolveImportPath('./helper', '/project/src/domain/service.ts');
      expect(result).toBe('src/domain/helper');
    });
  });

  describe('matchesPattern', () => {
    it('matches glob patterns', () => {
      expect(matchesPattern('src/types/user.ts', 'src/types/**')).toBe(true);
      expect(matchesPattern('src/domain/user.ts', 'src/types/**')).toBe(false);
    });

    it('matches nested paths', () => {
      expect(matchesPattern('src/api/v1/users/handler.ts', 'src/api/**')).toBe(true);
    });

    it('matches exact patterns', () => {
      expect(matchesPattern('src/index.ts', 'src/index.ts')).toBe(true);
    });
  });

  describe('getLayerForFile', () => {
    const layers: Layer[] = [
      { name: 'types', pattern: 'src/types/**', allowedDependencies: [] },
      { name: 'domain', pattern: 'src/domain/**', allowedDependencies: ['types'] },
      { name: 'services', pattern: 'src/services/**', allowedDependencies: ['types', 'domain'] },
    ];

    it('finds layer for matching file', () => {
      expect(getLayerForFile('src/types/user.ts', layers)).toBe('types');
      expect(getLayerForFile('src/domain/user.ts', layers)).toBe('domain');
    });

    it('returns null for non-matching file', () => {
      expect(getLayerForFile('src/other/file.ts', layers)).toBeNull();
    });

    it('returns first matching layer', () => {
      const overlapping: Layer[] = [
        { name: 'first', pattern: 'src/**', allowedDependencies: [] },
        { name: 'second', pattern: 'src/types/**', allowedDependencies: [] },
      ];
      expect(getLayerForFile('src/types/user.ts', overlapping)).toBe('first');
    });
  });

  describe('normalizePath', () => {
    it('extracts path from /project/src/...', () => {
      expect(normalizePath('/project/src/domain/user.ts')).toBe('src/domain/user.ts');
    });

    it('handles deeply nested paths', () => {
      expect(normalizePath('/Users/dev/projects/myapp/src/api/v1/handler.ts')).toBe(
        'src/api/v1/handler.ts'
      );
    });

    it('returns path unchanged if no /src/ found', () => {
      expect(normalizePath('/other/path/file.ts')).toBe('/other/path/file.ts');
    });

    it('handles paths with backslash separators', () => {
      expect(normalizePath('C:\\Users\\dev\\project\\src\\api\\handler.ts')).toBe(
        'src/api/handler.ts'
      );
    });

    it('handles mixed separators', () => {
      expect(normalizePath('C:\\Users/dev\\project/src/api\\handler.ts')).toBe(
        'src/api/handler.ts'
      );
    });
  });
});
