import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import { ExecutionOutcomeConnector } from '../../src/outcome/connector.js';
import type { ExecutionOutcome } from '../../src/outcome/types.js';
import {
  computeSpecialization,
  computeExpertiseLevel,
  buildSpecializationProfile,
  weightedRecommendPersona,
} from '../../src/specialization/scorer.js';

let nextId = 0;

function makeOutcome(overrides: Partial<ExecutionOutcome> = {}): ExecutionOutcome {
  nextId += 1;
  return {
    id: `outcome:issue-${nextId}:1`,
    issueId: `issue-${nextId}`,
    identifier: `TEST-${nextId}`,
    result: 'success',
    retryCount: 0,
    failureReasons: [],
    durationMs: 1000,
    linkedSpecId: null,
    affectedSystemNodeIds: [],
    timestamp: '2026-04-17T00:00:00Z',
    ...overrides,
  };
}

function seed(
  store: GraphStore,
  systemNodeId: string,
  outcomes: Array<Partial<ExecutionOutcome>>
): void {
  if (!store.getNode(systemNodeId)) {
    store.addNode({ id: systemNodeId, type: 'module', name: systemNodeId, metadata: {} });
  }
  const connector = new ExecutionOutcomeConnector(store);
  for (const partial of outcomes) {
    connector.ingest(
      makeOutcome({
        ...partial,
        affectedSystemNodeIds: [systemNodeId, ...(partial.affectedSystemNodeIds ?? [])],
      })
    );
  }
}

const NOW = '2026-04-17T00:00:00Z';

describe('computeExpertiseLevel', () => {
  it('returns novice for <5 samples regardless of success rate', () => {
    expect(computeExpertiseLevel(1, 1.0)).toBe('novice');
    expect(computeExpertiseLevel(4, 1.0)).toBe('novice');
  });

  it('returns competent for 5-14 samples with >=0.6 success rate', () => {
    expect(computeExpertiseLevel(5, 0.6)).toBe('competent');
    expect(computeExpertiseLevel(14, 0.8)).toBe('competent');
  });

  it('returns novice for 5-14 samples with <0.6 success rate', () => {
    expect(computeExpertiseLevel(5, 0.5)).toBe('novice');
  });

  it('returns proficient for 15-29 samples with >=0.7 success rate', () => {
    expect(computeExpertiseLevel(15, 0.7)).toBe('proficient');
    expect(computeExpertiseLevel(29, 0.9)).toBe('proficient');
  });

  it('returns competent for 15-29 samples with <0.7 success rate', () => {
    expect(computeExpertiseLevel(15, 0.6)).toBe('competent');
  });

  it('returns expert for 30+ samples with >=0.75 success rate', () => {
    expect(computeExpertiseLevel(30, 0.75)).toBe('expert');
    expect(computeExpertiseLevel(100, 1.0)).toBe('expert');
  });

  it('returns proficient for 30+ samples with <0.75 success rate', () => {
    expect(computeExpertiseLevel(30, 0.7)).toBe('proficient');
  });
});

