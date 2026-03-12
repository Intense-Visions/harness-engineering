import type { Result } from '../../shared/result';
import { Ok } from '../../shared/result';
import type {
  EntropyError,
  CodebaseSnapshot,
  DeadCodeConfig,
  DeadCodeReport,
  DeadExport,
  DeadFile,
  DeadInternal,
  UnusedImport,
  ReachabilityNode,
} from '../types';
import { dirname, resolve } from 'path';

const DEFAULT_DEAD_CODE_CONFIG: DeadCodeConfig = {
  includeTypes: true,
  includeInternals: true,
  ignorePatterns: [],
  treatDynamicImportsAs: 'used',
};

/**
 * Resolve import source to absolute path
 */
function resolveImportToFile(
  importSource: string,
  fromFile: string,
  snapshot: CodebaseSnapshot
): string | null {
  if (!importSource.startsWith('.')) {
    return null; // External package
  }

  const fromDir = dirname(fromFile);
  let resolved = resolve(fromDir, importSource);

  // Try with .ts extension
  if (!resolved.endsWith('.ts') && !resolved.endsWith('.tsx')) {
    const withTs = resolved + '.ts';
    if (snapshot.files.some(f => f.path === withTs)) {
      return withTs;
    }
    const withIndex = resolve(resolved, 'index.ts');
    if (snapshot.files.some(f => f.path === withIndex)) {
      return withIndex;
    }
  }

  if (snapshot.files.some(f => f.path === resolved)) {
    return resolved;
  }

  return null;
}

/**
 * Build a map of file reachability from entry points
 */
export function buildReachabilityMap(
  snapshot: CodebaseSnapshot
): Map<string, boolean> {
  const reachability = new Map<string, boolean>();

  // Initialize all files as unreachable
  for (const file of snapshot.files) {
    reachability.set(file.path, false);
  }

  // BFS from entry points
  const queue = [...snapshot.entryPoints];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) continue;
    visited.add(current);

    // Mark as reachable
    reachability.set(current, true);

    // Find the source file
    const sourceFile = snapshot.files.find(f => f.path === current);
    if (!sourceFile) continue;

    // Add all imports to queue
    for (const imp of sourceFile.imports) {
      const resolved = resolveImportToFile(imp.source, current, snapshot);
      if (resolved && !visited.has(resolved)) {
        queue.push(resolved);
      }
    }

    // Add re-exports (export { x } from './module') to queue
    for (const exp of sourceFile.exports) {
      if (exp.isReExport && exp.source) {
        const resolved = resolveImportToFile(exp.source, current, snapshot);
        if (resolved && !visited.has(resolved)) {
          queue.push(resolved);
        }
      }
    }
  }

  return reachability;
}
