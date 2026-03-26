import * as fs from 'node:fs/promises';
import * as path from 'node:path';

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

// Directories that are always skipped for performance
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', '.nuxt', '__pycache__']);

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

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // Permission denied or missing directory
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath).replaceAll('\\', '/');

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (isExcluded(relativePath + '/', excludeRegexes)) continue;
        await walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (!SOURCE_EXTENSIONS.has(ext)) continue;
        if (isExcluded(relativePath, excludeRegexes)) continue;
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return files;
}