describe('computeSpecialization', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore();
    nextId = 0;
  });

  it('returns empty array when no outcomes exist', () => {
    expect(computeSpecialization(store)).toEqual([]);
  });

  it('groups by (persona, systemNodeId, taskType) correctly', () => {
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', taskType: 'bugfix', result: 'success' },
      { agentPersona: 'task-executor', taskType: 'bugfix', result: 'success' },
      {
        agentPersona: 'task-executor',
        taskType: 'feature',
        result: 'failure',
        failureReasons: ['err'],
      },
    ]);

    const entries = computeSpecialization(store, {
      temporal: { halfLifeDays: 30, referenceTime: NOW },
    });

    const bugfix = entries.find((e) => e.persona === 'task-executor' && e.taskType === 'bugfix');
    const feature = entries.find((e) => e.persona === 'task-executor' && e.taskType === 'feature');

    expect(bugfix).toBeDefined();
    expect(bugfix!.sampleSize).toBe(2);
    expect(feature).toBeDefined();
    expect(feature!.sampleSize).toBe(1);
  });

  it('computes composite as weighted combination of sub-scores', () => {
    seed(store, 'module:api', [
      ...Array.from({ length: 10 }, () => ({
        agentPersona: 'task-executor',
        taskType: 'bugfix' as const,
        result: 'success' as const,
      })),
    ]);

    const entries = computeSpecialization(store, {
      temporal: { halfLifeDays: 30, referenceTime: NOW },
    });

    const entry = entries.find((e) => e.persona === 'task-executor')!;
    const { temporalSuccessRate: tsr, consistencyScore: cs, volumeBonus: vb } = entry.score;
    const expected = 0.6 * tsr + 0.25 * cs + 0.15 * vb;
    expect(entry.score.composite).toBeCloseTo(expected, 5);
  });

  it('filters by persona', () => {
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', taskType: 'bugfix', result: 'success' },
      { agentPersona: 'code-reviewer', taskType: 'bugfix', result: 'success' },
    ]);

    const entries = computeSpecialization(store, { persona: 'task-executor' });
    expect(entries.every((e) => e.persona === 'task-executor')).toBe(true);
  });

  it('filters by systemNodeId', () => {
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', taskType: 'bugfix', result: 'success' },
    ]);
    seed(store, 'module:payments', [
      { agentPersona: 'task-executor', taskType: 'bugfix', result: 'success' },
    ]);

    const entries = computeSpecialization(store, { systemNodeId: 'module:api' });
    expect(entries.every((e) => e.systemNodeId === 'module:api')).toBe(true);
  });

  it('filters by taskType', () => {
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', taskType: 'bugfix', result: 'success' },
      { agentPersona: 'task-executor', taskType: 'feature', result: 'success' },
    ]);

    const entries = computeSpecialization(store, { taskType: 'bugfix' });
    expect(entries.every((e) => e.taskType === 'bugfix')).toBe(true);
  });

  it('respects minSamples threshold', () => {
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', taskType: 'bugfix', result: 'success' },
    ]);
    seed(store, 'module:payments', [
      ...Array.from({ length: 5 }, () => ({
        agentPersona: 'task-executor',
        taskType: 'bugfix' as const,
        result: 'success' as const,
      })),
    ]);

    const entries = computeSpecialization(store, { minSamples: 3 });
    // Only module:payments has >= 3 samples
    expect(entries.every((e) => e.sampleSize >= 3)).toBe(true);
  });

  it('treats outcomes without taskType as having taskType "*"', () => {
    seed(store, 'module:api', [{ agentPersona: 'task-executor', result: 'success' }]);

    const entries = computeSpecialization(store);
    expect(entries[0].taskType).toBe('*');
  });

  it('all score components are in [0, 1]', () => {
    seed(store, 'module:api', [
      ...Array.from({ length: 20 }, (_, i) => ({
        agentPersona: 'task-executor',
        taskType: 'bugfix' as const,
        result: (i % 3 === 0 ? 'failure' : 'success') as 'success' | 'failure',
        failureReasons: i % 3 === 0 ? ['err'] : [],
        timestamp: new Date(Date.parse(NOW) - i * 86400000).toISOString(),
      })),
    ]);

    const entries = computeSpecialization(store, {
      temporal: { halfLifeDays: 30, referenceTime: NOW },
    });

    for (const e of entries) {
      expect(e.score.temporalSuccessRate).toBeGreaterThanOrEqual(0);
      expect(e.score.temporalSuccessRate).toBeLessThanOrEqual(1);
      expect(e.score.consistencyScore).toBeGreaterThanOrEqual(0);
      expect(e.score.consistencyScore).toBeLessThanOrEqual(1);
      expect(e.score.volumeBonus).toBeGreaterThanOrEqual(0);
      expect(e.score.volumeBonus).toBeLessThanOrEqual(1);
      expect(e.score.composite).toBeGreaterThanOrEqual(0);
      expect(e.score.composite).toBeLessThanOrEqual(1);
    }
  });
});

describe('buildSpecializationProfile', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore();
    nextId = 0;
  });

  it('returns a profile with entries, strengths, and weaknesses', () => {
    // Strong on api (all successes)
    seed(store, 'module:api', [
      ...Array.from({ length: 10 }, () => ({
        agentPersona: 'task-executor',
        taskType: 'bugfix' as const,
        result: 'success' as const,
      })),
    ]);
    // Weak on payments (mostly failures)
    seed(store, 'module:payments', [
      ...Array.from({ length: 8 }, () => ({
        agentPersona: 'task-executor',
        taskType: 'bugfix' as const,
        result: 'failure' as const,
        failureReasons: ['err'],
      })),
      ...Array.from({ length: 2 }, () => ({
        agentPersona: 'task-executor',
        taskType: 'bugfix' as const,
        result: 'success' as const,
      })),
    ]);

    const profile = buildSpecializationProfile(store, 'task-executor', {
      temporal: { halfLifeDays: 30, referenceTime: NOW },
    });

    expect(profile.persona).toBe('task-executor');
    expect(profile.entries.length).toBeGreaterThan(0);
    expect(profile.strengths.length).toBeGreaterThan(0);
    expect(profile.weaknesses.length).toBeGreaterThan(0);
    expect(profile.computedAt).toBeTruthy();

    // Strengths should include api
    expect(profile.strengths.some((e) => e.systemNodeId === 'module:api')).toBe(true);
    // Weaknesses should include payments
    expect(profile.weaknesses.some((e) => e.systemNodeId === 'module:payments')).toBe(true);
  });

  it('returns empty profile when persona has no outcomes', () => {
    const profile = buildSpecializationProfile(store, 'unknown-persona');
    expect(profile.entries).toEqual([]);
    expect(profile.strengths).toEqual([]);
    expect(profile.weaknesses).toEqual([]);
    expect(profile.overallLevel).toBe('novice');
  });
});

