import { EntropyAnalyzer } from '@harness-engineering/core';
import type { PerfResult, PerfViolationSummary } from '../../shared/types';

interface ViolationLike {
  metric: string;
  file: string;
  value: number;
  threshold: number;
  severity: string;
}

interface SizeBudgetViolation {
  package: string;
  currentSize: number;
  budgetSize: number;
  severity: string;
}

function mapViolation(v: ViolationLike): PerfViolationSummary {
  return {
    metric: v.metric,
    file: v.file,
    value: v.value,
    threshold: v.threshold,
    severity: v.severity,
  };
}

function mapSizeBudgetViolation(v: SizeBudgetViolation): PerfViolationSummary {
  return {
    metric: 'sizeBudget',
    file: v.package,
    value: v.currentSize,
    threshold: v.budgetSize,
    severity: v.severity,
  };
}

function collectViolations(report: {
  complexity?: { violations: ViolationLike[] };
  coupling?: { violations: ViolationLike[] };
  sizeBudget?: { violations: SizeBudgetViolation[] };
}): PerfViolationSummary[] {
  const violations: PerfViolationSummary[] = [];
  if (report.complexity) violations.push(...report.complexity.violations.map(mapViolation));
  if (report.coupling) violations.push(...report.coupling.violations.map(mapViolation));
  if (report.sizeBudget)
    violations.push(...report.sizeBudget.violations.map(mapSizeBudgetViolation));
  return violations;
}

/**
 * Run structural performance analysis (complexity, coupling, size budgets).
 * Returns an error object instead of throwing on failure.
 */
export async function gatherPerf(projectPath: string): Promise<PerfResult> {
  try {
    const analyzer = new EntropyAnalyzer({
      rootDir: projectPath,
      analyze: { complexity: true, coupling: true, sizeBudget: true },
    });

    const analysisResult = await analyzer.analyze();

    if (!analysisResult.ok) {
      return { error: analysisResult.error.message };
    }

    const report = analysisResult.value;
    const violations = collectViolations(report);
    const hasErrors = violations.some((v) => v.severity === 'error');

    return {
      valid: !hasErrors,
      violations,
      stats: {
        filesAnalyzed: report.complexity?.stats.filesAnalyzed ?? 0,
        violationCount: violations.length,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
