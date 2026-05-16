import { access, constants, readFile } from 'fs';
import { promisify } from 'util';
import { relative } from 'node:path';
import { glob } from 'glob';
import type { Result } from './result';
import { Ok, Err } from './result';

const accessAsync = promisify(access);
const readFileAsync = promisify(readFile);

/**
 * Checks if a file or directory exists at the specified path.
 *
 * @param path - The file system path to check.
 * @returns A promise that resolves to true if the path exists, false otherwise.
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await accessAsync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the content of a file as a UTF-8 string.
 *
 * @param path - The path to the file to read.
 * @returns A promise that resolves to a Result containing the file content or an Error.
 */
export async function readFileContent(path: string): Promise<Result<string, Error>> {
  try {
    const content = await readFileAsync(path, 'utf-8');
    return Ok(content);
  } catch (error) {
    return Err(error as Error);
  }
}

/**
 * Default ignore patterns applied to every `findFiles` call. These are
 * directories that never contain user source the analyzer cares about:
 * `node_modules` is dependencies, `dist`/`build` are build output, `coverage`
 * is test artifacts. Without these defaults, scanners like `harness check-arch`
 * crawl into nested `node_modules` (e.g. a standalone example's bundled
 * `typescript/lib/lib.dom.d.ts`) and produce hundreds of false-positive
 * complexity findings.
 */
export const DEFAULT_FIND_FILES_IGNORE: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
];

/**
 * Finds files matching a glob pattern.
 *
 * @param pattern - The glob pattern to search for.
 * @param cwd - The current working directory for the search (default: process.cwd()).
 * @param extraIgnore - Additional ignore patterns, applied on top of {@link DEFAULT_FIND_FILES_IGNORE}.
 * @returns A promise that resolves to an array of absolute file paths matching the pattern.
 */
export async function findFiles(
  pattern: string,
  cwd: string = process.cwd(),
  extraIgnore: readonly string[] = []
): Promise<string[]> {
  return glob(pattern, {
    cwd,
    absolute: true,
    ignore: [...DEFAULT_FIND_FILES_IGNORE, ...extraIgnore],
  });
}

/**
 * Returns a forward-slash-separated relative path, safe on all platforms.
 *
 * On Windows, `path.relative()` returns backslash-separated paths which break
 * string comparisons, minimatch patterns, and serialised output. This utility
 * normalises to POSIX separators unconditionally.
 */
export function relativePosix(from: string, to: string): string {
  return relative(from, to).replaceAll('\\', '/');
}
