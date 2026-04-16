import { describe, it, expect } from 'vitest';
import { scoreToConcernSignals } from '../../src/cml/signals.js';
import type { ComplexityScore } from '../../src/types.js';

/* ---------- helpers ---------- */

function makeScore(overrides: Partial<ComplexityScore> = {}): ComplexityScore {
  return {
    overall: 0.2,
    confidence: 0.5,
    riskLevel: 'low',
    blastRadius: {
      services: 1,
      modules: 1,
      filesEstimated: 5,
      testFilesAffected: 2,
    },
    dimensions: {
      structural: 0.1,
      semantic: 0.1,
      historical: 0,
    },
    reasoning: ['Low complexity across all dimensions'],
    recommendedRoute: 'local',
    ...overrides,
  };
}

/* ---------- tests ---------- */

describe('scoreToConcernSignals', () => {
  it('returns an empty array for a low overall score', () => {
    const score = makeScore({ overall: 0.2 });
    const signals = scoreToConcernSignals(score);
    expect(signals).toEqual([]);
  });

  it('returns a highComplexity signal when overall >= 0.7', () => {
    const score = makeScore({
      overall: 0.75,
      reasoning: ['Structural complexity: 0.80', 'Semantic complexity: 0.60'],
    });
    const signals = scoreToConcernSignals(score);

    expect(signals).toContainEqual({
      name: 'highComplexity',
      reason: 'Structural complexity: 0.80; Semantic complexity: 0.60',
    });
  });

  it('returns a largeBlastRadius signal when filesEstimated > 20', () => {
    const score = makeScore({
      blastRadius: {
        services: 3,
        modules: 5,
        filesEstimated: 25,
        testFilesAffected: 10,
      },
    });
    const signals = scoreToConcernSignals(score);

    expect(signals).toContainEqual({
      name: 'largeBlastRadius',
      reason: '25 files estimated to be affected',
    });
  });

  it('returns a highAmbiguity signal when semantic dimension > 0.6', () => {
    const score = makeScore({
      dimensions: {
        structural: 0.1,
        semantic: 0.7,
        historical: 0,
      },
    });
    const signals = scoreToConcernSignals(score);

    expect(signals).toContainEqual({
      name: 'highAmbiguity',
      reason: 'Significant unknowns or ambiguities in spec',
    });
  });

  it('fires multiple signals simultaneously when all thresholds are exceeded', () => {
    const score = makeScore({
      overall: 0.8,
      riskLevel: 'critical',
      blastRadius: {
        services: 5,
        modules: 8,
        filesEstimated: 30,
        testFilesAffected: 15,
      },
      dimensions: {
        structural: 0.9,
        semantic: 0.7,
        historical: 0.3,
      },
      reasoning: ['Very high structural complexity', 'Many unknowns'],
      recommendedRoute: 'human',
    });
    const signals = scoreToConcernSignals(score);

    expect(signals).toHaveLength(3);
    expect(signals.map((s) => s.name)).toEqual([
      'highComplexity',
      'largeBlastRadius',
      'highAmbiguity',
    ]);
  });
});
