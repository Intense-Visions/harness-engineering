import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.go', '.py']);

/**
 * Convert a simple glob pattern to a regex for matching file paths.
 * Handles: ** (any path), * (any segment), and literal strings.
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex chars
    .replace(/\*\*/g, '§§') // temp placeholder for **
    .replace(/\*/g, '[^/]*') // * matches within segment
    .replace(/§§/g, '.*'); // ** matches across segments
  return new RegExp(escaped);
}

/**
 * Check if a file path matches any of the exclude patterns.
 */
function isExcluded(relativePath: string, excludeRegexes: RegExp[]): boolean {
  for (const regex of excludeRegexes) {
    if (regex.test(relativePath)) return true;
  }
  return false;
}

/**
 * Walk a directory iteratively (BFS via explicit queue), collecting source files.
 *
 * Iterative on purpose — see {@link DEFAULT_SKIP_DIRS} for the bug history.
 * The shared default skip-list is sourced from `@harness-engineering/graph` so
 * this MCP walker, the CLI scanner, and the graph ingester stay in sync.
 */
async function walkDir(rootDir: string, excludeRegexes: RegExp[], files: string[]): Promise<void> {
  const queue: string[] = [rootDir];

  while (queue.length > 0) {
    const dir = queue.pop()!;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // permission denied, broken symlink, or vanished directory
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath).replaceAll('\\', '/');

      if (entry.isDirectory()) {
        if (DEFAULT_SKIP_DIRS.has(entry.name)) continue;
        if (isExcluded(relativePath + '/', excludeRegexes)) continue;
        queue.push(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (!SOURCE_EXTENSIONS.has(ext)) continue;
        if (isExcluded(relativePath, excludeRegexes)) continue;
        files.push(fullPath);
      }
    }
  }
}

/**
 * Find source files recursively, skipping excluded paths.
 * Zero external dependencies — uses only node:fs.
 */
export async function globFiles(rootDir: string, exclude?: string[]): Promise<string[]> {
  const patterns = exclude ?? [
    '**/node_modules/**',
    '**/dist/**',
    '**/*.test.ts',
    '**/fixtures/**',
  ];
  const excludeRegexes = patterns.map(globToRegex);
  const files: string[] = [];
  await walkDir(rootDir, excludeRegexes, files);
  return files;
}
