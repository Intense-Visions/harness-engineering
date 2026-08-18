import { minimatch } from 'minimatch';
import type { ArchConfig } from './types';
import { relativePosix } from '../shared/fs-utils';

/**
 * Resolve the effective exclude globs for an architecture run.
 *
 * Returns `config.excludePatterns` as-is. These are ADDITIVE: every collector
 * still applies its own built-in scoping (`DEFAULT_FIND_FILES_IGNORE` for the
 * glob-based collectors, `DEFAULT_SKIP_DIRS` for the directory walkers), so a
 * project that sets one pattern does not silently re-enable scanning of
 * `node_modules` or `dist`.
 *
 * The CLI layer stacks the project-wide `analysis.exclude` list on top of this
 * before handing the config to the collectors — that loader lives in the CLI
 * package, which core must not import.
 */
export function resolveExcludePatterns(config: ArchConfig): readonly string[] {
  // Tolerate a hand-built ArchConfig that predates this field. `ArchConfig` is a
  // public exported type, so callers construct it as an object literal (the
  // collector tests do) rather than always parsing through the schema — reading
  // the field directly would throw for every such caller after an upgrade.
  return config.excludePatterns ?? [];
}

/**
 * Test an absolute path against the exclude globs.
 *
 * Patterns are matched against the project-relative POSIX-style path, matching
 * the semantics of `ingest.excludePatterns` and `analysis.exclude`. `dot: true`
 * mirrors `findFiles`, so a pattern can reach first-party source that lives
 * under a dot-directory (#1146).
 */
export function isExcluded(
  absolutePath: string,
  rootDir: string,
  patterns: readonly string[]
): boolean {
  if (!patterns || patterns.length === 0) return false;
  const rel = relativePosix(rootDir, absolutePath);
  return patterns.some((pattern) => minimatch(rel, pattern, { dot: true }));
}
