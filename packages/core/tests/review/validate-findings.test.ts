import { describe, it, expect, vi } from 'vitest';
import { validateFindings } from '../../src/review/validate-findings';
import { buildExclusionSet } from '../../src/review/exclusion-set';
import type { ReviewFinding, MechanicalFinding, GraphAdapter } from '../../src/review/types';

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

describe('validateFindings()', () => {
  const projectRoot = '/project';

  describe('mechanical exclusion', () => {
    it('discards findings that overlap with mechanical findings', async () => {
      const mechFindings: MechanicalFinding[] = [
        {
          tool: 'security-scan',
          file: 'src/auth.ts',
          line: 42,
          message: 'sec issue',
          severity: 'error',
        },
      ];
      const exclusionSet = buildExclusionSet(mechFindings);
      const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
      });

      expect(result).toHaveLength(0);
    });

    it('keeps findings that do not overlap with mechanical findings', async () => {
      const exclusionSet = buildExclusionSet([]);
      const findings = [makeFinding()];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
      });

      expect(result).toHaveLength(1);
    });

    it('normalizes absolute paths to match relative paths in exclusion set', async () => {
      const mechFindings: MechanicalFinding[] = [
        { tool: 'security-scan', file: 'src/auth.ts', line: 42, message: 'sec', severity: 'error' },
      ];
      const exclusionSet = buildExclusionSet(mechFindings);
      // Finding uses absolute path
      const findings = [makeFinding({ file: '/project/src/auth.ts', lineRange: [40, 45] })];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
      });

      expect(result).toHaveLength(0);
    });

    it('normalizes relative paths to match absolute paths in exclusion set', async () => {
      const mechFindings: MechanicalFinding[] = [
        {
          tool: 'security-scan',
          file: '/project/src/auth.ts',
          line: 42,
          message: 'sec',
          severity: 'error',
        },
      ];
      const exclusionSet = buildExclusionSet(mechFindings);
      // Finding uses relative path
      const findings = [makeFinding({ file: 'src/auth.ts', lineRange: [40, 45] })];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('graph reachability validation', () => {
    it('sets validatedBy to graph when isReachable returns true', async () => {
      const exclusionSet = buildExclusionSet([]);
      const graph: GraphAdapter = {
        getDependencies: vi.fn().mockResolvedValue([]),
        getImpact: vi.fn().mockResolvedValue({ tests: [], docs: [], code: [] }),
        isReachable: vi.fn().mockResolvedValue(true),
      };
      // Finding with cross-file evidence
      const findings = [
        makeFinding({
          evidence: ['Cross-file impact: src/auth.ts affects src/session.ts'],
        }),
      ];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
        graph,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.validatedBy).toBe('graph');
    });

    it('discards findings when graph says cross-file claim is unreachable', async () => {
      const exclusionSet = buildExclusionSet([]);
      const graph: GraphAdapter = {
        getDependencies: vi.fn().mockResolvedValue([]),
        getImpact: vi.fn().mockResolvedValue({ tests: [], docs: [], code: [] }),
        isReachable: vi.fn().mockResolvedValue(false),
      };
      const findings = [
        makeFinding({
          evidence: ['Cross-file impact: src/auth.ts affects src/session.ts'],
        }),
      ];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
        graph,
      });

      expect(result).toHaveLength(0);
    });

    it('keeps single-file findings without graph validation', async () => {
      const exclusionSet = buildExclusionSet([]);
      const graph: GraphAdapter = {
        getDependencies: vi.fn().mockResolvedValue([]),
        getImpact: vi.fn().mockResolvedValue({ tests: [], docs: [], code: [] }),
        isReachable: vi.fn(),
      };
      // No cross-file evidence
      const findings = [makeFinding({ evidence: ['Line 42: division by zero'] })];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
        graph,
      });

      expect(result).toHaveLength(1);
      expect(graph.isReachable).not.toHaveBeenCalled();
    });
  });

  describe('import-chain heuristic fallback (no graph)', () => {
    it('downgrades severity for unvalidated cross-file claims', async () => {
      const exclusionSet = buildExclusionSet([]);
      const findings = [
        makeFinding({
          severity: 'critical',
          evidence: ['Cross-file impact: src/auth.ts affects src/session.ts'],
        }),
      ];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.severity).toBe('important'); // downgraded from critical
      expect(result[0]!.validatedBy).toBe('heuristic');
    });

    it('validates cross-file claims via import chain when file contents provided', async () => {
      const exclusionSet = buildExclusionSet([]);
      const fileContents = new Map([
        ['src/auth.ts', "import { session } from './session';\nexport function login() {}"],
        ['src/session.ts', 'export function session() {}'],
      ]);
      const findings = [
        makeFinding({
          severity: 'critical',
          evidence: ['Cross-file impact: src/auth.ts affects src/session.ts'],
        }),
      ];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
        fileContents,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.severity).toBe('critical'); // NOT downgraded — import chain validates
      expect(result[0]!.validatedBy).toBe('heuristic');
    });

    it('does not downgrade single-file findings', async () => {
      const exclusionSet = buildExclusionSet([]);
      const findings = [
        makeFinding({
          severity: 'critical',
          evidence: ['Line 42: potential null dereference'],
        }),
      ];

      const result = await validateFindings({
        findings,
        exclusionSet,
        projectRoot,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.severity).toBe('critical'); // unchanged
    });
  });
});
