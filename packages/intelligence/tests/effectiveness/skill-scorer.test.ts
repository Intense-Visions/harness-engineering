import { describe, it, expect } from 'vitest';
import type { SkillInvocationRecord } from '@harness-engineering/types';
import {
  computeSkillEffectiveness,
  detectFailingSkills,
  detectAbandonedSkills,
} from '../../src/effectiveness/skill-scorer.js';

let nextRecord = 0;

function makeRecord(overrides: Partial<SkillInvocationRecord> = {}): SkillInvocationRecord {
  nextRecord += 1;
  return {
    skill: 'harness-example',
    session: `s${nextRecord}`,
    startedAt: '2026-04-16T00:00:00Z',
    duration: 1000,
    outcome: 'completed',
    phasesReached: [],
    ...overrides,
  };
}

describe('computeSkillEffectiveness', () => {
  it('returns an empty array when no records exist', () => {
    expect(computeSkillEffectiveness([])).toEqual([]);
  });

  it('groups by skill and counts completed/failed/abandoned', () => {
    const records = [
      makeRecord({ skill: 'a', outcome: 'completed' }),
      makeRecord({ skill: 'a', outcome: 'completed' }),
      makeRecord({ skill: 'a', outcome: 'failed', phasesReached: ['plan'] }),
      makeRecord({ skill: 'b', outcome: 'failed' }),
    ];

    const scores = computeSkillEffectiveness(records);
    const a = scores.find((s) => s.skill === 'a')!;
    const b = scores.find((s) => s.skill === 'b')!;

    expect(a.invocations).toBe(3);
    expect(a.completed).toBe(2);
    expect(a.failed).toBe(1);
    // failed run reached a phase -> counts as abandoned mid-workflow too
    expect(a.abandonedMidWorkflow).toBe(1);
    // Laplace: (2 + 1) / (3 + 2) = 0.6
    expect(a.successRate).toBeCloseTo(0.6, 5);

    expect(b.completed).toBe(0);
    expect(b.failed).toBe(1);
    // failed with no phases -> not abandoned mid-workflow
    expect(b.abandonedMidWorkflow).toBe(0);
    // (0 + 1) / (1 + 2) = 1/3
    expect(b.successRate).toBeCloseTo(1 / 3, 5);
  });

  it('filters by skill', () => {
    const records = [
      makeRecord({ skill: 'a', outcome: 'completed' }),
      makeRecord({ skill: 'b', outcome: 'failed' }),
    ];
    const scores = computeSkillEffectiveness(records, { skill: 'a' });
    expect(scores).toHaveLength(1);
    expect(scores[0].skill).toBe('a');
  });

  it('skips records without a skill name', () => {
    const records = [
      makeRecord({ skill: '', outcome: 'completed' }),
      makeRecord({ skill: 'a', outcome: 'completed' }),
    ];
    const scores = computeSkillEffectiveness(records);
    expect(scores).toHaveLength(1);
    expect(scores[0].skill).toBe('a');
  });

  it('counts an explicit abandoned outcome even with no phases', () => {
    const records = [makeRecord({ skill: 'a', outcome: 'abandoned', phasesReached: [] })];
    const scores = computeSkillEffectiveness(records);
    expect(scores[0].abandonedMidWorkflow).toBe(1);
    expect(scores[0].failed).toBe(0);
  });

  it('sorts by successRate desc, then invocations desc, then skill asc', () => {
    const records = [
      // c: 1 completed -> (1+1)/(1+2) = 0.667
      makeRecord({ skill: 'c', outcome: 'completed' }),
      // a: 3 completed -> (3+1)/(3+2) = 0.8
      makeRecord({ skill: 'a', outcome: 'completed' }),
      makeRecord({ skill: 'a', outcome: 'completed' }),
      makeRecord({ skill: 'a', outcome: 'completed' }),
      // b: 3 completed -> 0.8 as well; ties on rate, then invocations (both 3), then skill asc
      makeRecord({ skill: 'b', outcome: 'completed' }),
      makeRecord({ skill: 'b', outcome: 'completed' }),
      makeRecord({ skill: 'b', outcome: 'completed' }),
    ];
    const scores = computeSkillEffectiveness(records);
    expect(scores.map((s) => s.skill)).toEqual(['a', 'b', 'c']);
  });
});

