import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { EntropyError } from './types';
import { createEntropyError } from '../shared/errors';
import { readFileContent, fileExists } from '../shared/fs-utils';
import { join, resolve } from 'path';

/**
 * Resolve entry points for dead code analysis
 *
 * Entry points are the starting files from which reachability analysis begins.
 * The resolution order is:
 * 1. Explicit entries provided as arguments
 * 2. package.json exports/main/bin fields
 * 3. Conventional entry files (src/index.ts, index.ts, etc.)
 */
export async function resolveEntryPoints(
  rootDir: string,
  explicitEntries?: string[]
): Promise<Result<string[], EntropyError>> {
  // 1. Use explicit entries if provided
  if (explicitEntries && explicitEntries.length > 0) {
    const resolved = explicitEntries.map(e => resolve(rootDir, e));
    return Ok(resolved);
  }

  // 2. Try package.json
  const pkgPath = join(rootDir, 'package.json');
  if (await fileExists(pkgPath)) {
    const pkgContent = await readFileContent(pkgPath);
    if (pkgContent.ok) {
      try {
        const pkg = JSON.parse(pkgContent.value);
        const entries: string[] = [];

        // Check exports field
        if (pkg.exports) {
          if (typeof pkg.exports === 'string') {
            entries.push(resolve(rootDir, pkg.exports));
          } else if (typeof pkg.exports === 'object') {
            for (const value of Object.values(pkg.exports)) {
              if (typeof value === 'string') {
                entries.push(resolve(rootDir, value));
              }
            }
          }
        }

        // Check main field
        if (pkg.main && entries.length === 0) {
          entries.push(resolve(rootDir, pkg.main));
        }

        // Check bin field
        if (pkg.bin) {
          if (typeof pkg.bin === 'string') {
            entries.push(resolve(rootDir, pkg.bin));
          } else if (typeof pkg.bin === 'object') {
            for (const value of Object.values(pkg.bin)) {
              if (typeof value === 'string') {
                entries.push(resolve(rootDir, value));
              }
            }
          }
        }

        if (entries.length > 0) {
          return Ok(entries);
        }
      } catch {
        // Invalid JSON, fall through to conventions
      }
    }
  }

  // 3. Fall back to conventions
  const conventions = ['src/index.ts', 'src/main.ts', 'index.ts', 'main.ts'];
  for (const conv of conventions) {
    const convPath = join(rootDir, conv);
    if (await fileExists(convPath)) {
      return Ok([convPath]);
    }
  }

  return Err(
    createEntropyError(
      'ENTRY_POINT_NOT_FOUND',
      'Could not resolve entry points',
      { reason: 'No package.json exports/main and no conventional entry files found' },
      ['Add "exports" or "main" to package.json', 'Create src/index.ts', 'Specify entryPoints in config']
    )
  );
}
