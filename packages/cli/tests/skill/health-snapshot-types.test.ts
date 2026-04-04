import { describe, it, expect } from 'vitest';
import type { HealthSnapshot, HealthChecks, HealthMetrics } from '../../src/skill/health-snapshot';

describe('HealthSnapshot types', () => {
  it('accepts a fully populated HealthSnapshot', () => {
    const snapshot: HealthSnapshot = {
      capturedAt: '2026-04-04T12:00:00Z',
      gitHead: 'abc123def456',
      projectPath: '/tmp/test-project',
      checks: {
        deps: { passed: true, issueCount: 0, circularDeps: 0, layerViolations: 0 },
        entropy: { passed: false, deadExports: 3, deadFiles: 1, driftCount: 2 },
        security: { passed: true, findingCount: 0, criticalCount: 0 },
        perf: { passed: true, violationCount: 0 },
        docs: { passed: false, undocumentedCount: 5 },
        lint: { passed: true, issueCount: 0 },
      },
      metrics: {
        avgFanOut: 4.2,
        maxFanOut: 18,
        avgCyclomaticComplexity: 3.1,
        maxCyclomaticComplexity: 22,
        avgCouplingRatio: 0.35,
        testCoverage: 72,
        anomalyOutlierCount: 1,
        articulationPointCount: 2,
      },
      signals: ['dead-code', 'drift', 'doc-gaps'],
    };

    expect(snapshot.capturedAt).toBe('2026-04-04T12:00:00Z');
    expect(snapshot.checks.deps.passed).toBe(true);
    expect(snapshot.checks.entropy.deadExports).toBe(3);
    expect(snapshot.metrics.avgFanOut).toBe(4.2);
    expect(snapshot.metrics.testCoverage).toBe(72);
    expect(snapshot.signals).toContain('dead-code');
  });

  it('accepts testCoverage as null when unavailable', () => {
    const metrics: HealthMetrics = {
      avgFanOut: 5,
      maxFanOut: 20,
      avgCyclomaticComplexity: 4,
      maxCyclomaticComplexity: 30,
      avgCouplingRatio: 0.4,
      testCoverage: null,
      anomalyOutlierCount: 0,
      articulationPointCount: 0,
    };
    expect(metrics.testCoverage).toBeNull();
  });

  it('HealthChecks fields are independently typed', () => {
    const checks: HealthChecks = {
      deps: { passed: false, issueCount: 2, circularDeps: 1, layerViolations: 1 },
      entropy: { passed: true, deadExports: 0, deadFiles: 0, driftCount: 0 },
      security: { passed: false, findingCount: 3, criticalCount: 1 },
      perf: { passed: true, violationCount: 0 },
      docs: { passed: true, undocumentedCount: 0 },
      lint: { passed: false, issueCount: 7 },
    };
    expect(checks.deps.circularDeps).toBe(1);
    expect(checks.security.criticalCount).toBe(1);
    expect(checks.lint.issueCount).toBe(7);
  });
});
