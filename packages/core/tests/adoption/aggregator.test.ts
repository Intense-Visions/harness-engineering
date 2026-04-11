import { describe, it, expect } from 'vitest';
import type { SkillInvocationRecord } from '@harness-engineering/types';
import { aggregateBySkill, aggregateByDay, topSkills } from '../../src/adoption/aggregator';

function makeRecord(overrides: Partial<SkillInvocationRecord> = {}): SkillInvocationRecord {
  return {
    skill: 'harness-brainstorming',
    session: 'sess-1',
    startedAt: '2026-04-09T10:00:00.000Z',
    duration: 120000,
    outcome: 'completed',
    phasesReached: ['explore', 'evaluate'],
    tier: 1,
    trigger: 'manual',
    ...overrides,
  };
}

describe('aggregateBySkill', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateBySkill([])).toEqual([]);
  });

  it('groups records by skill and computes summary fields', () => {
    const records: SkillInvocationRecord[] = [
      makeRecord({
        skill: 'skill-a',
        duration: 100000,
        outcome: 'completed',
        startedAt: '2026-04-08T10:00:00.000Z',
      }),
      makeRecord({
        skill: 'skill-a',
        duration: 200000,
        outcome: 'failed',
        startedAt: '2026-04-09T10:00:00.000Z',
      }),
      makeRecord({
        skill: 'skill-b',
        duration: 50000,
        outcome: 'completed',
        startedAt: '2026-04-09T11:00:00.000Z',
      }),
    ];

    const result = aggregateBySkill(records);
    expect(result).toHaveLength(2);

    // skill-a has 2 invocations, sorted first
    const skillA = result[0]!;
    expect(skillA.skill).toBe('skill-a');
    expect(skillA.invocations).toBe(2);
    expect(skillA.successRate).toBe(0.5); // 1 completed out of 2
    expect(skillA.avgDuration).toBe(150000); // (100000 + 200000) / 2
    expect(skillA.lastUsed).toBe('2026-04-09T10:00:00.000Z');
    expect(skillA.tier).toBe(1);

    // skill-b has 1 invocation
    const skillB = result[1]!;
    expect(skillB.skill).toBe('skill-b');
    expect(skillB.invocations).toBe(1);
    expect(skillB.successRate).toBe(1);
    expect(skillB.avgDuration).toBe(50000);
  });

  it('sorts by invocation count descending', () => {
    const records: SkillInvocationRecord[] = [
      makeRecord({ skill: 'rare' }),
      makeRecord({ skill: 'popular' }),
      makeRecord({ skill: 'popular' }),
      makeRecord({ skill: 'popular' }),
    ];

    const result = aggregateBySkill(records);
    expect(result[0]!.skill).toBe('popular');
    expect(result[0]!.invocations).toBe(3);
    expect(result[1]!.skill).toBe('rare');
    expect(result[1]!.invocations).toBe(1);
  });

  it('counts only completed outcomes for successRate', () => {
    const records: SkillInvocationRecord[] = [
      makeRecord({ outcome: 'completed' }),
      makeRecord({ outcome: 'failed' }),
      makeRecord({ outcome: 'abandoned' }),
    ];

    const result = aggregateBySkill(records);
    expect(result[0]!.successRate).toBeCloseTo(1 / 3);
  });
});

describe('aggregateByDay', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateByDay([])).toEqual([]);
  });

  it('groups records by calendar date and counts unique skills', () => {
    const records: SkillInvocationRecord[] = [
      makeRecord({ skill: 'skill-a', startedAt: '2026-04-08T10:00:00.000Z' }),
      makeRecord({ skill: 'skill-a', startedAt: '2026-04-08T14:00:00.000Z' }),
      makeRecord({ skill: 'skill-b', startedAt: '2026-04-08T16:00:00.000Z' }),
      makeRecord({ skill: 'skill-a', startedAt: '2026-04-09T09:00:00.000Z' }),
    ];

    const result = aggregateByDay(records);
    expect(result).toHaveLength(2);

    // Most recent day first
    expect(result[0]!.date).toBe('2026-04-09');
    expect(result[0]!.invocations).toBe(1);
    expect(result[0]!.uniqueSkills).toBe(1);

    expect(result[1]!.date).toBe('2026-04-08');
    expect(result[1]!.invocations).toBe(3);
    expect(result[1]!.uniqueSkills).toBe(2);
  });

  it('sorts by date descending', () => {
    const records: SkillInvocationRecord[] = [
      makeRecord({ startedAt: '2026-04-07T10:00:00.000Z' }),
      makeRecord({ startedAt: '2026-04-09T10:00:00.000Z' }),
      makeRecord({ startedAt: '2026-04-08T10:00:00.000Z' }),
    ];

    const result = aggregateByDay(records);
    expect(result.map((d) => d.date)).toEqual(['2026-04-09', '2026-04-08', '2026-04-07']);
  });
});

describe('topSkills', () => {
  it('returns empty array for empty input', () => {
    expect(topSkills([], 5)).toEqual([]);
  });

  it('returns top N skills by invocation count', () => {
    const records: SkillInvocationRecord[] = [
      makeRecord({ skill: 'a' }),
      makeRecord({ skill: 'b' }),
      makeRecord({ skill: 'b' }),
      makeRecord({ skill: 'c' }),
      makeRecord({ skill: 'c' }),
      makeRecord({ skill: 'c' }),
    ];

    const result = topSkills(records, 2);
    expect(result).toHaveLength(2);
    expect(result[0]!.skill).toBe('c');
    expect(result[1]!.skill).toBe('b');
  });

  it('returns all skills when n exceeds skill count', () => {
    const records: SkillInvocationRecord[] = [makeRecord({ skill: 'only-one' })];

    const result = topSkills(records, 10);
    expect(result).toHaveLength(1);
    expect(result[0]!.skill).toBe('only-one');
  });
});
