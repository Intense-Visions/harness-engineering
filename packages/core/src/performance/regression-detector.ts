import type {
  BenchmarkResult,
  Baseline,
  CriticalPathSet,
  RegressionReport,
  RegressionResult,
} from './types';

export class RegressionDetector {
  detect(
    results: BenchmarkResult[],
    baselines: Record<string, Baseline>,
    criticalPaths: CriticalPathSet
  ): RegressionReport {
    const regressions: RegressionResult[] = [];
    const improvements: Array<{ benchmark: string; improvementPct: number }> = [];
    let newBenchmarks = 0;

    for (const current of results) {
      const key = `${current.file}::${current.name}`;
      const baseline = baselines[key];

      if (!baseline) {
        newBenchmarks++;
        continue;
      }

      const regressionPct = ((baseline.opsPerSec - current.opsPerSec) / baseline.opsPerSec) * 100;
      const noiseThreshold = (baseline.marginOfError + current.marginOfError) * 100;
      const withinNoise = Math.abs(regressionPct) <= noiseThreshold;

      if (regressionPct < 0) {
        // Improvement
        improvements.push({ benchmark: key, improvementPct: Math.abs(regressionPct) });
        continue;
      }

      const isCriticalPath = criticalPaths.entries.some(
        (e) => current.file.includes(e.file) || current.name === e.function
      );

      let tier: 1 | 2 | 3;
      let severity: 'error' | 'warning' | 'info';

      if (isCriticalPath && regressionPct > 5 && !withinNoise) {
        tier = 1;
        severity = 'error';
      } else if (regressionPct > 10 && !withinNoise) {
        tier = 2;
        severity = 'warning';
      } else {
        tier = 3;
        severity = 'info';
      }

      regressions.push({
        benchmark: key,
        current,
        baseline,
        regressionPct,
        isCriticalPath,
        tier,
        severity,
        withinNoise,
      });
    }

    return {
      regressions,
      improvements,
      stats: {
        benchmarksCompared: results.length - newBenchmarks,
        regressionCount: regressions.filter((r) => !r.withinNoise).length,
        improvementCount: improvements.length,
        newBenchmarks,
      },
    };
  }
}
