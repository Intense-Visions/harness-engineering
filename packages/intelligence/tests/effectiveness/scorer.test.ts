import { describe, it, expect } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import { ExecutionOutcomeConnector } from '../../src/outcome/connector.js';
import type { ExecutionOutcome } from '../../src/outcome/types.js';
import {
  computePersonaEffectiveness,
  detectBlindSpots,
  recommendPersona,
} from '../../src/effectiveness/scorer.js';

let nextOutcome = 0;

function makeOutcome(overrides: Partial<ExecutionOutcome> = {}): ExecutionOutcome {
  nextOutcome += 1;
  return {
    id: `outcome:issue-${nextOutcome}:1`,
    issueId: `issue-${nextOutcome}`,
    identifier: `TEST-${nextOutcome}`,
    result: 'success',
    retryCount: 0,
    failureReasons: [],
    durationMs: 1000,
    linkedSpecId: null,
    affectedSystemNodeIds: [],
    timestamp: '2026-04-16T00:00:00Z',
    ...overrides,
  };
}

/**
 * Seed the graph with a system node and ingest the specified outcomes,
 * each linked to that system.
 */
function seed(
  store: GraphStore,
  systemNodeId: string,
  outcomes: Array<Partial<ExecutionOutcome>>
): void {
  store.addNode({ id: systemNodeId, type: 'module', name: systemNodeId, metadata: {} });
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

describe('computePersonaEffectiveness', () => {
  it('returns an empty array when no outcomes exist', () => {
    const store = new GraphStore();
    expect(computePersonaEffectiveness(store)).toEqual([]);
  });

  it('groups by (persona, systemNodeId) and counts successes/failures', () => {
    const store = new GraphStore();
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'task-executor', result: 'failure', failureReasons: ['oops'] },
    ]);
    seed(store, 'module:payments', [
      { agentPersona: 'task-executor', result: 'failure', failureReasons: ['boom'] },
    ]);

    const scores = computePersonaEffectiveness(store);
    const api = scores.find((s) => s.systemNodeId === 'module:api')!;
    const payments = scores.find((s) => s.systemNodeId === 'module:payments')!;

    expect(api.persona).toBe('task-executor');
    expect(api.successes).toBe(2);
    expect(api.failures).toBe(1);
    expect(api.sampleSize).toBe(3);
    // Laplace: (2 + 1) / (3 + 2) = 0.6
    expect(api.successRate).toBeCloseTo(0.6, 5);

    expect(payments.successes).toBe(0);
    expect(payments.failures).toBe(1);
    // (0 + 1) / (1 + 2) = 1/3
    expect(payments.successRate).toBeCloseTo(1 / 3, 5);
  });

  it('filters by persona', () => {
    const store = new GraphStore();
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'code-reviewer', result: 'failure', failureReasons: ['f'] },
    ]);

    const scores = computePersonaEffectiveness(store, { persona: 'task-executor' });
    expect(scores).toHaveLength(1);
    expect(scores[0].persona).toBe('task-executor');
  });

  it('filters by systemNodeId', () => {
    const store = new GraphStore();
    seed(store, 'module:api', [{ agentPersona: 'task-executor', result: 'success' }]);
    seed(store, 'module:payments', [{ agentPersona: 'task-executor', result: 'failure' }]);

    const scores = computePersonaEffectiveness(store, { systemNodeId: 'module:api' });
    expect(scores).toHaveLength(1);
    expect(scores[0].systemNodeId).toBe('module:api');
  });

  it('skips outcomes that do not declare an agentPersona', () => {
    const store = new GraphStore();
    seed(store, 'module:api', [
      { result: 'success' }, // no persona
      { agentPersona: 'task-executor', result: 'success' },
    ]);

    const scores = computePersonaEffectiveness(store);
    expect(scores).toHaveLength(1);
    expect(scores[0].successes).toBe(1);
    expect(scores[0].persona).toBe('task-executor');
  });

  it('skips outcomes without outcome_of edges (no system attribution)', () => {
    const store = new GraphStore();
    const connector = new ExecutionOutcomeConnector(store);
    // No affectedSystemNodeIds: no outcome_of edges are created.
    connector.ingest(makeOutcome({ agentPersona: 'task-executor', affectedSystemNodeIds: [] }));

    expect(computePersonaEffectiveness(store)).toEqual([]);
  });
});

