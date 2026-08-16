import { describe, it, expect } from 'vitest';
import type {
  SkillInvocationRecord,
  UsageRecord,
  InsightsReport,
  EffectivenessSection,
} from '@harness-engineering/types';
import {
  composeSynthesis,
  renderSynthesisMarkdown,
  type SynthesisInputs,
  type OutcomeNodeLike,
} from '../../src/telemetry-synthesis/index.js';

const NOW = new Date('2026-08-16T00:00:00.000Z');

function adoption(overrides: Partial<SkillInvocationRecord> = {}): SkillInvocationRecord {
  return {
    skill: 'harness-autopilot',
    startedAt: '2026-08-15T10:00:00.000Z',
    duration: 1000,
    outcome: 'completed',
    phasesReached: ['plan'],
    ...overrides,
  } as SkillInvocationRecord;
}

function usage(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    sessionId: 's1',
    timestamp: '2026-08-15T10:00:00.000Z',
    tokens: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    costMicroUSD: 250000,
    ...overrides,
  } as UsageRecord;
}

const emptyEffectiveness: EffectivenessSection = {
  leastEffective: [],
  failing: [],
  abandoned: [],
};

/** Builds a full effectiveness section from records (a minimal stand-in for the intelligence scorers). */
function buildEffectiveness(records: SkillInvocationRecord[]): EffectivenessSection | null {
  if (records.length === 0) return null;
  return {
    leastEffective: [
      {
        skill: 'harness-autopilot',
        invocations: records.length,
        completed: records.filter((r) => r.outcome === 'completed').length,
        failed: records.filter((r) => r.outcome === 'failed').length,
        abandonedMidWorkflow: 0,
        successRate: 0.5,
      },
    ],
    failing: [],
    abandoned: [],
  };
}

function insightsReport(): InsightsReport {
  return {
    generatedAt: NOW.toISOString(),
    project: { root: '/tmp/x' },
    health: { passed: true, signals: [], summary: 'No structural health findings.' },
    entropy: { driftCount: 2, deadFiles: 1, deadExports: 3 },
    decay: null,
    attention: null,
    impact: null,
    warnings: [],
  };
}

function inputs(overrides: Partial<SynthesisInputs> = {}): SynthesisInputs {
  return {
    adoptionRecords: [],
    usageRecords: [],
    insights: null,
    buildEffectiveness,
    outcomeNodes: null,
    ...overrides,
  };
}

describe('composeSynthesis — all sources absent', () => {
  it('marks every source present:false and every headline field null, without throwing', () => {
    const s = composeSynthesis(inputs(), { now: NOW });
    expect(s.sources.adoption.present).toBe(false);
    expect(s.sources.effectiveness.present).toBe(false);
    expect(s.sources.usage.present).toBe(false);
    expect(s.sources.insights.present).toBe(false);
    expect(s.sources.outcomes.present).toBe(false);
    expect(s.headline).toEqual({
      totalSkillInvocations: null,
      skillSuccessRate: null,
      outcomeSatisfiedRate: null,
      totalCostUsd: null,
      healthPassed: null,
    });
  });

  it('renders an absent-footer that names all five sources and no headline fabrication', () => {
    const md = renderSynthesisMarkdown(composeSynthesis(inputs(), { now: NOW }));
    expect(md).toContain('## Sources with no data');
    for (const label of [
      'Skill adoption',
      'Skill effectiveness',
      'Usage & cost',
      'Code-health insights',
      'Execution outcomes',
    ]) {
      expect(md).toContain(label);
    }
    expect(md).toContain('**Skill invocations:** n/a');
  });
});

describe('composeSynthesis — all sources present', () => {
  const outcomeNodes: OutcomeNodeLike[] = [
    { verdict: 'SATISFIED', timestamp: '2026-08-15T00:00:00.000Z' },
    { verdict: 'NOT_SATISFIED', timestamp: '2026-08-15T00:00:00.000Z' },
    { verdict: 'INCONCLUSIVE', timestamp: '2026-08-15T00:00:00.000Z' },
    { result: 'success', timestamp: '2026-08-15T00:00:00.000Z' }, // no verdict → mapped to satisfied
  ];

  const s = composeSynthesis(
    inputs({
      adoptionRecords: [adoption(), adoption({ outcome: 'failed', phasesReached: ['plan'] })],
      usageRecords: [usage(), usage({ sessionId: 's2', costMicroUSD: 500000 })],
      insights: insightsReport(),
      outcomeNodes,
    }),
    { now: NOW }
  );

  it('adoption reports counts and success rate', () => {
    expect(s.sources.adoption.present).toBe(true);
    if (s.sources.adoption.present) {
      expect(s.sources.adoption.totalInvocations).toBe(2);
      expect(s.sources.adoption.distinctSkills).toBe(1);
      expect(s.sources.adoption.successRate).toBe(0.5);
    }
    expect(s.headline.totalSkillInvocations).toBe(2);
    expect(s.headline.skillSuccessRate).toBe(0.5);
  });

  it('usage sums cost and tokens; headline cost in whole USD', () => {
    expect(s.sources.usage.present).toBe(true);
    if (s.sources.usage.present) {
      expect(s.sources.usage.totalCostMicroUSD).toBe(750000);
      expect(s.sources.usage.totalTokens).toBe(300);
      expect(s.sources.usage.sessionCount).toBe(2);
    }
    expect(s.headline.totalCostUsd).toBeCloseTo(0.75, 6);
  });

  it('insights projects health + entropy honestly', () => {
    expect(s.sources.insights.present).toBe(true);
    if (s.sources.insights.present) {
      expect(s.sources.insights.healthPassed).toBe(true);
      expect(s.sources.insights.driftCount).toBe(2);
    }
    expect(s.headline.healthPassed).toBe(true);
  });

  it('outcomes counts verdicts (verdict + result fallback) and computes satisfied rate', () => {
    expect(s.sources.outcomes.present).toBe(true);
    if (s.sources.outcomes.present) {
      expect(s.sources.outcomes.satisfied).toBe(2); // 1 verdict + 1 result-fallback
      expect(s.sources.outcomes.notSatisfied).toBe(1);
      expect(s.sources.outcomes.inconclusive).toBe(1);
      expect(s.sources.outcomes.total).toBe(4);
      expect(s.sources.outcomes.satisfiedRate).toBe(0.5);
    }
    expect(s.headline.outcomeSatisfiedRate).toBe(0.5);
  });

  it('renders a present section per source and no absent-footer', () => {
    const md = renderSynthesisMarkdown(s);
    expect(md).toContain('## Skill adoption');
    expect(md).toContain('## Usage & cost');
    expect(md).toContain('## Execution outcomes');
    expect(md).not.toContain('## Sources with no data');
  });
});

