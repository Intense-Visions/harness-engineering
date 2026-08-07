import { describe, it, expect } from 'vitest';
import { GraphStore } from '@harness-engineering/graph';
import {
  toUatExecutionOutcome,
  UatSignoffRecorder,
  UAT_SIGNOFF_SOURCE,
} from '../../src/uat-signoff/index.js';
import type { UatSignoffInput } from '../../src/uat-signoff/index.js';
import { computePersonaEffectiveness } from '../../src/effectiveness/scorer.js';

const BASE: UatSignoffInput = {
  slug: 'acme-loyalty',
  decision: 'ACCEPTED',
  signedOffBy: 'Dana (client PO)',
  items: [
    { id: 'SC1', disposition: 'ACCEPT', note: 'auth works' },
    { id: 'SC2', disposition: 'ACCEPT' },
  ],
  criteriaRefs: ['SC1', 'SC2'],
  timestamp: '2026-06-22T00:00:00Z',
};

describe('toUatExecutionOutcome — human decision -> execution_outcome shape', () => {
  it('maps ACCEPTED to result:success and carries the human decision additively', () => {
    const outcome = toUatExecutionOutcome(BASE);
    expect(outcome.result).toBe('success');
    expect(outcome.issueId).toBe('uat-signoff');
    expect(outcome.identifier).toBe('uat-signoff:acme-loyalty');
    expect(outcome.linkedSpecId).toBeNull();
    expect(outcome.affectedSystemNodeIds).toEqual([]);
    expect(outcome.timestamp).toBe('2026-06-22T00:00:00Z');
    expect(outcome.id).toMatch(/^outcome:uat-signoff:acme-loyalty:/);
    expect(outcome.metadata).toMatchObject({
      source: UAT_SIGNOFF_SOURCE,
      slug: 'acme-loyalty',
      decision: 'ACCEPTED',
      signedOffBy: 'Dana (client PO)',
      criteriaRefs: ['SC1', 'SC2'],
    });
    // No items were rejected, so no failure reasons.
    expect(outcome.failureReasons).toEqual([]);
  });

  it('maps REJECTED / CHANGES_REQUESTED to result:failure and lists un-accepted items', () => {
    const rejected = toUatExecutionOutcome({
      ...BASE,
      decision: 'REJECTED',
      items: [
        { id: 'SC1', disposition: 'ACCEPT' },
        { id: 'SC2', disposition: 'REJECT', note: 'missing 404 path' },
        { id: 'SC3', disposition: 'CHANGES_REQUESTED' },
      ],
    });
    expect(rejected.result).toBe('failure');
    expect(rejected.failureReasons).toEqual(['SC2', 'SC3']);

    const changes = toUatExecutionOutcome({ ...BASE, decision: 'CHANGES_REQUESTED' });
    expect(changes.result).toBe('failure');
  });

  it('defaults timestamp to now and criteriaRefs to [] when omitted', () => {
    const { timestamp: _t, criteriaRefs: _c, ...rest } = BASE;
    const outcome = toUatExecutionOutcome(rest);
    expect(Number.isNaN(Date.parse(outcome.timestamp))).toBe(false);
    expect(outcome.metadata?.criteriaRefs).toEqual([]);
  });

  it('gives each sign-off a unique id (no same-millisecond collision)', () => {
    const a = toUatExecutionOutcome(BASE);
    const b = toUatExecutionOutcome(BASE);
    expect(a.id).not.toBe(b.id);
  });
});

describe('UatSignoffRecorder — persists into a real GraphStore', () => {
  it('writes exactly one signal-shaped execution_outcome node', () => {
    const store = new GraphStore();
    const { outcomeId, ingest } = new UatSignoffRecorder(store).record({
      ...BASE,
      decision: 'REJECTED',
      items: [{ id: 'SC2', disposition: 'REJECT' }],
    });

    expect(ingest.nodesAdded).toBe(1);
    const nodes = store.findNodes({ type: 'execution_outcome' });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe(outcomeId);
    // eval-fail-rate reads exactly these two fields.
    expect(nodes[0].metadata.result).toBe('failure');
    expect(typeof nodes[0].metadata.timestamp).toBe('string');
    expect(nodes[0].metadata.source).toBe('uat-signoff');
    expect(nodes[0].metadata.signedOffBy).toBe('Dana (client PO)');

    // A UAT node has no persona/affected systems, so the effectiveness scorer
    // traverses it without throwing and never counts it (advisory / record-only).
    expect(() => computePersonaEffectiveness(store)).not.toThrow();
    expect(computePersonaEffectiveness(store)).toEqual([]);
  });
});
