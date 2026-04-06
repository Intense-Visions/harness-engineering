import { describe, it, expect } from 'vitest';
import { gatherCI } from '../../../src/server/gather/ci';
import { GatherCache } from '../../../src/server/gather-cache';
import type { SecurityResult, PerfResult, ArchResult } from '../../../src/shared/types';

function makeSecurity(overrides?: Partial<SecurityResult & { valid: boolean }>): SecurityResult {
  return {
    valid: true,
    findings: [],
    stats: { filesScanned: 10, errorCount: 0, warningCount: 0, infoCount: 0 },
    ...overrides,
  };
}

function makePerf(overrides?: Partial<PerfResult & { valid: boolean }>): PerfResult {
  return {
    valid: true,
    violations: [],
    stats: { filesAnalyzed: 10, violationCount: 0 },
    ...overrides,
  };
}

function makeArch(overrides?: Partial<ArchResult & { passed: boolean }>): ArchResult {
  return {
    passed: true,
    totalViolations: 0,
    regressions: [],
    newViolations: [],
    ...overrides,
  };
}

describe('gatherCI', () => {
  it('returns empty checks and null lastRun when cache is empty', () => {
    const cache = new GatherCache();
    const result = gatherCI(cache);
    expect(result.checks).toEqual([]);
    expect(result.lastRun).toBeNull();
  });

  it('maps security cache entry to check-security check result', async () => {
    const cache = new GatherCache();
    await cache.run('security', async () =>
      makeSecurity({
        valid: false,
        stats: { filesScanned: 10, errorCount: 2, warningCount: 3, infoCount: 1 },
      })
    );
    const result = gatherCI(cache);
    const check = result.checks.find((c) => c.name === 'check-security');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.errorCount).toBe(2);
    expect(check!.warningCount).toBe(3);
  });

  it('maps perf cache entry to check-perf check result', async () => {
    const cache = new GatherCache();
    await cache.run('perf', async () =>
      makePerf({
        violations: [
          { metric: 'bundleSize', file: 'a.ts', value: 200, threshold: 100, severity: 'warning' },
          { metric: 'bundleSize', file: 'b.ts', value: 200, threshold: 100, severity: 'warning' },
          { metric: 'bundleSize', file: 'c.ts', value: 200, threshold: 100, severity: 'warning' },
          { metric: 'bundleSize', file: 'd.ts', value: 200, threshold: 100, severity: 'warning' },
        ],
        stats: { filesAnalyzed: 5, violationCount: 4 },
      })
    );
    const result = gatherCI(cache);
    const check = result.checks.find((c) => c.name === 'check-perf');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(true);
    expect(check!.errorCount).toBe(0);
    expect(check!.warningCount).toBe(4);
  });

  it('maps arch cache entry to check-arch check result', async () => {
    const cache = new GatherCache();
    await cache.run('arch', async () => makeArch({ passed: false, totalViolations: 3 }));
    const result = gatherCI(cache);
    const check = result.checks.find((c) => c.name === 'check-arch');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.errorCount).toBe(3);
  });

  it('maps security error to error check result', async () => {
    const cache = new GatherCache();
    await cache.run('security', async (): Promise<SecurityResult> => ({ error: 'Scanner failed' }));
    const result = gatherCI(cache);
    const check = result.checks.find((c) => c.name === 'check-security');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.errorCount).toBe(1);
    expect(check!.details).toBe('Scanner failed');
  });

  it('returns the most recent lastRun across all cache entries', async () => {
    const cache = new GatherCache();
    await cache.run('security', async () => makeSecurity());
    // Small delay so timestamps differ
    await new Promise((r) => setTimeout(r, 5));
    await cache.run('perf', async () => makePerf());
    const result = gatherCI(cache);
    expect(result.lastRun).not.toBeNull();
    // lastRun should be the perf entry timestamp (later)
    const perfTime = cache.lastRunTime('perf')!;
    expect(result.lastRun).toBe(new Date(perfTime).toISOString());
  });

  it('includes all three checks when all caches are populated', async () => {
    const cache = new GatherCache();
    await cache.run('security', async () => makeSecurity());
    await cache.run('perf', async () => makePerf());
    await cache.run('arch', async () => makeArch());
    const result = gatherCI(cache);
    expect(result.checks).toHaveLength(3);
    const names = result.checks.map((c) => c.name).sort();
    expect(names).toEqual(['check-arch', 'check-perf', 'check-security']);
  });
});
