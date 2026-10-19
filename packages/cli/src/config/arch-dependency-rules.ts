import { withDependencyRules as withDependencyRulesCore } from '@harness-engineering/core';
import type { ArchConfig } from '@harness-engineering/core';
import type { HarnessConfig } from './schema';

/**
 * CLI-typed wrapper over core's `withDependencyRules` (issue #2235).
 *
 * The injection itself lives in core because `harness ci check` — the gate
 * `.husky/pre-commit` runs — builds its arch config inside core and must inject
 * the identical rules. Two producers writing one `baselines.json` have to
 * measure the same thing, or the ratchet compares a structural 0 against a real
 * value. This wrapper only narrows the source type to the CLI's `HarnessConfig`.
 */
export function withDependencyRules(
  archConfig: ArchConfig,
  config: Pick<HarnessConfig, 'rootDir' | 'layers' | 'forbiddenImports'>,
  cwd: string
): ArchConfig {
  return withDependencyRulesCore(
    archConfig,
    {
      ...(config.rootDir !== undefined ? { rootDir: config.rootDir } : {}),
      ...(config.layers !== undefined ? { layers: config.layers } : {}),
      ...(config.forbiddenImports !== undefined
        ? { forbiddenImports: config.forbiddenImports }
        : {}),
    },
    cwd
  );
}