describe('detectFailingSkills', () => {
  it('returns nothing when failures are below minFailures even at 100% failure', () => {
    const records = [makeRecord({ skill: 'a', outcome: 'failed' })];
    expect(detectFailingSkills(records)).toEqual([]);
  });

  it('returns nothing when failure rate is below threshold', () => {
    const records: SkillInvocationRecord[] = [];
    for (let i = 0; i < 8; i++) records.push(makeRecord({ skill: 'a', outcome: 'completed' }));
    records.push(makeRecord({ skill: 'a', outcome: 'failed' }));
    records.push(makeRecord({ skill: 'a', outcome: 'failed' }));
    // 2 failures / 10 -> 0.2 rate, below default 0.5
    expect(detectFailingSkills(records)).toEqual([]);
  });

  it('returns failing skills that meet both thresholds', () => {
    const records = [
      makeRecord({ skill: 'a', outcome: 'failed' }),
      makeRecord({ skill: 'a', outcome: 'failed' }),
      makeRecord({ skill: 'a', outcome: 'failed' }),
      makeRecord({ skill: 'a', outcome: 'completed' }),
    ];
    const failing = detectFailingSkills(records);
    expect(failing).toHaveLength(1);
    expect(failing[0]).toMatchObject({ skill: 'a', invocations: 4, completed: 1, failed: 3 });
    expect(failing[0].failureRate).toBeCloseTo(0.75, 5);
    // smoothed success rate: (1 + 1) / (4 + 2) = 1/3
    expect(failing[0].smoothedSuccessRate).toBeCloseTo(1 / 3, 5);
  });

  it('groups failing skills by failureCategory', () => {
    const records = [
      makeRecord({ skill: 'a', outcome: 'failed', failureCategory: 'gate-rejected' }),
      makeRecord({ skill: 'a', outcome: 'failed', failureCategory: 'gate-rejected' }),
      makeRecord({ skill: 'a', outcome: 'failed', failureCategory: 'timeout' }),
    ];
    const failing = detectFailingSkills(records);
    expect(failing).toHaveLength(1);
    expect(failing[0].failureCategories).toEqual({ 'gate-rejected': 2, timeout: 1 });
  });

  it('returns an empty failureCategories map for uncategorized failures', () => {
    const records = [
      makeRecord({ skill: 'a', outcome: 'failed' }),
      makeRecord({ skill: 'a', outcome: 'failed' }),
    ];
    const failing = detectFailingSkills(records);
    expect(failing[0].failureCategories).toEqual({});
  });

  it('honours custom thresholds', () => {
    const records = [
      makeRecord({ skill: 'a', outcome: 'failed' }),
      makeRecord({ skill: 'a', outcome: 'completed' }),
    ];
    expect(detectFailingSkills(records)).toEqual([]);
    const failing = detectFailingSkills(records, { minFailures: 1, minFailureRate: 0.4 });
    expect(failing).toHaveLength(1);
    expect(failing[0].failureRate).toBeCloseTo(0.5, 5);
  });

  it('sorts by failureRate desc then failed desc', () => {
    const records = [
      // a: 2 failures / 2 -> 1.0
      makeRecord({ skill: 'a', outcome: 'failed' }),
      makeRecord({ skill: 'a', outcome: 'failed' }),
      // b: 3 failures / 4 -> 0.75
      makeRecord({ skill: 'b', outcome: 'failed' }),
      makeRecord({ skill: 'b', outcome: 'failed' }),
      makeRecord({ skill: 'b', outcome: 'failed' }),
      makeRecord({ skill: 'b', outcome: 'completed' }),
    ];
    const failing = detectFailingSkills(records);
    expect(failing.map((s) => s.skill)).toEqual(['a', 'b']);
  });
});

describe('detectAbandonedSkills', () => {
  it('returns nothing below minAbandonments', () => {
    const records = [makeRecord({ skill: 'a', outcome: 'abandoned' })];
    expect(detectAbandonedSkills(records)).toEqual([]);
  });

  it('surfaces skills abandoned mid-workflow above both thresholds', () => {
    const records = [
      makeRecord({ skill: 'a', outcome: 'abandoned' }),
      makeRecord({ skill: 'a', outcome: 'abandoned' }),
      // non-completed run that reached a phase -> abandoned mid-workflow
      makeRecord({ skill: 'a', outcome: 'failed', phasesReached: ['explore'] }),
      makeRecord({ skill: 'a', outcome: 'completed' }),
    ];
    const abandoned = detectAbandonedSkills(records);
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0]).toMatchObject({ skill: 'a', invocations: 4, abandonedMidWorkflow: 3 });
    expect(abandoned[0].abandonmentRate).toBeCloseTo(0.75, 5);
  });

  it('does not count a completed run as abandoned even if it reached phases', () => {
    const records = [
      makeRecord({ skill: 'a', outcome: 'completed', phasesReached: ['a', 'b'] }),
      makeRecord({ skill: 'a', outcome: 'completed', phasesReached: ['a', 'b'] }),
    ];
    expect(detectAbandonedSkills(records)).toEqual([]);
  });

  it('honours custom thresholds and sorts by abandonmentRate desc', () => {
    const records = [
      // a: 1 abandoned / 1 -> 1.0
      makeRecord({ skill: 'a', outcome: 'abandoned' }),
      // b: 2 abandoned / 4 -> 0.5
      makeRecord({ skill: 'b', outcome: 'abandoned' }),
      makeRecord({ skill: 'b', outcome: 'abandoned' }),
      makeRecord({ skill: 'b', outcome: 'completed' }),
      makeRecord({ skill: 'b', outcome: 'completed' }),
    ];
    const abandoned = detectAbandonedSkills(records, {
      minAbandonments: 1,
      minAbandonmentRate: 0.5,
    });
    expect(abandoned.map((s) => s.skill)).toEqual(['a', 'b']);
  });
});
