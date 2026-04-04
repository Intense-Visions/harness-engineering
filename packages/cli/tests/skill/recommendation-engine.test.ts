import { describe, it, expect } from 'vitest';
import { resolveMetricValue, matchHardRules } from '../../src/skill/recommendation-engine';
import type { HealthSnapshot, HealthMetrics } from '../../src/skill/health-snapshot';
import type { SkillAddress } from '../../src/skill/schema';

// -- Test helpers --

function makeMetrics(overrides: Partial<HealthMetrics> = {}): HealthMetrics {
  return {
    avgFanOut: 0,
    maxFanOut: 0,
    avgCyclomaticComplexity: 0,
    maxCyclomaticComplexity: 0,
    avgCouplingRatio: 0,
    testCoverage: null,
    anomalyOutlierCount: 0,
    articulationPointCount: 0,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    gitHead: 'abc123',
    projectPath: '/tmp/test',
    checks: {
      deps: { passed: true, issueCount: 0, circularDeps: 0, layerViolations: 0 },
      entropy: { passed: true, deadExports: 0, deadFiles: 0, driftCount: 0 },
      security: { passed: true, findingCount: 0, criticalCount: 0 },
      perf: { passed: true, violationCount: 0 },
      docs: { passed: true, undocumentedCount: 0 },
      lint: { passed: true, issueCount: 0 },
    },
    metrics: makeMetrics(),
    signals: [],
    ...overrides,
  };
}

type SkillAddressIndex = Map<string, { addresses: SkillAddress[]; dependsOn: string[] }>;

function makeIndex(
  entries: Record<string, { addresses: SkillAddress[]; dependsOn?: string[] }>
): SkillAddressIndex {
  const map: SkillAddressIndex = new Map();
  for (const [name, entry] of Object.entries(entries)) {
    map.set(name, { addresses: entry.addresses, dependsOn: entry.dependsOn ?? [] });
  }
  return map;
}

// -- resolveMetricValue tests --

describe('resolveMetricValue', () => {
  it('resolves "fanOut" to maxFanOut', () => {
    const metrics = makeMetrics({ maxFanOut: 25 });
    expect(resolveMetricValue(metrics, 'fanOut')).toBe(25);
  });

  it('resolves "couplingRatio" to avgCouplingRatio', () => {
    const metrics = makeMetrics({ avgCouplingRatio: 0.65 });
    expect(resolveMetricValue(metrics, 'couplingRatio')).toBe(0.65);
  });

  it('resolves "cyclomaticComplexity" to maxCyclomaticComplexity', () => {
    const metrics = makeMetrics({ maxCyclomaticComplexity: 30 });
    expect(resolveMetricValue(metrics, 'cyclomaticComplexity')).toBe(30);
  });

  it('resolves "coverage" to testCoverage (inverted: 100 - coverage)', () => {
    const metrics = makeMetrics({ testCoverage: 45 });
    expect(resolveMetricValue(metrics, 'coverage')).toBe(55);
  });

  it('returns null for unknown metric names', () => {
    const metrics = makeMetrics();
    expect(resolveMetricValue(metrics, 'unknownMetric')).toBeNull();
  });

  it('returns null for coverage when testCoverage is null', () => {
    const metrics = makeMetrics({ testCoverage: null });
    expect(resolveMetricValue(metrics, 'coverage')).toBeNull();
  });
});

// -- matchHardRules tests --

describe('matchHardRules', () => {
  it('returns critical recommendation when hard address matches active signal', () => {
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [{ signal: 'circular-deps', hard: true }],
      },
    });
    const result = matchHardRules(snapshot, index);
    expect(result).toHaveLength(1);
    expect(result[0]!.skillName).toBe('enforce-architecture');
    expect(result[0]!.urgency).toBe('critical');
    expect(result[0]!.score).toBe(1.0);
    expect(result[0]!.triggeredBy).toContain('circular-deps');
  });

  it('returns empty when no hard addresses match active signals', () => {
    const snapshot = makeSnapshot({ signals: ['doc-gaps'] });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [{ signal: 'circular-deps', hard: true }],
      },
    });
    const result = matchHardRules(snapshot, index);
    expect(result).toHaveLength(0);
  });

  it('aggregates multiple hard triggers for the same skill', () => {
    const snapshot = makeSnapshot({ signals: ['circular-deps', 'layer-violations'] });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [
          { signal: 'circular-deps', hard: true },
          { signal: 'layer-violations', hard: true },
        ],
      },
    });
    const result = matchHardRules(snapshot, index);
    expect(result).toHaveLength(1);
    expect(result[0]!.triggeredBy).toContain('circular-deps');
    expect(result[0]!.triggeredBy).toContain('layer-violations');
    expect(result[0]!.reasons).toHaveLength(2);
  });

  it('ignores non-hard addresses', () => {
    const snapshot = makeSnapshot({ signals: ['high-coupling'] });
    const index = makeIndex({
      'dependency-health': {
        addresses: [{ signal: 'high-coupling', weight: 0.7 }],
      },
    });
    const result = matchHardRules(snapshot, index);
    expect(result).toHaveLength(0);
  });

  it('handles empty snapshot signals gracefully', () => {
    const snapshot = makeSnapshot({ signals: [] });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [{ signal: 'circular-deps', hard: true }],
      },
    });
    const result = matchHardRules(snapshot, index);
    expect(result).toHaveLength(0);
  });

  it('handles empty index gracefully', () => {
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    const index = makeIndex({});
    const result = matchHardRules(snapshot, index);
    expect(result).toHaveLength(0);
  });
});
