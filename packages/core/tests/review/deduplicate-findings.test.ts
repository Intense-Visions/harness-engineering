import { describe, it, expect } from 'vitest';
import { deduplicateFindings } from '../../src/review/deduplicate-findings';
import type { ReviewFinding } from '../../src/review/types';

function makeFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: 'bug-src-auth-ts-42-test',
    file: 'src/auth.ts',
    lineRange: [40, 45],
    domain: 'bug',
    severity: 'important',
    title: 'Test finding',
    rationale: 'Test rationale',
    evidence: ['evidence line'],
    validatedBy: 'heuristic',
    ...overrides,
  };
}

describe('deduplicateFindings()', () => {
  it('returns findings unchanged when no overlaps exist', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/a.ts', lineRange: [1, 5] }),
      makeFinding({ id: 'b', file: 'src/b.ts', lineRange: [1, 5] }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(2);
  });

  it('merges findings on the same file with overlapping line ranges', () => {
    const findings = [
      makeFinding({
        id: 'a',
        file: 'src/auth.ts',
        lineRange: [40, 45],
        domain: 'bug',
        severity: 'important',
      }),
      makeFinding({
        id: 'b',
        file: 'src/auth.ts',
        lineRange: [43, 48],
        domain: 'security',
        severity: 'critical',
      }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(1);
  });

  it('merges findings within lineGap tolerance (default 3 lines)', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [10, 15] }),
      makeFinding({ id: 'b', file: 'src/auth.ts', lineRange: [18, 22] }), // gap of 3 lines
    ];

    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(1);
  });

  it('does not merge findings beyond lineGap tolerance', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [10, 15] }),
      makeFinding({ id: 'b', file: 'src/auth.ts', lineRange: [19, 22] }), // gap of 4 lines
    ];

    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(2);
  });

  it('keeps the highest severity when merging', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [40, 45], severity: 'suggestion' }),
      makeFinding({ id: 'b', file: 'src/auth.ts', lineRange: [43, 48], severity: 'critical' }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result[0]!.severity).toBe('critical');
  });

  it('combines evidence arrays when merging', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [40, 45], evidence: ['ev1'] }),
      makeFinding({ id: 'b', file: 'src/auth.ts', lineRange: [43, 48], evidence: ['ev2'] }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result[0]!.evidence).toContain('ev1');
    expect(result[0]!.evidence).toContain('ev2');
  });

  it('preserves the longest (strongest) rationale when merging', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [40, 45], rationale: 'Short.' }),
      makeFinding({
        id: 'b',
        file: 'src/auth.ts',
        lineRange: [43, 48],
        rationale: 'This is a much longer and more detailed rationale explaining the issue.',
      }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result[0]!.rationale).toBe(
      'This is a much longer and more detailed rationale explaining the issue.'
    );
  });

  it('merges domains into the title', () => {
    const findings = [
      makeFinding({
        id: 'a',
        file: 'src/auth.ts',
        lineRange: [40, 45],
        domain: 'bug',
        title: 'Null check missing',
      }),
      makeFinding({
        id: 'b',
        file: 'src/auth.ts',
        lineRange: [43, 48],
        domain: 'security',
        title: 'Unsafe access pattern',
      }),
    ];

    const result = deduplicateFindings({ findings });
    // Title should come from the highest-severity or first finding, with domains noted
    expect(result[0]!.title).toContain('bug');
    expect(result[0]!.title).toContain('security');
  });

  it('respects custom lineGap option', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [10, 15] }),
      makeFinding({ id: 'b', file: 'src/auth.ts', lineRange: [16, 20] }), // gap of 1, within default 3
    ];

    // With lineGap = 0, these should NOT merge
    const result = deduplicateFindings({ findings, lineGap: 0 });
    expect(result).toHaveLength(2);
  });

  it('handles merging 3+ overlapping findings into one', () => {
    const findings = [
      makeFinding({
        id: 'a',
        file: 'src/auth.ts',
        lineRange: [10, 15],
        domain: 'bug',
        evidence: ['ev1'],
      }),
      makeFinding({
        id: 'b',
        file: 'src/auth.ts',
        lineRange: [14, 20],
        domain: 'security',
        evidence: ['ev2'],
      }),
      makeFinding({
        id: 'c',
        file: 'src/auth.ts',
        lineRange: [19, 25],
        domain: 'compliance',
        evidence: ['ev3'],
      }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result).toHaveLength(1);
    expect(result[0]!.evidence).toContain('ev1');
    expect(result[0]!.evidence).toContain('ev2');
    expect(result[0]!.evidence).toContain('ev3');
  });

  it('expands the merged line range to cover all merged findings', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [10, 15] }),
      makeFinding({ id: 'b', file: 'src/auth.ts', lineRange: [14, 25] }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result[0]!.lineRange).toEqual([10, 25]);
  });

  it('preserves security fields when merging overlapping security findings', () => {
    const findings: ReviewFinding[] = [
      {
        id: 'security-src-api-10-sqli',
        file: 'src/api.ts',
        lineRange: [10, 10],
        domain: 'security',
        severity: 'critical',
        title: 'SQL injection',
        rationale: 'String concat in query',
        evidence: ['Line 10: query + userId'],
        validatedBy: 'heuristic',
        cweId: 'CWE-89',
        owaspCategory: 'A03:2021 Injection',
        confidence: 'high',
        remediation: 'Use parameterized queries',
        references: ['https://cwe.mitre.org/data/definitions/89.html'],
      },
      {
        id: 'bug-src-api-11-nullcheck',
        file: 'src/api.ts',
        lineRange: [11, 11],
        domain: 'bug',
        severity: 'important',
        title: 'Missing null check',
        rationale: 'userId could be undefined',
        evidence: ['Line 11: userId.trim()'],
        validatedBy: 'heuristic',
      },
    ];

    const result = deduplicateFindings({ findings });
    expect(result.length).toBe(1);
    const merged = result[0]!;
    expect(merged.cweId).toBe('CWE-89');
    expect(merged.owaspCategory).toBe('A03:2021 Injection');
    expect(merged.confidence).toBe('high');
    expect(merged.remediation).toBe('Use parameterized queries');
    expect(merged.references).toEqual(['https://cwe.mitre.org/data/definitions/89.html']);
  });

  it('merges security fields from both findings when both have them', () => {
    const findings: ReviewFinding[] = [
      {
        id: 'security-src-api-10-sqli',
        file: 'src/api.ts',
        lineRange: [10, 10],
        domain: 'security',
        severity: 'critical',
        title: 'SQL injection',
        rationale: 'String concat in query',
        evidence: ['Line 10'],
        validatedBy: 'heuristic',
        cweId: 'CWE-89',
        owaspCategory: 'A03:2021 Injection',
        confidence: 'high',
        remediation: 'Use parameterized queries',
        references: ['https://cwe.mitre.org/data/definitions/89.html'],
      },
      {
        id: 'security-src-api-11-xss',
        file: 'src/api.ts',
        lineRange: [11, 11],
        domain: 'security',
        severity: 'critical',
        title: 'XSS vulnerability',
        rationale: 'Unsanitized output',
        evidence: ['Line 11'],
        validatedBy: 'heuristic',
        cweId: 'CWE-79',
        owaspCategory: 'A03:2021 Injection',
        confidence: 'medium',
        remediation: 'Sanitize HTML output',
        references: ['https://cwe.mitre.org/data/definitions/79.html'],
      },
    ];

    const result = deduplicateFindings({ findings });
    expect(result.length).toBe(1);
    const merged = result[0]!;
    // Should keep security fields from the primary (higher-severity or first-in-order) finding
    expect(merged.cweId).toBeDefined();
    expect(merged.owaspCategory).toBeDefined();
  });

  it('preserves validatedBy with highest priority (graph > heuristic > mechanical)', () => {
    const findings = [
      makeFinding({ id: 'a', file: 'src/auth.ts', lineRange: [40, 45], validatedBy: 'heuristic' }),
      makeFinding({ id: 'b', file: 'src/auth.ts', lineRange: [43, 48], validatedBy: 'graph' }),
    ];

    const result = deduplicateFindings({ findings });
    expect(result[0]!.validatedBy).toBe('graph');
  });
});
