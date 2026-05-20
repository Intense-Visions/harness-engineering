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

    it('handles Windows-style backslash paths via normalizePath', () => {
      // resolveImportPath calls path.resolve which normalizes separators on
      // the current OS, so backslash normalization only fires on Windows.
      // Test the normalization logic indirectly through normalizePath which
      // uses the same .replace(/\\/g, '/') + indexOf('/src/') pattern.
      expect(normalizePath('C:\\project\\src\\domain\\helper')).toBe('src/domain/helper');
    });

    it('returns original importPath when resolved path has no /src/ and no projectRoot', () => {
      // Final fallback path: relative import resolves to a location outside
      // any /src/ boundary, no projectRoot anchor — return import unchanged.
      expect(resolveImportPath('../sibling', '/lib/pkg/foo.ts')).toBe('../sibling');
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

    describe('with projectRoot (monorepo)', () => {
      it('preserves package prefix when file is under projectRoot', () => {
        expect(normalizePath('/abs/repo/packages/types/src/foo.ts', '/abs/repo')).toBe(
          'packages/types/src/foo.ts'
        );
      });

      it('handles files without /src/ when projectRoot supplied', () => {
        // No /src/ in path — the project-root anchor must win over the fallback,
        // not fall back to returning the absolute path.
        expect(normalizePath('/abs/repo/apps/web/app/foo.tsx', '/abs/repo')).toBe(
          'apps/web/app/foo.tsx'
        );
      });

      it('falls back to /src/ heuristic when file is outside projectRoot', () => {
        expect(normalizePath('/elsewhere/pkg/src/foo.ts', '/abs/repo')).toBe('src/foo.ts');
      });

      it('treats trailing-slash projectRoot the same as no trailing slash', () => {
        expect(normalizePath('/abs/repo/packages/types/src/foo.ts', '/abs/repo/')).toBe(
          'packages/types/src/foo.ts'
        );
      });

      it('preserves legacy behavior when projectRoot is omitted', () => {
        // Existing single-package projects must keep working.
        expect(normalizePath('/abs/repo/packages/types/src/foo.ts')).toBe('src/foo.ts');
      });
    });
  });

  describe('resolveImportPath with projectRoot (monorepo)', () => {
    // These cases exercise `path.resolve`, which on Windows prepends a drive
    // letter to Unix-style absolute paths (e.g. '/abs/repo/...' becomes
    // 'D:/abs/repo/...'). That breaks the synthetic Unix path setup but
    // cannot happen in real Windows ESLint usage, where both
    // `context.filename` and the `getConfigRoot` result share a drive
    // prefix. The integration test exercises real cross-platform paths.
    const skipOnWindows = process.platform === 'win32';

    it.skipIf(skipOnWindows)(
      'returns project-root-relative path preserving package identity',
      () => {
        // packages/types/src/foo.ts importing '../api' resolves to
        // packages/types/api which the legacy /src/ heuristic would mangle.
        expect(
          resolveImportPath('../api', '/abs/repo/packages/types/src/foo.ts', '/abs/repo')
        ).toBe('packages/types/api');
      }
    );

    it.skipIf(skipOnWindows)('resolves intra-package imports under projectRoot', () => {
      expect(
        resolveImportPath('./helper', '/abs/repo/packages/types/src/foo.ts', '/abs/repo')
      ).toBe('packages/types/src/helper');
    });

    it.skipIf(skipOnWindows)('handles trailing-slash projectRoot', () => {
      expect(
        resolveImportPath('./helper', '/abs/repo/packages/types/src/foo.ts', '/abs/repo/')
      ).toBe('packages/types/src/helper');
    });

    it('falls back to legacy /src/ heuristic when projectRoot is omitted', () => {
      // Existing test parity: no projectRoot threaded through.
      expect(resolveImportPath('../types/user', '/project/src/domain/service.ts')).toBe(
        'src/types/user'
      );
    });

    it('keeps absolute imports unchanged even with projectRoot', () => {
      expect(resolveImportPath('lodash', '/abs/repo/packages/types/src/foo.ts', '/abs/repo')).toBe(
        'lodash'
      );
    });
  });
});
