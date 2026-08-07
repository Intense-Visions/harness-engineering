import { access, constants, readFile } from 'fs';
import { promisify } from 'util';
import { relative } from 'node:path';
import { glob } from 'glob';
import { skipDirGlobs } from '@harness-engineering/graph';
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
 * Default ignore patterns applied to every `findFiles` call — sourced from
 * the shared `DEFAULT_SKIP_DIRS` walker skip-list (via `skipDirGlobs`) so
 * every scanner excludes the same set: dependencies (`node_modules`,
 * `vendor`), build output (`dist`, `build`), Python virtualenvs (`.venv`,
 * `venv`, `__pycache__`), caches, and AI-agent sandboxes. Without these
 * defaults, scanners like `harness check-arch` crawl into nested
 * `node_modules` (e.g. a standalone example's bundled
 * `typescript/lib/lib.dom.d.ts`) and produce hundreds of false-positive
 * complexity findings; on downstream overlay repos the same happened with
 * `.venv` (issue #898). Previously this was a hand-rolled 4-entry list that
 * had drifted from the shared set.
 */
export const DEFAULT_FIND_FILES_IGNORE: readonly string[] = skipDirGlobs();

/**
 * Finds files matching a glob pattern.
 *
 * @param pattern - The glob pattern to search for.
 * @param cwd - The current working directory for the search (default: process.cwd()).
 * @param extraIgnore - Additional ignore patterns, applied on top of {@link DEFAULT_FIND_FILES_IGNORE}.
 * @returns A promise that resolves to an array of absolute file paths matching
 *   the pattern, always forward-slash separated (POSIX) on every platform.
 */
export async function findFiles(
  pattern: string,
  cwd: string = process.cwd(),
  extraIgnore: readonly string[] = []
): Promise<string[]> {
  const matches = await glob(pattern, {
    cwd,
    absolute: true,
    // `dot: true` lets discovery see first-party source that lives under a
    // dot-directory (e.g. `.canary/`, `.config/`, `.server/` in ESM overlay
    // repos). Without it, a repo whose entire surface is under a dot-dir scans
    // as ~nothing (#1146). The genuine ignore list below still keeps `.git`,
    // `node_modules`, `.harness` runtime, virtualenvs, and build/tooling caches
    // excluded — glob propagates `dot` to its ignore matchers, so `**/.git/**`
    // and friends continue to match. The policy is "do not blanket-exclude ALL
    // dot-dirs", not "stop ignoring anything".
    dot: true,
    ignore: [...DEFAULT_FIND_FILES_IGNORE, ...extraIgnore],
  });
  // Normalise to forward slashes. On Windows `glob` returns backslash-separated
  // paths, which break every downstream consumer that matches on `/` — doc
  // coverage's link matching, drift's exports index, and callers' own
  // `.includes('a/b')` checks (#1146). Node's fs APIs accept `/` on Windows, so
  // emitting POSIX paths everywhere is safe and keeps discovery output
  // platform-consistent.
  return matches.map((f) => f.replaceAll('\\', '/'));
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
