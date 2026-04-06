import type { GatherCache } from '../gather-cache';
import type {
  CIData,
  CheckResult,
  SecurityResult,
  SecurityData,
  PerfResult,
  PerfData,
  ArchResult,
  ArchData,
} from '../../shared/types';

function isSecurityData(r: SecurityResult): r is SecurityData {
  return 'valid' in r;
}

function isPerfData(r: PerfResult): r is PerfData {
  return 'valid' in r;
}

function isArchData(r: ArchResult): r is ArchData {
  return 'passed' in r;
}

/** Map a cached security result to a CheckResult. */
function mapSecurity(result: SecurityResult): CheckResult {
  if (isSecurityData(result)) {
    return {
      name: 'check-security',
      passed: result.valid,
      errorCount: result.stats.errorCount,
      warningCount: result.stats.warningCount,
      details: `${result.stats.filesScanned} files scanned`,
    };
  }
  return {
    name: 'check-security',
    passed: false,
    errorCount: 1,
    warningCount: 0,
    details: result.error,
  };
}

/** Map a cached perf result to a CheckResult. */
function mapPerf(result: PerfResult): CheckResult {
  if (isPerfData(result)) {
    const errorCount = result.violations.filter((v) => v.severity === 'error').length;
    const warningCount = result.violations.length - errorCount;
    return {
      name: 'check-perf',
      passed: result.valid,
      errorCount,
      warningCount,
      details: `${result.stats.filesAnalyzed} files analyzed`,
    };
  }
  return {
    name: 'check-perf',
    passed: false,
    errorCount: 1,
    warningCount: 0,
    details: result.error,
  };
}

/** Map a cached arch result to a CheckResult. */
function mapArch(result: ArchResult): CheckResult {
  if (isArchData(result)) {
    return {
      name: 'check-arch',
      passed: result.passed,
      errorCount: result.totalViolations,
      warningCount: result.regressions.length,
      details:
        result.totalViolations > 0
          ? `${result.totalViolations} violations, ${result.regressions.length} regressions`
          : 'All checks passed',
    };
  }
  return {
    name: 'check-arch',
    passed: false,
    errorCount: 1,
    warningCount: 0,
    details: result.error,
  };
}

/** Collect a timestamp from the cache if the key has been run. */
function collectTimestamp(cache: GatherCache, key: string, timestamps: number[]): void {
  const t = cache.lastRunTime(key);
  if (t) timestamps.push(t);
}

/**
 * Build CIData from cached gather results.
 * Synchronous — reads only from GatherCache, never runs gatherers.
 */
export function gatherCI(cache: GatherCache): CIData {
  const checks: CheckResult[] = [];
  const timestamps: number[] = [];

  const security = cache.get<SecurityResult>('security');
  if (security) {
    collectTimestamp(cache, 'security', timestamps);
    checks.push(mapSecurity(security));
  }

  const perf = cache.get<PerfResult>('perf');
  if (perf) {
    collectTimestamp(cache, 'perf', timestamps);
    checks.push(mapPerf(perf));
  }

  const arch = cache.get<ArchResult>('arch');
  if (arch) {
    collectTimestamp(cache, 'arch', timestamps);
    checks.push(mapArch(arch));
  }

  const latestTimestamp =
    timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

  return { checks, lastRun: latestTimestamp };
}
