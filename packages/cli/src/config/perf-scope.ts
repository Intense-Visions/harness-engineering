/**
 * What `harness check-perf` analyses: the entry points and the exclude globs it
 * hands to core's `EntropyAnalyzer`, both read from the project's harness config.
 */
import { skipDirGlobs } from '@harness-engineering/graph';
import { resolveConfig } from './loader';
import { gitIgnoredExcludeGlobs } from '../utils/git-ignored';

/**
 * Resolve configured entry points for the perf analysis. On a monorepo the
 * repo root has no `main`/`exports`/`src/index.ts`, so the analyzer's
 * conventional resolution fails ("Could not resolve entry points"). The
 * harness config declares the per-package entry points explicitly — prefer
 * the dedicated `performance` block, fall back to the shared `entropy`
 * block, and return undefined when no config is present so non-harness
 * directories keep relying on conventional resolution.
 */
export function resolveConfiguredEntryPoints(configPath?: string): string[] | undefined {
  const configResult = resolveConfig(configPath);
  if (!configResult.ok) return undefined;
  const config = configResult.value;
  const fromPerformance = (config.performance as { entryPoints?: unknown } | undefined)
    ?.entryPoints;
  if (Array.isArray(fromPerformance) && fromPerformance.length > 0) {
    return fromPerformance.filter((e): e is string => typeof e === 'string');
  }
  const fromEntropy = config.entropy?.entryPoints;
  if (Array.isArray(fromEntropy) && fromEntropy.length > 0) return fromEntropy;
  return undefined;
}

/**
 * The analyzer's own default exclude list (`buildSnapshot` in core's
 * `entropy/snapshot.ts`). Passing ANY `exclude` replaces that default, so when
 * the project configures no `entropy.excludePatterns` this keeps the files a
 * config-less run analysed unchanged while the gitignored paths are added.
 */
const ANALYZER_DEFAULT_EXCLUDES: readonly string[] = [
  ...skipDirGlobs(),
  '**/*.test.ts',
  '**/*.spec.ts',
];

/**
 * Exclude globs for the perf analysis — the same sources `cleanup` and a clean
 * CI checkout imply:
 *
 *  - `entropy.excludePatterns`, the key `cleanup` already threads into the
 *    same `EntropyAnalyzer` (#2077). Without it a directory the project
 *    explicitly excluded (generated code, a bundled cache) still failed the
 *    perf gate.
 *  - every path git ignores (#2331). A local working tree holds gitignored
 *    build output that a CI checkout does not, so walking it made the same
 *    commit pass in CI and fail locally.
 */
export function resolveExcludePatterns(rootDir: string, configPath?: string): string[] {
  const configResult = resolveConfig(configPath);
  const fromEntropy = configResult.ok ? configResult.value.entropy?.excludePatterns : undefined;
  const configured = Array.isArray(fromEntropy) ? fromEntropy : ANALYZER_DEFAULT_EXCLUDES;
  return [...configured, ...gitIgnoredExcludeGlobs(rootDir)];
}
