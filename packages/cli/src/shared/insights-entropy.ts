// packages/cli/src/shared/insights-entropy.ts
//
// The config-aware entropy gatherer `harness insights`, the `insights_summary`
// MCP tool and `telemetry synthesize` inject into `composeInsights` (#2192).
//
// It runs `runCleanup` itself rather than re-deriving an EntropyConfig, so the
// insights entropy line and `harness cleanup` read the SAME harness.config.json
// settings (entryPoints, excludePatterns, entropy.drift) through the same code
// and cannot disagree about one repository.
import * as path from 'path';
import type { InsightsEntropyGatherer } from '@harness-engineering/core';
import { runCleanup } from '../commands/cleanup';
import { findConfigFile } from '../config/loader';

/**
 * Returns the gatherer to inject, or `undefined` when the project has no
 * harness.config.json — `cleanup` refuses to run there, so insights keeps the
 * core default (an unconfigured scan) for that case.
 *
 * @param projectPath - Root the report is about. The config is looked up from
 *   HERE, not from `process.cwd()`, so the MCP tool's `path` is honored.
 * @param configPath - Explicit `-c` config; wins over the lookup.
 */
export function resolveInsightsEntropyGatherer(
  projectPath: string,
  configPath?: string
): InsightsEntropyGatherer | undefined {
  let resolvedConfig: string;
  if (configPath) {
    resolvedConfig = path.resolve(configPath);
  } else {
    const found = findConfigFile(projectPath);
    if (!found.ok) return undefined;
    resolvedConfig = found.value;
  }

  // No `cwd`: like `harness cleanup`, scan the project that OWNS the config.
  return async () => {
    const result = await runCleanup({ configPath: resolvedConfig, type: 'all' });
    // Throw, never return zeros: composeInsights turns a throw into a null
    // block plus a warning, which renders as NOT MEASURED instead of PASS.
    if (!result.ok) throw new Error(result.error.message);
    const { driftIssues, deadCode } = result.value;
    return {
      driftCount: driftIssues.length,
      deadFiles: deadCode.filter((d) => d.symbol === undefined).length,
      deadExports: deadCode.filter((d) => d.symbol !== undefined).length,
    };
  };
}