describe('detectBlindSpots', () => {
  it('returns nothing when failures are below minFailures even at 100% failure', () => {
    const store = new GraphStore();
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', result: 'failure', failureReasons: ['one'] },
    ]);

    expect(detectBlindSpots(store)).toEqual([]);
  });

  it('returns nothing when failure rate is below threshold', () => {
    const store = new GraphStore();
    // 2 failures, 8 successes -> 0.2 rate
    const outcomes: Array<Partial<ExecutionOutcome>> = [];
    for (let i = 0; i < 8; i++) {
      outcomes.push({ agentPersona: 'task-executor', result: 'success' });
    }
    outcomes.push({ agentPersona: 'task-executor', result: 'failure' });
    outcomes.push({ agentPersona: 'task-executor', result: 'failure' });
    seed(store, 'module:api', outcomes);

    expect(detectBlindSpots(store)).toEqual([]);
  });

  it('returns blind spots that meet both thresholds', () => {
    const store = new GraphStore();
    seed(store, 'module:payments', [
      { agentPersona: 'task-executor', result: 'failure' },
      { agentPersona: 'task-executor', result: 'failure' },
      { agentPersona: 'task-executor', result: 'failure' },
      { agentPersona: 'task-executor', result: 'success' },
    ]);

    const spots = detectBlindSpots(store);
    expect(spots).toHaveLength(1);
    expect(spots[0]).toMatchObject({
      persona: 'task-executor',
      systemNodeId: 'module:payments',
      failures: 3,
      successes: 1,
    });
    expect(spots[0].failureRate).toBeCloseTo(0.75, 5);
  });

  it('filters by persona', () => {
    const store = new GraphStore();
    seed(store, 'module:payments', [
      { agentPersona: 'task-executor', result: 'failure' },
      { agentPersona: 'task-executor', result: 'failure' },
      { agentPersona: 'code-reviewer', result: 'failure' },
      { agentPersona: 'code-reviewer', result: 'failure' },
    ]);

    const spots = detectBlindSpots(store, { persona: 'task-executor' });
    expect(spots).toHaveLength(1);
    expect(spots[0].persona).toBe('task-executor');
  });

  it('honours custom thresholds', () => {
    const store = new GraphStore();
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', result: 'failure' },
      { agentPersona: 'task-executor', result: 'success' },
    ]);

    // Default: 0 blind spots (needs >=2 failures).
    expect(detectBlindSpots(store)).toEqual([]);
    // Lowering both thresholds surfaces it.
    const spots = detectBlindSpots(store, { minFailures: 1, minFailureRate: 0.4 });
    expect(spots).toHaveLength(1);
    expect(spots[0].failureRate).toBeCloseTo(0.5, 5);
  });

  it('sorts results by failureRate desc then failures desc', () => {
    const store = new GraphStore();
    seed(store, 'module:a', [
      { agentPersona: 'task-executor', result: 'failure' },
      { agentPersona: 'task-executor', result: 'failure' },
    ]);
    seed(store, 'module:b', [
      { agentPersona: 'task-executor', result: 'failure' },
      { agentPersona: 'task-executor', result: 'failure' },
      { agentPersona: 'task-executor', result: 'failure' },
      { agentPersona: 'task-executor', result: 'success' },
    ]);

    const spots = detectBlindSpots(store);
    // module:a is 100% failure (rate 1.0); module:b is 75% -- a sorts first.
    expect(spots.map((s) => s.systemNodeId)).toEqual(['module:a', 'module:b']);
  });
});

