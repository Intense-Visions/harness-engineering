import { describe, it, expect } from 'vitest';
import {
  HEALTH_SIGNALS,
  type HealthSignal,
  type Recommendation,
  type RecommendationResult,
  type KnowledgeRecommendation,
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

  it('contains exactly 28 signals', () => {
    expect(HEALTH_SIGNALS).toHaveLength(28);
  });

  it('contains change-type signals', () => {
    expect(HEALTH_SIGNALS).toContain('change-feature');
    expect(HEALTH_SIGNALS).toContain('change-bugfix');
    expect(HEALTH_SIGNALS).toContain('change-refactor');
    expect(HEALTH_SIGNALS).toContain('change-docs');
  });

  it('contains domain signals', () => {
    const domainSignals = [
      'domain-database',
      'domain-containerization',
      'domain-deployment',
      'domain-infrastructure-as-code',
      'domain-api-design',
      'domain-secrets',
      'domain-e2e',
      'domain-mutation-test',
      'domain-load-testing',
      'domain-data-pipeline',
      'domain-mobile-patterns',
      'domain-incident-response',
    ];
    for (const signal of domainSignals) {
      expect(HEALTH_SIGNALS).toContain(signal);
    }
  });

  it('HealthSignal type accepts change-type and domain values', () => {
    const changeSignal: HealthSignal = 'change-feature';
    const domainSignal: HealthSignal = 'domain-database';
    expect(changeSignal).toBe('change-feature');
    expect(domainSignal).toBe('domain-database');
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

describe('RecommendationResult — knowledgeRecommendations field', () => {
  it('accepts RecommendationResult with empty knowledgeRecommendations', () => {
    const result: RecommendationResult = {
      recommendations: [],
      snapshotAge: 'fresh',
      sequenceReasoning: 'No signals.',
      knowledgeRecommendations: [],
    };
    expect(result.knowledgeRecommendations).toEqual([]);
  });

  it('accepts RecommendationResult with knowledge recommendations', () => {
    const kr: KnowledgeRecommendation = {
      skillName: 'react-hooks-pattern',
      score: 0.85,
      paths: ['**/*.tsx'],
    };
    const result: RecommendationResult = {
      recommendations: [],
      snapshotAge: 'fresh',
      sequenceReasoning: 'Test.',
      knowledgeRecommendations: [kr],
    };
    expect(result.knowledgeRecommendations![0]!.skillName).toBe('react-hooks-pattern');
    expect(result.knowledgeRecommendations![0]!.score).toBe(0.85);
  });
});
