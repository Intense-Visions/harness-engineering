import { describe, it, expect } from 'vitest';
import { ExclusionSet, buildExclusionSet } from '../../src/review/exclusion-set';
import type { MechanicalFinding } from '../../src/review/types';

describe('ExclusionSet', () => {
  const findings: MechanicalFinding[] = [
    {
      tool: 'security-scan',
      file: 'src/api/auth.ts',
      line: 42,
      ruleId: 'SEC-001',
      message: 'Hardcoded secret detected',
      severity: 'error',
    },
    {
      tool: 'check-deps',
      file: 'src/routes/users.ts',
      line: 10,
      message: 'Layer violation: routes -> db',
      severity: 'error',
    },
    {
      tool: 'check-docs',
      file: 'src/services/notify.ts',
      message: 'Undocumented export',
      severity: 'warning',
    },
  ];

  describe('buildExclusionSet()', () => {
    it('returns an ExclusionSet instance', () => {
      const set = buildExclusionSet(findings);
      expect(set).toBeInstanceOf(ExclusionSet);
    });

    it('returns an empty ExclusionSet for empty findings', () => {
      const set = buildExclusionSet([]);
      expect(set.isExcluded('any-file.ts', [1, 100])).toBe(false);
    });
  });

  describe('isExcluded()', () => {
    it('returns true when file and line range contains a finding line', () => {
      const set = buildExclusionSet(findings);
      expect(set.isExcluded('src/api/auth.ts', [40, 45])).toBe(true);
    });

    it('returns true when line range exactly matches finding line', () => {
      const set = buildExclusionSet(findings);
      expect(set.isExcluded('src/api/auth.ts', [42, 42])).toBe(true);
    });

    it('returns false when file matches but line range does not contain finding', () => {
      const set = buildExclusionSet(findings);
      expect(set.isExcluded('src/api/auth.ts', [1, 10])).toBe(false);
    });

    it('returns false when file does not match any finding', () => {
      const set = buildExclusionSet(findings);
      expect(set.isExcluded('src/unknown.ts', [1, 100])).toBe(false);
    });

    it('returns true for file-level finding (no line) regardless of line range', () => {
      const set = buildExclusionSet(findings);
      // check-docs finding for notify.ts has no line — matches any range
      expect(set.isExcluded('src/services/notify.ts', [1, 1])).toBe(true);
      expect(set.isExcluded('src/services/notify.ts', [500, 600])).toBe(true);
    });

    it('handles multiple findings in the same file', () => {
      const multiFindings: MechanicalFinding[] = [
        { tool: 'security-scan', file: 'src/a.ts', line: 10, message: 'x', severity: 'error' },
        { tool: 'security-scan', file: 'src/a.ts', line: 50, message: 'y', severity: 'warning' },
      ];
      const set = buildExclusionSet(multiFindings);
      expect(set.isExcluded('src/a.ts', [8, 12])).toBe(true);
      expect(set.isExcluded('src/a.ts', [48, 52])).toBe(true);
      expect(set.isExcluded('src/a.ts', [20, 30])).toBe(false);
    });
  });

  describe('size', () => {
    it('returns the number of findings in the set', () => {
      const set = buildExclusionSet(findings);
      expect(set.size).toBe(3);
    });
  });

  describe('getFindings()', () => {
    it('returns all findings', () => {
      const set = buildExclusionSet(findings);
      expect(set.getFindings()).toEqual(findings);
    });

    it('returns a copy, not a reference', () => {
      const set = buildExclusionSet(findings);
      const returned = set.getFindings();
      returned.push({
        tool: 'validate',
        file: 'x',
        message: 'y',
        severity: 'error',
      });
      expect(set.size).toBe(3);
    });
  });
});
