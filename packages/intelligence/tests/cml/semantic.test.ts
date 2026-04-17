import { describe, it, expect } from 'vitest';
import { computeSemanticComplexity } from '../../src/cml/semantic.js';
import type { EnrichedSpec } from '../../src/types.js';

function makeSpec(overrides: Partial<EnrichedSpec> = {}): EnrichedSpec {
  return {
    id: 'spec-1',
    title: 'Test spec',
    intent: 'test',
    summary: 'A test spec',
    affectedSystems: [],
    functionalRequirements: [],
    nonFunctionalRequirements: [],
    apiChanges: [],
    dbChanges: [],
    integrationPoints: [],
    assumptions: [],
    unknowns: [],
    ambiguities: [],
    riskSignals: [],
    initialComplexityHints: { textualComplexity: 0, structuralComplexity: 0 },
    ...overrides,
  };
}

describe('computeSemanticComplexity', () => {
  it('returns 0 when there are no unknowns, ambiguities, or risk signals', () => {
    const spec = makeSpec();
    expect(computeSemanticComplexity(spec)).toBe(0);
  });

  it('returns value in [0, 1] range', () => {
    const spec = makeSpec({
      unknowns: ['u1', 'u2'],
      ambiguities: ['a1'],
      riskSignals: ['r1', 'r2', 'r3'],
    });
    const result = computeSemanticComplexity(spec);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('increases with more unknowns', () => {
    const specNone = makeSpec({ unknowns: [] });
    const specFew = makeSpec({ unknowns: ['u1', 'u2'] });
    const specMany = makeSpec({ unknowns: ['u1', 'u2', 'u3', 'u4', 'u5'] });

    const scoreNone = computeSemanticComplexity(specNone);
    const scoreFew = computeSemanticComplexity(specFew);
    const scoreMany = computeSemanticComplexity(specMany);

    expect(scoreFew).toBeGreaterThan(scoreNone);
    expect(scoreMany).toBeGreaterThan(scoreFew);
  });

  it('increases with more ambiguities', () => {
    const specNone = makeSpec({ ambiguities: [] });
    const specSome = makeSpec({ ambiguities: ['a1', 'a2', 'a3'] });

    expect(computeSemanticComplexity(specSome)).toBeGreaterThan(
      computeSemanticComplexity(specNone)
    );
  });

  it('increases with more risk signals', () => {
    const specNone = makeSpec({ riskSignals: [] });
    const specSome = makeSpec({ riskSignals: ['r1', 'r2'] });

    expect(computeSemanticComplexity(specSome)).toBeGreaterThan(
      computeSemanticComplexity(specNone)
    );
  });

  it('has diminishing returns — marginal items add less score', () => {
    const spec1 = makeSpec({ unknowns: ['u1'] });
    const spec2 = makeSpec({ unknowns: ['u1', 'u2'] });
    const spec10 = makeSpec({
      unknowns: Array.from({ length: 10 }, (_, i) => `u${i}`),
    });
    const spec11 = makeSpec({
      unknowns: Array.from({ length: 11 }, (_, i) => `u${i}`),
    });

    const delta1to2 = computeSemanticComplexity(spec2) - computeSemanticComplexity(spec1);
    const delta10to11 = computeSemanticComplexity(spec11) - computeSemanticComplexity(spec10);

    // Adding the 2nd unknown should have more impact than adding the 11th
    expect(delta1to2).toBeGreaterThan(delta10to11);
  });

  it('combines all three dimensions', () => {
    const specUnknownsOnly = makeSpec({ unknowns: ['u1'] });
    const specAll = makeSpec({
      unknowns: ['u1'],
      ambiguities: ['a1'],
      riskSignals: ['r1'],
    });

    expect(computeSemanticComplexity(specAll)).toBeGreaterThan(
      computeSemanticComplexity(specUnknownsOnly)
    );
  });

  it('stays below 1 even with many signals in all dimensions', () => {
    const spec = makeSpec({
      unknowns: Array.from({ length: 20 }, (_, i) => `u${i}`),
      ambiguities: Array.from({ length: 20 }, (_, i) => `a${i}`),
      riskSignals: Array.from({ length: 20 }, (_, i) => `r${i}`),
    });
    const result = computeSemanticComplexity(spec);
    expect(result).toBeLessThanOrEqual(1);
    expect(result).toBeGreaterThan(0.8); // Should be near saturation
  });
});
