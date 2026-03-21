import { describe, it, expect } from 'vitest';
import {
  formatGitHubComment,
  formatGitHubSummary,
  isSmallSuggestion,
} from '../../../src/review/output/format-github';
import type { ReviewFinding, ReviewStrength } from '../../../src/review/types';

function makeFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: 'test-finding',
    file: 'src/auth.ts',
    lineRange: [10, 15],
    domain: 'bug',
    severity: 'important',
    title: 'Test finding',
    rationale: 'Test rationale',
    suggestion: 'const x = y?.z;',
    evidence: ['evidence'],
    validatedBy: 'heuristic',
    ...overrides,
  };
}

function makeStrength(overrides: Partial<ReviewStrength> = {}): ReviewStrength {
  return {
    file: 'src/auth.ts',
    description: 'Good error handling',
    ...overrides,
  };
}

describe('isSmallSuggestion()', () => {
  it('returns true for suggestions under 10 lines', () => {
    expect(isSmallSuggestion('line1\nline2\nline3')).toBe(true);
  });

  it('returns false for suggestions of 10+ lines', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
    expect(isSmallSuggestion(lines)).toBe(false);
  });

  it('returns false for undefined suggestion', () => {
    expect(isSmallSuggestion(undefined)).toBe(false);
  });

  it('returns true for exactly 9 lines', () => {
    const lines = Array.from({ length: 9 }, (_, i) => `line ${i}`).join('\n');
    expect(isSmallSuggestion(lines)).toBe(true);
  });
});

describe('formatGitHubComment()', () => {
  it('produces a committable suggestion block for small suggestions', () => {
    const result = formatGitHubComment(makeFinding({ suggestion: 'const x = y?.z;' }));
    expect(result.body).toContain('```suggestion');
    expect(result.body).toContain('const x = y?.z;');
    expect(result.body).toContain('```');
  });

  it('produces description + rationale for large suggestions', () => {
    const largeSuggestion = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
    const result = formatGitHubComment(makeFinding({ suggestion: largeSuggestion }));
    expect(result.body).not.toContain('```suggestion');
    expect(result.body).toContain('Test rationale');
    expect(result.body).toContain('Test finding');
  });

  it('produces description + rationale when no suggestion', () => {
    const result = formatGitHubComment(makeFinding({ suggestion: undefined }));
    expect(result.body).not.toContain('```suggestion');
    expect(result.body).toContain('Test rationale');
  });

  it('sets correct file path and line', () => {
    const result = formatGitHubComment(makeFinding({ file: 'src/foo.ts', lineRange: [42, 50] }));
    expect(result.path).toBe('src/foo.ts');
    expect(result.line).toBe(50);
    expect(result.side).toBe('RIGHT');
  });

  it('includes severity badge in the comment body', () => {
    const result = formatGitHubComment(makeFinding({ severity: 'critical' }));
    expect(result.body).toMatch(/critical/i);
  });
});

describe('formatGitHubSummary()', () => {
  it('includes Strengths section', () => {
    const result = formatGitHubSummary({
      findings: [],
      strengths: [makeStrength()],
    });
    expect(result).toContain('Strengths');
    expect(result).toContain('Good error handling');
  });

  it('includes Issues section with severity groups', () => {
    const findings = [
      makeFinding({ id: 'f1', severity: 'critical', title: 'Critical bug' }),
      makeFinding({ id: 'f2', severity: 'suggestion', title: 'Minor thing' }),
    ];
    const result = formatGitHubSummary({ findings, strengths: [] });
    expect(result).toContain('Critical');
    expect(result).toContain('Suggestion');
  });

  it('includes Assessment section', () => {
    const result = formatGitHubSummary({ findings: [], strengths: [] });
    expect(result).toContain('Assessment');
  });

  it('uses markdown formatting suitable for GitHub', () => {
    const result = formatGitHubSummary({
      findings: [makeFinding()],
      strengths: [makeStrength()],
    });
    // Should use markdown headers
    expect(result).toMatch(/^##/m);
  });
});
