import { describe, it, expect } from 'vitest';
import {
  HEALTH_SIGNALS,
  type HealthSignal,
  type Recommendation,
  type RecommendationResult,
} from '../../src/skill/recommendation-types';

describe('HEALTH_SIGNALS', () => {
  it('exports a non-empty const array of signal identifiers', () => {
    expect(Array.isArray(HEALTH_SIGNALS)).toBe(true);
    expect(HEALTH_SIGNALS.length).toBeGreaterThan(0);
  });

  it('contains expected core signals', () => {
    expect(HEALTH_SIGNALS).toContain('circular-deps');
    expect(HEALTH_SIGNALS).toContain('layer-violations');
    expect(HEALTH_SIGNALS).toContain('high-coupling');
    expect(HEALTH_SIGNALS).toContain('high-complexity');
    expect(HEALTH_SIGNALS).toContain('low-coverage');
    expect(HEALTH_SIGNALS).toContain('dead-code');
    expect(HEALTH_SIGNALS).toContain('drift');
    expect(HEALTH_SIGNALS).toContain('security-findings');
    expect(HEALTH_SIGNALS).toContain('doc-gaps');
    expect(HEALTH_SIGNALS).toContain('perf-regression');
    expect(HEALTH_SIGNALS).toContain('anomaly-outlier');
    expect(HEALTH_SIGNALS).toContain('articulation-point');
  });

  it('contains exactly 12 signals', () => {
    expect(HEALTH_SIGNALS).toHaveLength(12);
  });
});

describe('Recommendation type', () => {
  it('is structurally valid when all fields are present', () => {
    const rec: Recommendation = {
      skillName: 'harness-enforce-architecture',
      score: 0.95,
      urgency: 'critical',
      reasons: ['3 circular dependencies detected'],
      sequence: 1,
      triggeredBy: ['circular-deps'],
    };
    expect(rec.skillName).toBe('harness-enforce-architecture');
    expect(rec.urgency).toBe('critical');
  });
});

describe('RecommendationResult type', () => {
  it('is structurally valid when all fields are present', () => {
    const result: RecommendationResult = {
      recommendations: [],
      snapshotAge: 'fresh',
      sequenceReasoning: 'No recommendations needed.',
    };
    expect(result.recommendations).toEqual([]);
    expect(result.sequenceReasoning).toBe('No recommendations needed.');
  });
});
