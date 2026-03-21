import { describe, it, expect } from 'vitest';
import { determineAssessment, getExitCode } from '../../../src/review/output/assessment';
import type { ReviewFinding } from '../../../src/review/types';

function makeFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: 'test-finding',
    file: 'src/auth.ts',
    lineRange: [10, 15],
    domain: 'bug',
    severity: 'important',
    title: 'Test finding',
    rationale: 'Test rationale',
    evidence: ['evidence'],
    validatedBy: 'heuristic',
    ...overrides,
  };
}

describe('determineAssessment()', () => {
  it('returns approve when there are no findings', () => {
    expect(determineAssessment([])).toBe('approve');
  });

  it('returns approve when all findings are suggestions', () => {
    const findings = [
      makeFinding({ severity: 'suggestion' }),
      makeFinding({ severity: 'suggestion', id: 'f2' }),
    ];
    expect(determineAssessment(findings)).toBe('approve');
  });

  it('returns comment when highest severity is important', () => {
    const findings = [
      makeFinding({ severity: 'important' }),
      makeFinding({ severity: 'suggestion', id: 'f2' }),
    ];
    expect(determineAssessment(findings)).toBe('comment');
  });

  it('returns request-changes when any finding is critical', () => {
    const findings = [
      makeFinding({ severity: 'critical' }),
      makeFinding({ severity: 'suggestion', id: 'f2' }),
    ];
    expect(determineAssessment(findings)).toBe('request-changes');
  });

  it('returns request-changes when multiple critical findings exist', () => {
    const findings = [
      makeFinding({ severity: 'critical', id: 'f1' }),
      makeFinding({ severity: 'critical', id: 'f2' }),
    ];
    expect(determineAssessment(findings)).toBe('request-changes');
  });
});

describe('getExitCode()', () => {
  it('returns 0 for approve', () => {
    expect(getExitCode('approve')).toBe(0);
  });

  it('returns 0 for comment', () => {
    expect(getExitCode('comment')).toBe(0);
  });

  it('returns 1 for request-changes', () => {
    expect(getExitCode('request-changes')).toBe(1);
  });
});
