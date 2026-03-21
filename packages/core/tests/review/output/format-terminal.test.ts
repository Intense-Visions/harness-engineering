import { describe, it, expect } from 'vitest';
import {
  formatTerminalOutput,
  formatFindingBlock,
} from '../../../src/review/output/format-terminal';
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
    suggestion: 'Use optional chaining',
    evidence: ['evidence line'],
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

describe('formatFindingBlock()', () => {
  it('formats a finding with file, title, rationale, and suggestion', () => {
    const result = formatFindingBlock(makeFinding());
    expect(result).toContain('src/auth.ts');
    expect(result).toContain('L10-15');
    expect(result).toContain('Test finding');
    expect(result).toContain('Test rationale');
    expect(result).toContain('Use optional chaining');
  });

  it('omits suggestion section when suggestion is undefined', () => {
    const result = formatFindingBlock(makeFinding({ suggestion: undefined }));
    expect(result).not.toContain('Suggestion:');
  });

  it('includes domain tag in the output', () => {
    const result = formatFindingBlock(makeFinding({ domain: 'security' }));
    expect(result).toContain('security');
  });
});

describe('formatTerminalOutput()', () => {
  it('includes Strengths section when strengths are provided', () => {
    const result = formatTerminalOutput({
      findings: [],
      strengths: [makeStrength()],
    });
    expect(result).toContain('Strengths');
    expect(result).toContain('Good error handling');
  });

  it('groups findings by severity under Issues section', () => {
    const findings = [
      makeFinding({ id: 'f1', severity: 'critical', title: 'Critical bug' }),
      makeFinding({ id: 'f2', severity: 'important', title: 'Important issue' }),
      makeFinding({ id: 'f3', severity: 'suggestion', title: 'Minor suggestion' }),
    ];
    const result = formatTerminalOutput({ findings, strengths: [] });
    expect(result).toContain('### Critical');
    expect(result).toContain('### Important');
    expect(result).toContain('### Suggestion');
    // Critical should appear before Important
    const critIdx = result.indexOf('### Critical');
    const impIdx = result.indexOf('### Important');
    const sugIdx = result.indexOf('### Suggestion');
    expect(critIdx).toBeLessThan(impIdx);
    expect(impIdx).toBeLessThan(sugIdx);
  });

  it('includes Assessment section with approve when no findings', () => {
    const result = formatTerminalOutput({ findings: [], strengths: [] });
    expect(result).toContain('Assessment');
    expect(result).toMatch(/approve/i);
  });

  it('includes Assessment section with request-changes for critical findings', () => {
    const result = formatTerminalOutput({
      findings: [makeFinding({ severity: 'critical' })],
      strengths: [],
    });
    expect(result).toMatch(/request.changes/i);
  });

  it('omits severity group when no findings at that severity level', () => {
    const result = formatTerminalOutput({
      findings: [makeFinding({ severity: 'suggestion' })],
      strengths: [],
    });
    expect(result).not.toContain('Critical');
    expect(result).not.toContain('Important');
    expect(result).toContain('Suggestion');
  });

  it('includes file-level location in strength when file is provided', () => {
    const result = formatTerminalOutput({
      findings: [],
      strengths: [makeStrength({ file: 'src/utils.ts' })],
    });
    expect(result).toContain('src/utils.ts');
  });

  it('handles project-wide strengths (file is null)', () => {
    const result = formatTerminalOutput({
      findings: [],
      strengths: [makeStrength({ file: null, description: 'Clean architecture' })],
    });
    expect(result).toContain('Clean architecture');
  });
});
