import { describe, it, expect } from 'vitest';
import type { AutoDecision } from '@harness-engineering/types';
import { renderAutoDecisionSummary, summarizeAutoDecisions } from '../../src/autonomy/summary';

const base = {
  ts: '2026-11-13T00:00:00.000Z',
  skill: 'harness-planning',
  phase: 'DECOMPOSE',
  question: 'Which approach?',
  options: ['A', 'B'],
  chosen: 'A',
  rationale: 'r',
  autonomySource: 'user-config' as const,
};
const ceremony = (): AutoDecision => ({
  ...base,
  pauseClass: 'ceremony',
  options: ['approve'],
  chosen: 'approve',
});
const judgment = (audit: AutoDecision['audit']): AutoDecision => ({
  ...base,
  pauseClass: 'judgment',
  ...(audit !== undefined && { audit }),
});
const fixture: AutoDecision[] = [
  ceremony(),
  ceremony(),
  judgment({ status: 'agreed', blindPick: 'A' }),
  judgment({ status: 'agreed', blindPick: 'A' }),
  judgment({ status: 'escalated', blindPick: 'B', humanChoice: 'A' }),
  judgment({ status: 'unavailable' }),
  judgment({ status: 'off' }),
];

describe('summarizeAutoDecisions', () => {
  it('M counts every judgment including unavailable/off; N counts agreed + escalated (SC9)', () => {
    expect(summarizeAutoDecisions(fixture)).toEqual({
      total: 7,
      byClass: { ceremony: 2, judgment: 5 },
      judgments: 5,
      audited: 3,
      agreed: 2,
      escalations: 1,
      unavailable: 1,
      off: 1,
      agreementRate: 2 / 3,
    });
  });
  it('agreement rate is null, not 1, when nothing was audited', () => {
    expect(summarizeAutoDecisions([judgment({ status: 'unavailable' })]).agreementRate).toBeNull();
  });
});

describe('renderAutoDecisionSummary (SC11 rendering half)', () => {
  it('returns [] when there is nothing to report, so terminal skills print nothing', () => {
    expect(renderAutoDecisionSummary([])).toEqual([]);
  });
  it('renders counts by class, audited N/M, agreement rate and escalations', () => {
    expect(renderAutoDecisionSummary(fixture, { session: 's1' })).toEqual([
      'Auto-decisions (session s1): 7',
      '  by class: ceremony 2, judgment 5',
      '  audited 3/5 (unavailable 1, off 1)',
      '  agreement rate: 66% (2/3)',
      '  escalations: 1',
      '  Audit statuses are agent-reported.',
    ]);
  });
  it('rounds the agreement rate down: an escalation never displays as 100% (review S5)', () => {
    const many = [
      ...Array.from({ length: 199 }, () => judgment({ status: 'agreed', blindPick: 'A' })),
      judgment({ status: 'escalated', blindPick: 'B', humanChoice: 'A' }),
    ];
    expect(renderAutoDecisionSummary(many)).toContain('  agreement rate: 99% (199/200)');
  });
  it('never presents an unaudited run as agreed', () => {
    expect(
      renderAutoDecisionSummary([judgment({ status: 'off' }), judgment({ status: 'unavailable' })])
    ).toContain('  agreement rate: n/a (nothing audited)');
  });
  it('reports unreadable lines even when no entry parsed', () => {
    const out = renderAutoDecisionSummary([], { invalidLines: 2 });
    expect(out[0]).toBe('Auto-decisions: 0');
    expect(out.at(-1)).toMatch(/^ {2}WARNING: 2 unreadable log line\(s\)/);
  });
  it('lists judgment decisions on one sanitized line each', () => {
    const j = {
      ...judgment({ status: 'agreed', blindPick: 'A' }),
      question: 'Which\napproach?‮',
    };
    expect(renderAutoDecisionSummary([j], { includeJudgments: true }).at(-1)).toBe(
      '  - [agreed] harness-planning/DECOMPOSE: Which approach? -> A'
    );
  });
});
