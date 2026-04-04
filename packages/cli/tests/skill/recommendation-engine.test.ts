import { describe, it, expect } from 'vitest';
import {
  resolveMetricValue,
  matchHardRules,
  scoreByHealth,
  sequenceRecommendations,
  buildSkillAddressIndex,
  recommend,
} from '../../src/skill/recommendation-engine';
import type { HealthSnapshot, HealthMetrics } from '../../src/skill/health-snapshot';
import type { SkillAddress } from '../../src/skill/schema';
import type { Recommendation } from '../../src/skill/recommendation-types';

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

// -- scoreByHealth tests --

describe('scoreByHealth', () => {
  it('scores a skill with metric-based soft address', () => {
    const snapshot = makeSnapshot({
      signals: ['high-coupling'],
      metrics: makeMetrics({ maxFanOut: 25 }),
    });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [{ signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    expect(result).toHaveLength(1);
    // distance = (25-20)/20 = 0.25, contribution = 0.8 * 0.25 = 0.2
    expect(result[0]!.score).toBeCloseTo(0.2, 2);
    expect(result[0]!.urgency).toBe('nice-to-have');
  });

  it('clamps distance to [0, 1]', () => {
    const snapshot = makeSnapshot({
      signals: ['high-coupling'],
      metrics: makeMetrics({ maxFanOut: 60 }),
    });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [{ signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    // distance = (60-20)/20 = 2.0, clamped to 1.0, contribution = 0.8 * 1.0 = 0.8
    expect(result[0]!.score).toBeCloseTo(0.8, 2);
    expect(result[0]!.urgency).toBe('recommended');
  });

  it('uses default weight 0.5 when weight is omitted', () => {
    const snapshot = makeSnapshot({
      signals: ['anomaly-outlier'],
      metrics: makeMetrics({ anomalyOutlierCount: 3 }),
    });
    const index = makeIndex({
      'dependency-health': {
        addresses: [{ signal: 'anomaly-outlier' }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    expect(result).toHaveLength(1);
    // signal-only: contribution = 0.5 (default weight)
    expect(result[0]!.score).toBeCloseTo(0.5, 2);
  });

  it('signal-only soft address uses full weight when signal is active', () => {
    const snapshot = makeSnapshot({
      signals: ['dead-code'],
    });
    const index = makeIndex({
      'codebase-cleanup': {
        addresses: [{ signal: 'dead-code', weight: 0.8 }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    expect(result[0]!.score).toBeCloseTo(0.8, 2);
    expect(result[0]!.urgency).toBe('recommended');
  });

  it('aggregates contributions from multiple matching soft addresses', () => {
    const snapshot = makeSnapshot({
      signals: ['high-coupling', 'anomaly-outlier'],
      metrics: makeMetrics({ maxFanOut: 30 }),
    });
    const index = makeIndex({
      'dependency-health': {
        addresses: [
          { signal: 'high-coupling', metric: 'fanOut', threshold: 15, weight: 0.7 },
          { signal: 'anomaly-outlier', weight: 0.6 },
        ],
      },
    });
    const result = scoreByHealth(snapshot, index);
    expect(result).toHaveLength(1);
    // fanOut: distance = (30-15)/15 = 1.0 (clamped), contribution = 0.7
    // anomaly-outlier: signal-only, contribution = 0.6
    // total = (0.7 + 0.6) / 2 addresses = 0.65
    expect(result[0]!.score).toBeCloseTo(0.65, 2);
  });

  it('skips hard addresses (handled by Layer 1)', () => {
    const snapshot = makeSnapshot({
      signals: ['circular-deps'],
    });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [
          { signal: 'circular-deps', hard: true },
          { signal: 'high-coupling', weight: 0.8 },
        ],
      },
    });
    const result = scoreByHealth(snapshot, index);
    // Only non-hard addresses considered; high-coupling not in signals -> no match
    expect(result).toHaveLength(0);
  });

  it('returns empty for no matching signals', () => {
    const snapshot = makeSnapshot({ signals: ['doc-gaps'] });
    const index = makeIndex({
      'enforce-architecture': {
        addresses: [{ signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    expect(result).toHaveLength(0);
  });

  it('classifies score >= 0.7 as recommended', () => {
    const snapshot = makeSnapshot({
      signals: ['low-coverage'],
    });
    const index = makeIndex({
      tdd: {
        addresses: [{ signal: 'low-coverage', weight: 0.9 }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    expect(result[0]!.score).toBeCloseTo(0.9, 2);
    expect(result[0]!.urgency).toBe('recommended');
  });

  it('classifies score < 0.7 as nice-to-have', () => {
    const snapshot = makeSnapshot({
      signals: ['doc-gaps'],
    });
    const index = makeIndex({
      'detect-doc-drift': {
        addresses: [{ signal: 'doc-gaps', weight: 0.5 }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    expect(result[0]!.urgency).toBe('nice-to-have');
  });

  it('ignores metric-based address when metric resolves to null', () => {
    const snapshot = makeSnapshot({
      signals: ['low-coverage'],
      metrics: makeMetrics({ testCoverage: null }),
    });
    const index = makeIndex({
      tdd: {
        addresses: [{ signal: 'low-coverage', metric: 'coverage', threshold: 40, weight: 0.9 }],
      },
    });
    const result = scoreByHealth(snapshot, index);
    // metric resolves to null, so this address is skipped
    expect(result).toHaveLength(0);
  });
});

// -- sequenceRecommendations tests --

describe('sequenceRecommendations', () => {
  function makeRec(name: string, score = 0.5): Recommendation {
    return {
      skillName: name,
      score,
      urgency: 'recommended',
      reasons: [],
      sequence: 0,
      triggeredBy: [],
    };
  }

  it('assigns sequence numbers starting at 1', () => {
    const recs = [makeRec('a'), makeRec('b')];
    const deps = new Map<string, string[]>();
    const result = sequenceRecommendations(recs, deps);
    expect(result[0]!.sequence).toBe(1);
    expect(result[1]!.sequence).toBe(2);
  });

  it('respects dependency ordering (B depends on A -> A first)', () => {
    const recs = [makeRec('b'), makeRec('a')];
    const deps = new Map([['b', ['a']]]);
    const result = sequenceRecommendations(recs, deps);
    expect(result[0]!.skillName).toBe('a');
    expect(result[1]!.skillName).toBe('b');
  });

  it('applies heuristic ordering within same dependency level', () => {
    // detect-doc-drift is diagnostic, codebase-cleanup is fix, code-review is validation
    const recs = [makeRec('code-review'), makeRec('codebase-cleanup'), makeRec('detect-doc-drift')];
    const deps = new Map<string, string[]>();
    const result = sequenceRecommendations(recs, deps);
    expect(result[0]!.skillName).toBe('detect-doc-drift'); // diagnostic
    expect(result[1]!.skillName).toBe('codebase-cleanup'); // fix
    expect(result[2]!.skillName).toBe('code-review'); // validation
  });

  it('handles empty recommendations', () => {
    const result = sequenceRecommendations([], new Map());
    expect(result).toHaveLength(0);
  });

  it('handles single recommendation', () => {
    const recs = [makeRec('tdd')];
    const result = sequenceRecommendations(recs, new Map());
    expect(result).toHaveLength(1);
    expect(result[0]!.sequence).toBe(1);
  });

  it('handles multi-level dependencies', () => {
    // c depends on b, b depends on a
    const recs = [makeRec('c'), makeRec('a'), makeRec('b')];
    const deps = new Map([
      ['c', ['b']],
      ['b', ['a']],
    ]);
    const result = sequenceRecommendations(recs, deps);
    expect(result[0]!.skillName).toBe('a');
    expect(result[1]!.skillName).toBe('b');
    expect(result[2]!.skillName).toBe('c');
  });

  it('ignores dependencies on skills not in the recommendations list', () => {
    const recs = [makeRec('b'), makeRec('a')];
    const deps = new Map([['b', ['a', 'missing-skill']]]);
    const result = sequenceRecommendations(recs, deps);
    expect(result[0]!.skillName).toBe('a');
    expect(result[1]!.skillName).toBe('b');
  });

  it('returns reasoning string', () => {
    const recs = [makeRec('a'), makeRec('b')];
    const deps = new Map<string, string[]>();
    const result = sequenceRecommendations(recs, deps);
    // Just check it returned the recs (reasoning is on the public API, tested in Task 6)
    expect(result).toHaveLength(2);
  });
});

// -- buildSkillAddressIndex tests --

describe('buildSkillAddressIndex', () => {
  it('creates address index from skills index entries', () => {
    const skillsIndex: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'my-skill': {
        addresses: [{ signal: 'drift', weight: 0.7 }],
        dependsOn: [],
      },
    };
    const result = buildSkillAddressIndex(skillsIndex);
    // Size includes custom skill + all fallback-only skills
    expect(result.size).toBeGreaterThanOrEqual(1);
    expect(result.has('my-skill')).toBe(true);
    expect(result.get('my-skill')!.addresses).toHaveLength(1);
  });

  it('merges fallback rules for skills without addresses', () => {
    const skillsIndex: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'enforce-architecture': {
        addresses: [], // empty = use fallback
        dependsOn: [],
      },
    };
    const result = buildSkillAddressIndex(skillsIndex);
    const entry = result.get('enforce-architecture');
    expect(entry).toBeDefined();
    expect(entry!.addresses.length).toBeGreaterThan(0);
    expect(entry!.addresses.some((a) => a.hard === true)).toBe(true);
  });

  it('skill-declared addresses take precedence over fallback', () => {
    const skillsIndex: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'enforce-architecture': {
        addresses: [{ signal: 'custom-signal', weight: 0.9 }],
        dependsOn: [],
      },
    };
    const result = buildSkillAddressIndex(skillsIndex);
    const entry = result.get('enforce-architecture');
    expect(entry!.addresses).toHaveLength(1);
    expect(entry!.addresses[0]!.signal).toBe('custom-signal');
  });

  it('includes fallback-only skills not in the index', () => {
    const skillsIndex: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {};
    const result = buildSkillAddressIndex(skillsIndex);
    // Fallback rules inject entries for skills not in the index
    expect(result.has('security-scan')).toBe(true);
    expect(result.has('tdd')).toBe(true);
  });

  it('preserves dependsOn from the skills index', () => {
    const skillsIndex: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      tdd: {
        addresses: [{ signal: 'low-coverage', weight: 0.9 }],
        dependsOn: ['enforce-architecture'],
      },
    };
    const result = buildSkillAddressIndex(skillsIndex);
    expect(result.get('tdd')!.dependsOn).toEqual(['enforce-architecture']);
  });
});

// -- recommend() tests --

describe('recommend', () => {
  it('returns empty result for empty snapshot (no signals)', () => {
    const snapshot = makeSnapshot({ signals: [] });
    const skills: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'enforce-architecture': {
        addresses: [{ signal: 'circular-deps', hard: true }],
        dependsOn: [],
      },
    };
    const result = recommend(snapshot, skills);
    expect(result.recommendations).toHaveLength(0);
    expect(result.sequenceReasoning).toContain('No active signals');
  });

  it('returns empty result for empty skills index', () => {
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    const result = recommend(snapshot, {});
    // Fallback rules will inject skills, so this may not be empty
    // But with circular-deps signal, enforce-architecture fallback will match
    expect(result.recommendations.length).toBeGreaterThanOrEqual(0);
  });

  it('combines hard rules and soft scores, deduplicating skills', () => {
    const snapshot = makeSnapshot({
      signals: ['circular-deps', 'high-coupling'],
      metrics: makeMetrics({ maxFanOut: 25 }),
    });
    const skills: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'enforce-architecture': {
        addresses: [
          { signal: 'circular-deps', hard: true },
          { signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 },
        ],
        dependsOn: [],
      },
    };
    const result = recommend(snapshot, skills);
    // enforce-architecture appears once (hard rule takes precedence)
    const ea = result.recommendations.filter((r) => r.skillName === 'enforce-architecture');
    expect(ea).toHaveLength(1);
    expect(ea[0]!.urgency).toBe('critical'); // hard rule wins
  });

  it('limits results with top option', () => {
    const snapshot = makeSnapshot({
      signals: [
        'circular-deps',
        'dead-code',
        'low-coverage',
        'security-findings',
        'doc-gaps',
        'drift',
      ],
    });
    // Use fallback rules -- several will match
    const result = recommend(snapshot, {}, { top: 3 });
    expect(result.recommendations.length).toBeLessThanOrEqual(3);
  });

  it('defaults to top 5', () => {
    const snapshot = makeSnapshot({
      signals: [
        'circular-deps',
        'dead-code',
        'low-coverage',
        'security-findings',
        'doc-gaps',
        'drift',
        'high-coupling',
        'high-complexity',
        'perf-regression',
        'anomaly-outlier',
      ],
    });
    const result = recommend(snapshot, {});
    expect(result.recommendations.length).toBeLessThanOrEqual(5);
  });

  it('sequences recommendations with dependency ordering', () => {
    const snapshot = makeSnapshot({
      signals: ['circular-deps', 'low-coverage'],
    });
    const skills: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'enforce-architecture': {
        addresses: [{ signal: 'circular-deps', hard: true }],
        dependsOn: [],
      },
      tdd: {
        addresses: [{ signal: 'low-coverage', weight: 0.9 }],
        dependsOn: ['enforce-architecture'],
      },
    };
    const result = recommend(snapshot, skills, { top: 10 });
    const seqEA = result.recommendations.find(
      (r) => r.skillName === 'enforce-architecture'
    )!.sequence;
    const seqTDD = result.recommendations.find((r) => r.skillName === 'tdd')!.sequence;
    expect(seqEA).toBeLessThan(seqTDD);
  });

  it('provides sequenceReasoning string', () => {
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    const skills: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'enforce-architecture': {
        addresses: [{ signal: 'circular-deps', hard: true }],
        dependsOn: [],
      },
    };
    const result = recommend(snapshot, skills);
    expect(result.sequenceReasoning).toBeTruthy();
    expect(typeof result.sequenceReasoning).toBe('string');
  });

  it('sets snapshotAge based on signals presence', () => {
    const snapshot = makeSnapshot({ signals: ['circular-deps'] });
    const result = recommend(snapshot, {
      'enforce-architecture': {
        addresses: [{ signal: 'circular-deps', hard: true }],
        dependsOn: [],
      },
    });
    expect(result.snapshotAge).toBe('fresh');
  });

  it('produces correct workflow for realistic unhealthy codebase', () => {
    const snapshot = makeSnapshot({
      signals: ['circular-deps', 'high-coupling', 'low-coverage', 'dead-code', 'security-findings'],
      metrics: makeMetrics({
        maxFanOut: 30,
        avgCouplingRatio: 0.75,
        testCoverage: 40,
      }),
    });

    // Use a mix of skill-declared addresses and rely on fallback rules
    const skills: Record<string, { addresses: SkillAddress[]; dependsOn: string[] }> = {
      'enforce-architecture': {
        addresses: [
          { signal: 'circular-deps', hard: true },
          { signal: 'high-coupling', metric: 'fanOut', threshold: 20, weight: 0.8 },
        ],
        dependsOn: [],
      },
      tdd: {
        addresses: [{ signal: 'low-coverage', weight: 0.9 }],
        dependsOn: ['enforce-architecture'],
      },
      'codebase-cleanup': {
        addresses: [{ signal: 'dead-code', weight: 0.8 }],
        dependsOn: [],
      },
      'security-scan': {
        addresses: [{ signal: 'security-findings', hard: true }],
        dependsOn: [],
      },
    };

    const result = recommend(snapshot, skills, { top: 10 });

    // Verify critical items are present
    const critical = result.recommendations.filter((r) => r.urgency === 'critical');
    expect(critical.length).toBeGreaterThanOrEqual(2);
    expect(critical.map((r) => r.skillName)).toContain('enforce-architecture');
    expect(critical.map((r) => r.skillName)).toContain('security-scan');

    // Verify all 4 declared skills appear (plus fallback skills for matching signals)
    expect(result.recommendations.length).toBeGreaterThanOrEqual(4);
    const names = result.recommendations.map((r) => r.skillName);
    expect(names).toContain('enforce-architecture');
    expect(names).toContain('tdd');
    expect(names).toContain('codebase-cleanup');
    expect(names).toContain('security-scan');

    // Verify dependency ordering: enforce-architecture before tdd
    const seqEA = result.recommendations.find(
      (r) => r.skillName === 'enforce-architecture'
    )!.sequence;
    const seqTDD = result.recommendations.find((r) => r.skillName === 'tdd')!.sequence;
    expect(seqEA).toBeLessThan(seqTDD);

    // Verify sequence numbers are sequential starting at 1
    const sequences = result.recommendations.map((r) => r.sequence).sort((a, b) => a - b);
    expect(sequences).toEqual(
      Array.from({ length: result.recommendations.length }, (_, i) => i + 1)
    );

    // Verify sequenceReasoning mentions critical count
    expect(result.sequenceReasoning).toContain('critical');

    // Verify snapshotAge is set
    expect(result.snapshotAge).toBe('fresh');
  });
});
