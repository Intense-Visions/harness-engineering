import { describe, it, expect } from 'vitest';
import { buildProvenanceReport } from './report';
import type { RuleProvenanceInput, SolutionEnforcement } from './report';

describe('buildProvenanceReport', () => {
  it('flags an enforced rule with no origin and no solution link as unexplained', () => {
    const rules: RuleProvenanceInput[] = [{ id: 'STRENGTH-001' }];
    const report = buildProvenanceReport(rules, []);
    expect(report.unexplained).toEqual([{ ruleId: 'STRENGTH-001' }]);
    expect(report.explainedRules).toBe(0);
    expect(report.totalRules).toBe(1);
  });

  it('treats a rule with an origin as explained', () => {
    const rules: RuleProvenanceInput[] = [{ id: 'STRENGTH-002', origin: '#855' }];
    const report = buildProvenanceReport(rules, []);
    expect(report.unexplained).toEqual([]);
    expect(report.explainedRules).toBe(1);
    expect(report.deadRuleCandidates).toEqual([]);
  });

  it('treats a rule enforced by some solution as explained even without an origin', () => {
    const rules: RuleProvenanceInput[] = [{ id: 'STRENGTH-003' }];
    const solutions: SolutionEnforcement[] = [
      { slug: 'bug-track/logic-errors/skip-list', enforces: ['STRENGTH-003'] },
    ];
    const report = buildProvenanceReport(rules, solutions);
    expect(report.unexplained).toEqual([]);
    expect(report.explainedRules).toBe(1);
  });

  it('resolves a slug-shaped origin by full slug, trailing segment, or basename', () => {
    const solutions: SolutionEnforcement[] = [
      { slug: 'bug-track/logic-errors/worktree-race', enforces: [] },
    ];
    const rules: RuleProvenanceInput[] = [
      { id: 'STRENGTH-010', origin: 'bug-track/logic-errors/worktree-race' },
      { id: 'STRENGTH-011', origin: 'worktree-race' },
    ];
    const report = buildProvenanceReport(rules, solutions);
    expect(report.deadRuleCandidates).toEqual([]);
  });

  it('flags a slug-shaped origin that resolves to no known solution as a dead-rule candidate', () => {
    const rules: RuleProvenanceInput[] = [{ id: 'STRENGTH-020', origin: 'gone-solution-slug' }];
    const report = buildProvenanceReport(rules, []);
    expect(report.deadRuleCandidates).toHaveLength(1);
    expect(report.deadRuleCandidates[0]).toMatchObject({
      reason: 'origin-unresolved',
      ruleId: 'STRENGTH-020',
    });
    // still counts as explained — an origin exists, it just doesn't resolve
    expect(report.unexplained).toEqual([]);
  });

  it('does not flag issue-ref or URL origins as unresolved', () => {
    const rules: RuleProvenanceInput[] = [
      { id: 'STRENGTH-030', origin: '#1469' },
      { id: 'STRENGTH-031', origin: '1469' },
      { id: 'STRENGTH-032', origin: 'https://github.com/org/repo/issues/1469' },
    ];
    const report = buildProvenanceReport(rules, []);
    expect(report.deadRuleCandidates).toEqual([]);
  });

  it('flags a solution enforcing a missing STRENGTH rule id as a dead-rule candidate', () => {
    const rules: RuleProvenanceInput[] = [{ id: 'STRENGTH-001' }];
    const solutions: SolutionEnforcement[] = [
      { slug: 'bug-track/logic-errors/stale', enforces: ['STRENGTH-999'] },
    ];
    const report = buildProvenanceReport(rules, solutions);
    const missing = report.deadRuleCandidates.filter((d) => d.reason === 'enforced-rule-missing');
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({
      ruleId: 'STRENGTH-999',
      slug: 'bug-track/logic-errors/stale',
    });
  });

  it('does not flag non-STRENGTH enforced ids as missing (outside typed registry scope)', () => {
    const solutions: SolutionEnforcement[] = [
      {
        slug: 'bug-track/logic-errors/arch',
        enforces: ['arch:no-cross-package-import', 'sec:INJ-003'],
      },
    ];
    const report = buildProvenanceReport([], solutions);
    expect(report.deadRuleCandidates).toEqual([]);
  });

  it('reports totals and a fully-linked codebase cleanly', () => {
    const rules: RuleProvenanceInput[] = [
      { id: 'STRENGTH-001', origin: 'bug-track/x/a' },
      { id: 'STRENGTH-002' },
    ];
    const solutions: SolutionEnforcement[] = [
      { slug: 'bug-track/x/a', enforces: ['STRENGTH-002'] },
    ];
    const report = buildProvenanceReport(rules, solutions);
    expect(report.totalRules).toBe(2);
    expect(report.totalSolutions).toBe(1);
    expect(report.explainedRules).toBe(2);
    expect(report.unexplained).toEqual([]);
    expect(report.deadRuleCandidates).toEqual([]);
  });
});