describe('weightedRecommendPersona', () => {
  let store: GraphStore;

  beforeEach(() => {
    store = new GraphStore();
    nextId = 0;
  });

  it('returns empty array when no system nodes requested', () => {
    const recs = weightedRecommendPersona(store, { systemNodeIds: [] });
    expect(recs).toEqual([]);
  });

  it('specialized personas score higher than unspecialized ones', () => {
    // task-executor is specialized on api (all successes)
    seed(store, 'module:api', [
      ...Array.from({ length: 20 }, () => ({
        agentPersona: 'task-executor',
        taskType: 'bugfix' as const,
        result: 'success' as const,
      })),
    ]);
    // code-reviewer has mixed results on api
    seed(store, 'module:api', [
      ...Array.from({ length: 10 }, () => ({
        agentPersona: 'code-reviewer',
        taskType: 'bugfix' as const,
        result: 'success' as const,
      })),
      ...Array.from({ length: 10 }, () => ({
        agentPersona: 'code-reviewer',
        taskType: 'bugfix' as const,
        result: 'failure' as const,
        failureReasons: ['err'],
      })),
    ]);

    const recs = weightedRecommendPersona(store, {
      systemNodeIds: ['module:api'],
      taskType: 'bugfix',
      temporal: { halfLifeDays: 30, referenceTime: NOW },
    });

    expect(recs.length).toBe(2);
    // task-executor should rank higher
    expect(recs[0].persona).toBe('task-executor');
    expect(recs[0].weightedScore).toBeGreaterThan(recs[1].weightedScore);
  });

  it('multiplier is in [0.5, 1.5] range', () => {
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', taskType: 'bugfix', result: 'success' },
      {
        agentPersona: 'task-executor',
        taskType: 'bugfix',
        result: 'failure',
        failureReasons: ['err'],
      },
    ]);

    const recs = weightedRecommendPersona(store, {
      systemNodeIds: ['module:api'],
      temporal: { halfLifeDays: 30, referenceTime: NOW },
    });

    for (const r of recs) {
      expect(r.specializationMultiplier).toBeGreaterThanOrEqual(0.5);
      expect(r.specializationMultiplier).toBeLessThanOrEqual(1.5);
    }
  });

  it('personas with no specialization data get neutral multiplier 1.0', () => {
    // Only task-executor has outcomes
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', taskType: 'bugfix', result: 'success' },
    ]);

    const recs = weightedRecommendPersona(store, {
      systemNodeIds: ['module:api'],
      candidatePersonas: ['task-executor', 'unknown-persona'],
      temporal: { halfLifeDays: 30, referenceTime: NOW },
    });

    const unknown = recs.find((r) => r.persona === 'unknown-persona');
    expect(unknown).toBeDefined();
    expect(unknown!.specializationMultiplier).toBe(1.0);
  });

  it('results are sorted by weightedScore descending', () => {
    seed(store, 'module:api', [
      ...Array.from({ length: 10 }, () => ({
        agentPersona: 'a-persona',
        taskType: 'bugfix' as const,
        result: 'success' as const,
      })),
      ...Array.from({ length: 10 }, () => ({
        agentPersona: 'b-persona',
        taskType: 'bugfix' as const,
        result: 'failure' as const,
        failureReasons: ['err'],
      })),
    ]);

    const recs = weightedRecommendPersona(store, {
      systemNodeIds: ['module:api'],
      temporal: { halfLifeDays: 30, referenceTime: NOW },
    });

    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].weightedScore).toBeGreaterThanOrEqual(recs[i].weightedScore);
    }
  });
});