describe('composeSynthesis — mixed', () => {
  it('unknown pricing anywhere makes total cost null (never a false zero)', () => {
    const s = composeSynthesis(
      inputs({
        usageRecords: [usage(), usage({ sessionId: 's2', costMicroUSD: undefined as never })],
      }),
      { now: NOW }
    );
    expect(s.sources.usage.present).toBe(true);
    if (s.sources.usage.present) expect(s.sources.usage.totalCostMicroUSD).toBeNull();
    expect(s.headline.totalCostUsd).toBeNull();
  });

  it('empty graph node list is absent, not a zero-rate outcome section', () => {
    const s = composeSynthesis(inputs({ outcomeNodes: [] }), { now: NOW });
    expect(s.sources.outcomes.present).toBe(false);
    expect(s.headline.outcomeSatisfiedRate).toBeNull();
  });
});

describe('composeSynthesis — window', () => {
  it('excludes adoption/usage/outcome records older than the window', () => {
    const recent = adoption({ startedAt: '2026-08-15T00:00:00.000Z' });
    const old = adoption({ skill: 'harness-old', startedAt: '2026-06-01T00:00:00.000Z' });
    const recentUsage = usage({ timestamp: '2026-08-15T00:00:00.000Z' });
    const oldUsage = usage({ sessionId: 'old', timestamp: '2026-06-01T00:00:00.000Z' });
    const nodes: OutcomeNodeLike[] = [
      { verdict: 'SATISFIED', timestamp: '2026-08-15T00:00:00.000Z' },
      { verdict: 'SATISFIED', timestamp: '2026-06-01T00:00:00.000Z' },
    ];

    const windowed = composeSynthesis(
      inputs({
        adoptionRecords: [recent, old],
        usageRecords: [recentUsage, oldUsage],
        outcomeNodes: nodes,
      }),
      { now: NOW, windowDays: 30 }
    );
    expect(windowed.headline.totalSkillInvocations).toBe(1);
    if (windowed.sources.usage.present) expect(windowed.sources.usage.sessionCount).toBe(1);
    if (windowed.sources.outcomes.present) expect(windowed.sources.outcomes.total).toBe(1);

    const allTime = composeSynthesis(
      inputs({
        adoptionRecords: [recent, old],
        usageRecords: [recentUsage, oldUsage],
        outcomeNodes: nodes,
      }),
      { now: NOW, windowDays: null }
    );
    expect(allTime.headline.totalSkillInvocations).toBe(2);
    if (allTime.sources.outcomes.present) expect(allTime.sources.outcomes.total).toBe(2);
  });
});

describe('composeSynthesis — skip', () => {
  it('a skipped section is present:false and drops from the headline', () => {
    const s = composeSynthesis(inputs({ usageRecords: [usage()], adoptionRecords: [adoption()] }), {
      now: NOW,
      skip: ['usage'],
    });
    expect(s.sources.usage.present).toBe(false);
    if (!s.sources.usage.present) expect(s.sources.usage.reason).toBe('skipped');
    expect(s.headline.totalCostUsd).toBeNull();
    // Unaffected sibling still present.
    expect(s.sources.adoption.present).toBe(true);
  });
});

describe('renderSynthesisMarkdown', () => {
  it('always ends with a single trailing newline', () => {
    const md = renderSynthesisMarkdown(
      composeSynthesis(inputs({ adoptionRecords: [adoption()] }), { now: NOW })
    );
    expect(md.endsWith('\n')).toBe(true);
    expect(md.endsWith('\n\n')).toBe(false);
  });

  it('renders an effectiveness section when present', () => {
    const s = composeSynthesis(inputs({ adoptionRecords: [adoption()] }), { now: NOW });
    expect(s.sources.effectiveness.present).toBe(true);
    expect(renderSynthesisMarkdown(s)).toContain('## Skill effectiveness');
  });

  it('empty effectiveness section (builder returns empty rows) still renders as present', () => {
    const s = composeSynthesis(
      inputs({ adoptionRecords: [adoption()], buildEffectiveness: () => emptyEffectiveness }),
      { now: NOW }
    );
    expect(s.sources.effectiveness.present).toBe(true);
  });
});
