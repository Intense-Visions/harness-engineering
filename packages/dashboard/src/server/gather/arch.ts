import { ArchBaselineManager, ArchConfigSchema, runAll, diff } from '@harness-engineering/core';
import type { ArchResult } from '../../shared/types';

/**
 * Run architecture baseline checks and return a summary.
 * Returns an error object instead of throwing on failure.
 */
export async function gatherArch(projectPath: string): Promise<ArchResult> {
  try {
    const archConfig = ArchConfigSchema.parse({});
    const results = await runAll(archConfig, projectPath);
    const manager = new ArchBaselineManager(projectPath);
    const baseline = manager.load();

    if (!baseline) {
      // No baseline: report clean (threshold-only mode, no regressions detectable)
      return {
        passed: true,
        totalViolations: 0,
        regressions: [],
        newViolations: [],
      };
    }

    const diffResult = diff(results, baseline);

    return {
      passed: diffResult.passed,
      totalViolations: diffResult.newViolations.length,
      regressions: diffResult.regressions.map((r) => ({
        category: r.category,
        delta: r.delta,
      })),
      newViolations: diffResult.newViolations.map((v) => ({
        file: v.file,
        detail: v.detail,
        severity: v.severity,
      })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
