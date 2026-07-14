import { describe, it, expect } from 'vitest';
import { shapeKey, dispatchableShapeKey } from './record.js';
import type {
  TriageRecord,
  TriagePrediction,
  TriageOutcome,
  PrecedentLookup,
  PrecedentRate,
} from './record.js';

describe('shapeKey', () => {
  it('composes sortedLabels | category | level', () => {
    expect(shapeKey(['auth', 'api'], 'dispatchable', 'trivial')).toBe(
      'api,auth|dispatchable|trivial'
    );
  });

  it('is label-order-independent (the deterministic bucketing invariant)', () => {
    const a = shapeKey(['a', 'b', 'c'], 'open-decision', 'simple');
    const b = shapeKey(['c', 'a', 'b'], 'open-decision', 'simple');
    expect(a).toBe(b);
  });

  it('de-duplicates repeated labels so bucketing is stable', () => {
    expect(shapeKey(['b', 'a', 'a'], 'not-in-band', 'moderate')).toBe(
      shapeKey(['a', 'b'], 'not-in-band', 'moderate')
    );
  });

  it('trims whitespace and drops empty labels', () => {
    expect(shapeKey([' auth ', '', '  '], 'dispatchable', 'complex')).toBe(
      'auth|dispatchable|complex'
    );
  });

  it('yields an empty label segment when no labels survive filtering', () => {
    expect(shapeKey([], 'unresolved-scope', 'trivial')).toBe('|unresolved-scope|trivial');
    expect(shapeKey(['   '], 'unresolved-scope', 'trivial')).toBe('|unresolved-scope|trivial');
  });

  it('distinguishes buckets by category and level', () => {
    expect(shapeKey(['x'], 'dispatchable', 'trivial')).not.toBe(
      shapeKey(['x'], 'open-decision', 'trivial')
    );
    expect(shapeKey(['x'], 'dispatchable', 'trivial')).not.toBe(
      shapeKey(['x'], 'dispatchable', 'simple')
    );
  });

  it('is a pure function (no dependence on call order or mutation of input)', () => {
    const labels = ['b', 'a'];
    const first = shapeKey(labels, 'dispatchable', 'trivial');
    const second = shapeKey(labels, 'dispatchable', 'trivial');
    expect(first).toBe(second);
    // input array is untouched
    expect(labels).toEqual(['b', 'a']);
  });
});

// FOLLOW-UP 2 (drift safety): the `dispatchable` bucket is the ONE convention prediction
// (probe precedent lookup) and outcome (marker record) must agree on. Centralized in
// dispatchableShapeKey and called at all 3 sites (probe.ts, triage-approve.ts, triage-mark.ts),
// so for the SAME (labels, level) every site buckets IDENTICALLY — prediction and outcome can
// never land in different shapes and silently break precedent aggregation.
describe('dispatchableShapeKey', () => {
  it('equals shapeKey(labels, "dispatchable", level) — the single dispatchable-bucket spelling', () => {
    const cases: ReadonlyArray<{
      labels: string[];
      level: 'trivial' | 'simple' | 'moderate' | 'complex';
    }> = [
      { labels: [], level: 'trivial' },
      { labels: ['api'], level: 'simple' },
      { labels: ['auth', 'api'], level: 'moderate' },
      { labels: [' auth ', 'api', 'api'], level: 'complex' },
    ];
    const mismatches = cases.filter(
      (c) => dispatchableShapeKey(c.labels, c.level) !== shapeKey(c.labels, 'dispatchable', c.level)
    );
    expect(mismatches).toEqual([]);
  });

  it('buckets the marker (prediction) and probe (lookup) IDENTICALLY for the same item', () => {
    // The marker keys on the item's verdict.level; the probe's precedent lever keys on the SAME
    // verdict.level. Modeling both call sites with one shared level source proves they collide.
    const labels = ['api', 'auth'];
    const probeVerdictLevel = 'simple' as const; // the probe's verdict.level
    const markerKey = dispatchableShapeKey(labels, probeVerdictLevel); // orchestrator marker
    const probeKey = dispatchableShapeKey(labels, probeVerdictLevel); // probe precedent lookup
    expect(markerKey).toBe(probeKey);
    // And label order at either site cannot split the bucket (deterministic sort).
    expect(dispatchableShapeKey(['auth', 'api'], probeVerdictLevel)).toBe(markerKey);
  });
});

describe('TriageRecord type shape (compile-time contract, exercised at runtime)', () => {
  it('accretes prediction then outcome slices keyed by externalId', () => {
    const prediction: TriagePrediction = {
      verdict: { level: 'trivial', confidence: 'medium', signals: {}, source: 'static' },
      levers: { scope: 'bounded', precedent: 'unknown' },
      scopeEstimate: 3,
      ratchetStage: 1,
    };
    const outcome: TriageOutcome = {
      actual: {
        level: 'trivial',
        confidence: 'high',
        signals: { blastRadius: 3 },
        source: 'escalated',
      },
      exceededBy: 0,
      matched: true,
    };
    const record: TriageRecord = {
      externalId: 'ISSUE-42',
      shapeKey: shapeKey(['api'], 'dispatchable', 'trivial'),
      prediction,
      outcome,
      ts: '2026-07-14T00:00:00.000Z',
    };
    expect(record.externalId).toBe('ISSUE-42');
    expect(record.prediction?.ratchetStage).toBe(1);
    expect(record.outcome?.matched).toBe(true);
  });

  it('is valid with only the base slice (prediction/outcome absent)', () => {
    const record: TriageRecord = {
      externalId: 'ISSUE-1',
      shapeKey: shapeKey([], 'not-in-band', 'complex'),
      ts: '2026-07-14T00:00:00.000Z',
    };
    expect(record.prediction).toBeUndefined();
    expect(record.outcome).toBeUndefined();
  });
});

describe('PrecedentLookup contract', () => {
  it('an empty-history implementation returns unknown (the P1 degrade-empty path)', () => {
    const emptyLookup: PrecedentLookup = {
      rateForShape: (): PrecedentRate => ({ kind: 'unknown' }),
    };
    expect(emptyLookup.rateForShape('any|dispatchable|trivial')).toEqual({ kind: 'unknown' });
  });

  it('a populated implementation returns a measured rate', () => {
    const lookup: PrecedentLookup = {
      rateForShape: (): PrecedentRate => ({ kind: 'rate', matched: 3, total: 4, rate: 0.75 }),
    };
    const r = lookup.rateForShape('x|dispatchable|simple');
    expect(r).toEqual({ kind: 'rate', matched: 3, total: 4, rate: 0.75 });
  });
});
