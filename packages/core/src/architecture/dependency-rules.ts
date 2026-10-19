import * as path from 'node:path';
import type {
  ArchConfig,
  ArchForbiddenImportRule,
  ArchLayerRule,
  ArchDependencyRules,
} from './types';

/**
 * The slice of a harness config the dependency collectors need: the top-level
 * `layers` / `forbiddenImports` blocks (the ones `check-deps` and the ESLint
 * plugin read) plus the `rootDir` their patterns are written relative to.
 */
export interface DependencyRuleSource extends ArchDependencyRules {
  rootDir?: string | undefined;
}

/**
 * Inject the project's top-level `layers` and `forbiddenImports` rules into the
 * arch config the collectors run with (issue #2235).
 *
 * The layer-violation and forbidden-import collectors used to receive neither,
 * so they measured nothing and recorded 0 — an abstention reported as a clean
 * measurement. Nothing new is read from the `architecture` block.
 *
 * Layer patterns are relative to `rootDir` (that is how `check-deps` resolves
 * them), while the collectors run from the project directory, so a non-default
 * `rootDir` is folded into each pattern. `forbiddenImports` globs are already
 * project-relative, matching the ESLint rule.
 *
 * Lives in core rather than in the CLI because `harness ci check` (which is
 * what the pre-commit hook runs) builds its arch config inside core and needs
 * the identical injection: two producers writing one `baselines.json` must
 * measure the same thing, or the ratchet compares a 0 against a real number.
 */
export function withDependencyRules(
  archConfig: ArchConfig,
  source: DependencyRuleSource,
  cwd: string
): ArchConfig {
  const rootPrefix = path
    .relative(cwd, path.resolve(cwd, source.rootDir ?? '.'))
    .replaceAll('\\', '/');
  return {
    ...archConfig,
    layers: (source.layers ?? []).map((layer) => ({
      ...layer,
      pattern: rootPrefix ? path.posix.join(rootPrefix, layer.pattern) : layer.pattern,
    })),
    forbiddenImports: source.forbiddenImports ?? [],
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function toLayerRule(raw: unknown): ArchLayerRule | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string' || typeof r.pattern !== 'string') return undefined;
  return {
    name: r.name,
    pattern: r.pattern,
    allowedDependencies: isStringArray(r.allowedDependencies) ? r.allowedDependencies : [],
  };
}

function toForbiddenImportRule(raw: unknown): ArchForbiddenImportRule | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.from !== 'string' || !isStringArray(r.disallow)) return undefined;
  return {
    from: r.from,
    disallow: r.disallow,
    ...(typeof r.message === 'string' ? { message: r.message } : {}),
  };
}

/**
 * Read the dependency-rule slice out of a raw harness config record.
 *
 * `runCIChecks` receives the config as an untyped record (core cannot depend on
 * the CLI's schema), so each rule is shape-checked individually: one malformed
 * entry is dropped rather than discarding every rule and silently returning the
 * pre-#2235 structural zero.
 */
export function readDependencyRules(config: Record<string, unknown>): DependencyRuleSource {
  const layers = Array.isArray(config.layers)
    ? config.layers.map(toLayerRule).filter((l): l is ArchLayerRule => l !== undefined)
    : [];
  const forbiddenImports = Array.isArray(config.forbiddenImports)
    ? config.forbiddenImports
        .map(toForbiddenImportRule)
        .filter((r): r is ArchForbiddenImportRule => r !== undefined)
    : [];
  return {
    ...(typeof config.rootDir === 'string' ? { rootDir: config.rootDir } : {}),
    layers,
    forbiddenImports,
  };
}
