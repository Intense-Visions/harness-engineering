import { describe, it, expect } from 'vitest';
import { checkEvidenceCoverage } from '../../src/review/evidence-gate';
import type { ReviewFinding } from '../../src/review/types';
import type { SessionEntry } from '@harness-engineering/types';

function makeFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: 'bug-src-auth-ts-42-test',
    file: 'src/auth.ts',
    lineRange: [40, 45] as [number, number],
    domain: 'bug',
    severity: 'important',
    title: 'Missing null check',
    rationale: 'Test rationale',
    evidence: ['evidence line'],
    validatedBy: 'heuristic',
    ...overrides,
  };
}

function makeEvidence(content: string, overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    id: 'test-entry-1',
    timestamp: '2026-03-27T14:30:00Z',
    authorSkill: 'harness-code-review',
    content,
    status: 'active',
    ...overrides,
  };
}

describe('checkEvidenceCoverage()', () => {
  it('returns empty report when no findings and no evidence', () => {
    const report = checkEvidenceCoverage([], []);
    expect(report.totalEntries).toBe(0);
    expect(report.findingsWithEvidence).toBe(0);
    expect(report.uncitedCount).toBe(0);
    expect(report.uncitedFindings).toEqual([]);
    expect(report.coveragePercentage).toBe(100);
  });

  it('returns 100% coverage when all findings have matching evidence', () => {
    const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];
    const evidence = [makeEvidence('src/auth.ts:42 -- null check missing')];
    const report = checkEvidenceCoverage(findings, evidence);
    expect(report.totalEntries).toBe(1);
    expect(report.findingsWithEvidence).toBe(1);
    expect(report.uncitedCount).toBe(0);
    expect(report.coveragePercentage).toBe(100);
  });

  it('flags findings without matching evidence as uncited', () => {
    const findings = [
      makeFinding({ file: 'src/auth.ts', lineRange: [40, 45], title: 'Missing null check' }),
    ];
    const evidence = [makeEvidence('src/other.ts:10 -- unrelated evidence')];
    const report = checkEvidenceCoverage(findings, evidence);
    expect(report.findingsWithEvidence).toBe(0);
    expect(report.uncitedCount).toBe(1);
    expect(report.uncitedFindings).toEqual(['Missing null check']);
    expect(report.coveragePercentage).toBe(0);
  });

  it('matches evidence by file path substring within line range', () => {
    const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];
    const evidence = [makeEvidence('src/auth.ts:43 -- something about auth')];
    const report = checkEvidenceCoverage(findings, evidence);
    expect(report.findingsWithEvidence).toBe(1);
    expect(report.uncitedCount).toBe(0);
  });

  it('does not match evidence outside the line range', () => {
    const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];
    const evidence = [makeEvidence('src/auth.ts:100 -- distant evidence')];
    const report = checkEvidenceCoverage(findings, evidence);
    expect(report.findingsWithEvidence).toBe(0);
    expect(report.uncitedCount).toBe(1);
  });

  it('handles multiple findings with mixed coverage', () => {
    const findings = [
      makeFinding({ file: 'src/auth.ts', lineRange: [40, 45], title: 'Finding A' }),
      makeFinding({ id: 'sec-1', file: 'src/db.ts', lineRange: [10, 15], title: 'Finding B' }),
    ];
    const evidence = [makeEvidence('src/auth.ts:42 -- auth issue')];
    const report = checkEvidenceCoverage(findings, evidence);
    expect(report.findingsWithEvidence).toBe(1);
    expect(report.uncitedCount).toBe(1);
    expect(report.uncitedFindings).toEqual(['Finding B']);
    expect(report.coveragePercentage).toBe(50);
  });

  it('matches evidence with file path only (no line) against any finding for that file', () => {
    const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];
    const evidence = [makeEvidence('src/auth.ts -- broad file-level evidence')];
    const report = checkEvidenceCoverage(findings, evidence);
    expect(report.findingsWithEvidence).toBe(1);
  });

  it('ignores resolved/superseded evidence entries', () => {
    const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];
    const evidence = [
      makeEvidence('src/auth.ts:42 -- old evidence', { status: 'resolved' }),
      makeEvidence('src/auth.ts:42 -- superseded evidence', { status: 'superseded' }),
    ];
    const report = checkEvidenceCoverage(findings, evidence);
    expect(report.findingsWithEvidence).toBe(0);
    expect(report.uncitedCount).toBe(1);
  });

  it('matches evidence with line range format (e.g., file:10-15)', () => {
    const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];
    const evidence = [makeEvidence('src/auth.ts:40-45 -- range match')];
    const report = checkEvidenceCoverage(findings, evidence);
    expect(report.findingsWithEvidence).toBe(1);
  });
});
