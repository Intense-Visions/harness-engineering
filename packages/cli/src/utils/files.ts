import { glob } from 'glob';
import { DEFAULT_FIND_FILES_IGNORE } from '@harness-engineering/core';

/**
 * Find files matching a glob pattern. Always applies core's shared
 * DEFAULT_FIND_FILES_IGNORE (node_modules, dist, .git, …) so CLI discovery
 * matches core's scanners; extraIgnore stacks additional excludes on top
 * (issue #1188).
 */
export async function findFiles(
  pattern: string,
  cwd: string = process.cwd(),
  extraIgnore: readonly string[] = []
): Promise<string[]> {
  return glob(pattern, {
    cwd,
    absolute: true,
    dot: true,
    ignore: [...DEFAULT_FIND_FILES_IGNORE, ...extraIgnore],
  });
}
