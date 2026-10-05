import * as path from 'node:path';
import type { ArchConfig } from '@harness-engineering/core';
import type { HarnessConfig } from './schema';

/**
 * Inject the project's top-level `layers` and `forbiddenImports` rules into the
 * arch config the collectors run with (issue #2235).
 *
 * The layer-violation and forbidden-import collectors used to receive neither,
 * so `check-arch` measured nothing for either category and recorded 0 — an
 * abstention reported as a clean measurement. These are the same blocks
 * `check-deps` and the ESLint plugin enforce; nothing new is read from the
 * `architecture` block.
 *
 * Layer patterns are relative to `rootDir` (that is how `check-deps` resolves
 * them), while the collectors run from the project directory, so a non-default
 * `rootDir` is folded into each pattern. `forbiddenImports` globs are already
 * project-relative, matching the ESLint rule.
 */
export function withDependencyRules(
  archConfig: ArchConfig,
  config: Pick<HarnessConfig, 'rootDir' | 'layers' | 'forbiddenImports'>,
  cwd: string
): ArchConfig {
  const rootPrefix = path
    .relative(cwd, path.resolve(cwd, config.rootDir ?? '.'))
    .replaceAll('\\', '/');
  return {
    ...archConfig,
    layers: (config.layers ?? []).map((layer) => ({
      ...layer,
      pattern: rootPrefix ? path.posix.join(rootPrefix, layer.pattern) : layer.pattern,
    })),
    forbiddenImports: config.forbiddenImports ?? [],
  };
}
