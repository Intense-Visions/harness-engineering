import { EntropyAnalyzer } from '@harness-engineering/core';
import type { EntropyConfig } from '@harness-engineering/core';
import type { HealthResult } from '../../shared/types';

/**
 * Run entropy analysis on the project and return a health summary.
 * Returns an error object instead of throwing on failure.
 */
export async function gatherHealth(projectPath: string): Promise<HealthResult> {
  try {
    const config: EntropyConfig = {
      rootDir: projectPath,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['node_modules/**', 'dist/**', '**/*.test.ts', '**/*.spec.ts'],
      analyze: {
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
