import * as path from 'node:path';

/**
 * Derive a `resolveProject` test double from whatever `resolveConfig` double a
 * suite already installs.
 *
 * Commands that scan, measure or write a tree now take both the config AND the
 * project root it implies from `resolveProject` (one shape, so the #911 class —
 * config read from the `-c` tree, measurement taken from `process.cwd()` —
 * cannot be reacquired by omission). Suites that mock the config loader would
 * otherwise have to restate their config literal a second time just to supply a
 * root, so this reuses the existing `resolveConfig` double and applies the same
 * root rule the real implementation does.
 *
 * Deliberately forwards whatever the `resolveConfig` double returns on failure,
 * so a suite that makes the config load fail still sees a failing project load.
 */
export function resolveProjectFrom(
  resolveConfig: (configPath?: string) => unknown
): (configPath?: string, cwdOverride?: string) => unknown {
  return (configPath?: string, cwdOverride?: string) => {
    const loaded = resolveConfig(configPath) as { ok?: boolean; value?: unknown } | undefined;
    if (!loaded || loaded.ok !== true) {
      return loaded ?? { ok: false, error: new Error('resolveConfig mock returned nothing') };
    }
    const resolvedConfigPath = configPath
      ? path.resolve(configPath)
      : path.join(process.cwd(), 'harness.config.json');
    return {
      ok: true,
      value: {
        config: loaded.value,
        configPath: resolvedConfigPath,
        root: cwdOverride ?? path.dirname(resolvedConfigPath),
      },
    };
  };
}
