import { describe, it, expect } from 'vitest';
import { computeTrustScores, getTrustLevel } from '../../src/review/trust-score';
import type { ReviewFinding } from '../../src/review/types';

function makeFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: 'bug-src-auth-ts-42-test',
    file: 'src/auth.ts',
    lineRange: [40, 45] as [number, number],
    domain: 'bug',
    severity: 'important',
    title: 'Test finding',
    rationale: 'Test rationale',
    evidence: ['evidence line'],
    validatedBy: 'heuristic',
    ...overrides,
  };
}

describe('computeTrustScores()', () => {
  it('returns findings with trustScore set', () => {
    const findings = [makeFinding()];
    const result = computeTrustScores(findings);
    expect(result).toHaveLength(1);
    expect(result[0]!.trustScore).toBeTypeOf('number');
    expect(result[0]!.trustScore).toBeGreaterThanOrEqual(0);
    expect(result[0]!.trustScore).toBeLessThanOrEqual(100);
  });

  it('scores mechanical + 3 evidence items between 85-100', () => {
    const findings = [
      makeFinding({
        domain: 'compliance',
        validatedBy: 'mechanical',
        evidence: ['a', 'b', 'c'],
      }),
    ];
    const result = computeTrustScores(findings);
    expect(result[0]!.trustScore).toBeGreaterThanOrEqual(85);
    expect(result[0]!.trustScore).toBeLessThanOrEqual(100);
  });

  it('scores heuristic + 0 evidence + no agreement below 40', () => {
    const findings = [
      makeFinding({
        validatedBy: 'heuristic',
        evidence: [],
      }),
    ];
    const result = computeTrustScores(findings);
    expect(result[0]!.trustScore).toBeLessThan(40);
  });

  it('boosts agreement factor when different domains overlap same file/lines', () => {
    const findings = [
      makeFinding({ id: 'a', domain: 'bug', file: 'src/x.ts', lineRange: [10, 20] }),
      makeFinding({ id: 'b', domain: 'security', file: 'src/x.ts', lineRange: [15, 25] }),
    ];
    const result = computeTrustScores(findings);
    const standalone = computeTrustScores([
      makeFinding({ id: 'a', domain: 'bug', file: 'src/x.ts', lineRange: [10, 20] }),
    ]);
    expect(result[0]!.trustScore).toBeGreaterThan(standalone[0]!.trustScore!);
  });

  it('does not boost agreement for same-domain overlaps', () => {
    const findings = [
      makeFinding({ id: 'a', domain: 'bug', file: 'src/x.ts', lineRange: [10, 20] }),
      makeFinding({ id: 'b', domain: 'bug', file: 'src/x.ts', lineRange: [15, 25] }),
    ];
    const result = computeTrustScores(findings);
    const standalone = computeTrustScores([
      makeFinding({ id: 'a', domain: 'bug', file: 'src/x.ts', lineRange: [10, 20] }),
    ]);
    expect(result[0]!.trustScore).toBe(standalone[0]!.trustScore);
  });

  it('is a pure function — same inputs produce same outputs', () => {
    const findings = [makeFinding(), makeFinding({ id: 'b', domain: 'security' })];
    const result1 = computeTrustScores(findings);
    const result2 = computeTrustScores(findings);
    expect(result1.map((f) => f.trustScore)).toEqual(result2.map((f) => f.trustScore));
  });

  it('graph validation scores higher than heuristic', () => {
    const heuristic = computeTrustScores([makeFinding({ validatedBy: 'heuristic' })]);
    const graph = computeTrustScores([makeFinding({ validatedBy: 'graph' })]);
    expect(graph[0]!.trustScore).toBeGreaterThan(heuristic[0]!.trustScore!);
  });

  it('more evidence produces higher score', () => {
    const noEvidence = computeTrustScores([makeFinding({ evidence: [] })]);
    const someEvidence = computeTrustScores([makeFinding({ evidence: ['a', 'b', 'c'] })]);
    expect(someEvidence[0]!.trustScore).toBeGreaterThan(noEvidence[0]!.trustScore!);
  });

  it('returns empty array for empty input', () => {
    expect(computeTrustScores([])).toEqual([]);
  });

  it('does not boost agreement for findings in different files', () => {
    const findings = [
      makeFinding({ id: 'a', domain: 'bug', file: 'src/a.ts', lineRange: [10, 20] }),
      makeFinding({ id: 'b', domain: 'security', file: 'src/b.ts', lineRange: [10, 20] }),
    ];
    const result = computeTrustScores(findings);
    const standalone = computeTrustScores([
      makeFinding({ id: 'a', domain: 'bug', file: 'src/a.ts', lineRange: [10, 20] }),
    ]);
    expect(result[0]!.trustScore).toBe(standalone[0]!.trustScore);
  });

  it('does not boost agreement for non-overlapping line ranges', () => {
    const findings = [
      makeFinding({ id: 'a', domain: 'bug', file: 'src/x.ts', lineRange: [10, 20] }),
      makeFinding({ id: 'b', domain: 'security', file: 'src/x.ts', lineRange: [30, 40] }),
    ];
    const result = computeTrustScores(findings);
    const standalone = computeTrustScores([
      makeFinding({ id: 'a', domain: 'bug', file: 'src/x.ts', lineRange: [10, 20] }),
    ]);
    expect(result[0]!.trustScore).toBe(standalone[0]!.trustScore);
  });

  it('does not mutate original findings', () => {
    const original = makeFinding();
    const originalCopy = { ...original };
    computeTrustScores([original]);
    expect(original).toEqual(originalCopy);
  });
});

describe('getTrustLevel()', () => {
  it('returns high for scores >= 70', () => {
    expect(getTrustLevel(70)).toBe('high');
    expect(getTrustLevel(100)).toBe('high');
  });

  it('returns medium for scores 40-69', () => {
    expect(getTrustLevel(40)).toBe('medium');
    expect(getTrustLevel(69)).toBe('medium');
  });

  it('returns low for scores < 40', () => {
    expect(getTrustLevel(39)).toBe('low');
    expect(getTrustLevel(0)).toBe('low');
  });
});
