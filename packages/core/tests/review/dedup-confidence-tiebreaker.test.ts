import { describe, expect, it } from 'vitest';
import { deduplicateFindings } from '../../src/review/deduplicate-findings';
import type { ReviewFinding } from '../../src/review/types';

function f(input: Partial<ReviewFinding> & Pick<ReviewFinding, 'id'>): ReviewFinding {
  return {
    file: 'src/x.ts',
    lineRange: [10, 10],
    domain: 'bug',
    severity: 'important',
    title: input.title ?? 'Issue',
    rationale: input.rationale ?? 'rationale',
    evidence: input.evidence ?? ['e1'],
    validatedBy: input.validatedBy ?? 'heuristic',
    ...input,
  };
}

describe('dedup confidence tiebreaker', () => {
  it('higher severity wins regardless of confidence', () => {
    const findings = [
      f({ id: 'a', severity: 'critical', subagent: 'bug' }),
      f({ id: 'b', severity: 'important', confidence: 100, subagent: 'adversarial' }),
    ];
    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(1);
    expect(result[0]!.severity).toBe('critical');
  });

  it('on severity tie, confidence-set finding wins', () => {
    const findings = [
      f({ id: 'plain', severity: 'important', subagent: 'bug' }),
      f({ id: 'confident', severity: 'important', confidence: 100, subagent: 'adversarial' }),
    ];
    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(1);
    expect(result[0]!.subagent).toBe('adversarial');
  });

  it('on severity tie + both confident, higher numeric confidence wins', () => {
    const findings = [
      f({ id: 'mid', severity: 'important', confidence: 50, subagent: 'frontend-races' }),
      f({ id: 'high', severity: 'important', confidence: 100, subagent: 'typescript-strict' }),
    ];
    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(1);
    expect(result[0]!.subagent).toBe('typescript-strict');
  });

  it('legacy string confidence maps to numeric for tiebreaking', () => {
    const findings = [
      f({ id: 'legacy-low', severity: 'important', confidence: 'low' as const }),
      f({ id: 'numeric-high', severity: 'important', confidence: 100, subagent: 'adversarial' }),
    ];
    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(1);
    expect(result[0]!.subagent).toBe('adversarial');
  });

  it('preserves subagent from primary when merging', () => {
    const findings = [
      f({ id: 'bug', severity: 'important', subagent: 'bug' }),
      f({
        id: 'adversarial',
        severity: 'critical',
        confidence: 100,
        subagent: 'adversarial',
      }),
    ];
    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(1);
    expect(result[0]!.subagent).toBe('adversarial');
  });

  it('non-overlapping findings are not merged', () => {
    const findings = [f({ id: 'a', lineRange: [1, 1] }), f({ id: 'b', lineRange: [100, 100] })];
    expect(deduplicateFindings({ findings })).toHaveLength(2);
  });
});
