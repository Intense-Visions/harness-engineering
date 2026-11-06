import { EntropyAnalyzer } from '@harness-engineering/core';
import type { EntropyConfig } from '@harness-engineering/core';
import type { HealthResult } from '../../shared/types';
import { discoverEntryPoints } from './entry-points';

const DEFAULT_INCLUDE = ['src/**/*.ts', 'src/**/*.tsx'];
const DEFAULT_EXCLUDE = ['node_modules/**', 'dist/**', '**/*.test.ts', '**/*.spec.ts'];

/**
 * Run entropy analysis on the project and return a health summary.
 * Returns an error object instead of throwing on failure.
 * @internal Called with project-resolved paths, not from HTTP input.
 *
 * LATENT THIRD D4 CHANNEL — `configOverride.analyze`. Clone classes are
 * ADVISORY and must never reach a gating counter (spec decision D4 / ADR
 * 0134): `harness cleanup` keeps them out of `CleanupResult.totalIssues` and
 * out of the `--findings-json` contract, and `detect_entropy` reports them
 * beside `totalIssues` rather than inside it. This function threads a
 * CALLER-SUPPLIED `analyze` straight into the analyzer and then returns
 * `report.summary.totalIssues` — the aggregate the analyzer DOES sum
 * duplication into — so a future caller that passes `duplication` would put
 * clone classes in the dashboard health number without anyone deciding to.
 *
 * Bounded, not speculative: of 10 production `EntropyAnalyzer` sites across 9
 * files, this is the ONLY one that both accepts a caller-supplied `analyze`
 * and reads an aggregate counter. Zero live impact today — all three callers
 * pass only `projectPath`. Deliberately NOT closed here (no guard, no type
 * narrowing): naming it is cheap and honest, closing it speculatively would
 * add a constraint no caller has asked for.
 */
export async function gatherHealth(
  projectPath: string,
  configOverride?: Partial<Omit<EntropyConfig, 'rootDir'>>
): Promise<HealthResult> {
  try {
    const entryPoints = configOverride?.entryPoints ?? (await discoverEntryPoints(projectPath));

    const config: EntropyConfig = {
      rootDir: projectPath,
      ...(entryPoints.length > 0 ? { entryPoints } : {}),
      include: configOverride?.include ?? DEFAULT_INCLUDE,
      exclude: configOverride?.exclude ?? DEFAULT_EXCLUDE,
      analyze: configOverride?.analyze ?? {
        drift: true,
        deadCode: true,
        patterns: true,
        complexity: true,
        coupling: true,
        sizeBudget: true,
      },
    };

    const analyzer = new EntropyAnalyzer(config);
    const result = await analyzer.analyze();

    if (!result.ok) {
      return { error: result.error.message };
    }

    const report = result.value;
    return {
      totalIssues: report.summary.totalIssues,
      errors: report.summary.errors,
      warnings: report.summary.warnings,
      fixableCount: report.summary.fixableCount,
      suggestionCount: report.summary.suggestionCount,
      durationMs: report.duration,
      analysisErrors: report.analysisErrors.map((e) => e.analyzer),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