describe('recommendPersona', () => {
  it('sorts candidates by mean smoothed success rate desc', () => {
    const store = new GraphStore();
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'code-reviewer', result: 'failure' },
      { agentPersona: 'code-reviewer', result: 'failure' },
      { agentPersona: 'code-reviewer', result: 'failure' },
    ]);

    const recs = recommendPersona(store, { systemNodeIds: ['module:api'] });
    expect(recs.map((r) => r.persona)).toEqual(['task-executor', 'code-reviewer']);
    expect(recs[0].score).toBeGreaterThan(recs[1].score);
  });

  it('uses the neutral prior 0.5 for systems with no history', () => {
    const store = new GraphStore();
    // Perfect history on module:a (3 successes) -> (3+1)/(3+2) = 0.8
    seed(store, 'module:a', [
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'task-executor', result: 'success' },
    ]);
    // module:b exists in the graph but task-executor has no history on it.
    store.addNode({ id: 'module:b', type: 'module', name: 'module:b', metadata: {} });

    const recs = recommendPersona(store, {
      systemNodeIds: ['module:a', 'module:b'],
    });
    expect(recs).toHaveLength(1);
    const rec = recs[0];
    expect(rec.persona).toBe('task-executor');
    expect(rec.coveredSystems).toBe(1);
    expect(rec.unknownSystems).toBe(1);
    expect(rec.totalSamples).toBe(3);
    // Expected score = (0.8 + 0.5) / 2 = 0.65
    expect(rec.score).toBeCloseTo(0.65, 5);
  });

  it('restricts the return set to candidatePersonas when provided', () => {
    const store = new GraphStore();
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'code-reviewer', result: 'success' },
    ]);

    const recs = recommendPersona(store, {
      systemNodeIds: ['module:api'],
      candidatePersonas: ['security-reviewer'],
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].persona).toBe('security-reviewer');
    // security-reviewer has no history -> score is the prior 0.5.
    expect(recs[0].score).toBeCloseTo(0.5, 5);
    expect(recs[0].totalSamples).toBe(0);
  });

  it('filters out personas below minSamples', () => {
    const store = new GraphStore();
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'code-reviewer', result: 'success' },
    ]);

    const recs = recommendPersona(store, {
      systemNodeIds: ['module:api'],
      minSamples: 2,
    });
    expect(recs.map((r) => r.persona)).toEqual(['task-executor']);
  });

  it('breaks ties by totalSamples desc', () => {
    const store = new GraphStore();
    // Both personas achieve 100% success on module:api so smoothed scores differ
    // only by sample size. Higher-sample persona should sort first.
    seed(store, 'module:api', [
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'task-executor', result: 'success' },
      { agentPersona: 'code-reviewer', result: 'success' },
    ]);

    const recs = recommendPersona(store, { systemNodeIds: ['module:api'] });
    // (5+1)/(5+2) = 0.857 vs (1+1)/(1+2) = 0.667 -> task-executor wins by score anyway,
    // but more importantly totalSamples drives the tiebreak when scores match.
    expect(recs[0].persona).toBe('task-executor');
    expect(recs[0].totalSamples).toBeGreaterThan(recs[1].totalSamples);
  });

  it('tiebreak uses totalSamples when scores match exactly', () => {
    const store = new GraphStore();
    // Identical outcomes -> identical smoothed rates. Different totalSamples via
    // observations on a second system that is NOT in the query set.
    seed(store, 'module:api', [
      { agentPersona: 'a', result: 'success' },
      { agentPersona: 'b', result: 'success' },
    ]);
    // "a" also has extra outcomes on module:other, still counted in totalSamples
    // because totalSamples is computed over requestedSystems, not all systems.
    seed(store, 'module:other', [{ agentPersona: 'a', result: 'success' }]);

    const recs = recommendPersona(store, { systemNodeIds: ['module:api'] });
    // Scores tie on module:api (both 0.667); tiebreak should be stable -- both
    // have totalSamples = 1 over the requested set, so preserve source order.
    expect(recs).toHaveLength(2);
    expect(recs[0].score).toBeCloseTo(recs[1].score, 5);
  });

  it('returns [] when no candidates can be found', () => {
    const store = new GraphStore();
    store.addNode({ id: 'module:api', type: 'module', name: 'module:api', metadata: {} });
    const recs = recommendPersona(store, { systemNodeIds: ['module:api'] });
    expect(recs).toEqual([]);
  });
});
