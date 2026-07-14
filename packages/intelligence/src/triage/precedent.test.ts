import { describe, it, expect } from 'vitest';
import { aggregatePrecedent, precedentLookupFromRecords } from './precedent.js';
import { shapeKey } from './record.js';
import type { TriageRecord } from './record.js';

const KEY = shapeKey(['api'], 'dispatchable', 'trivial');
const OTHER = shapeKey(['ui'], 'open-decision', 'simple');

function record(externalId: string, key: string, matched?: boolean): TriageRecord {
  const base: TriageRecord = { externalId, shapeKey: key, ts: '2026-07-14T00:00:00.000Z' };
  if (matched !== undefined) {
    base.outcome = {
      actual: { level: 'trivial', confidence: 'high', signals: {}, source: 'escalated' },
      exceededBy: matched ? 0 : 2,
      matched,
    };
  }
  return base;
}

describe('aggregatePrecedent', () => {
  it('returns unknown on an empty record set (cold-start degrade-empty)', () => {
    expect(aggregatePrecedent([], KEY)).toEqual({ kind: 'unknown' });
  });

  it('returns unknown when no records for the shape have an outcome', () => {
    const records = [record('a', KEY), record('b', KEY)]; // predictions only, no outcomes
    expect(aggregatePrecedent(records, KEY)).toEqual({ kind: 'unknown' });
  });

  it('computes matched/total base-rate over outcome-bearing records of the shape', () => {
    const records = [record('a', KEY, true), record('b', KEY, true), record('c', KEY, false)];
    expect(aggregatePrecedent(records, KEY)).toEqual({
      kind: 'rate',
      matched: 2,
      total: 3,
      rate: 2 / 3,
    });
  });

  it('only counts records matching the shapeKey', () => {
    const records = [
      record('a', KEY, true),
      record('x', OTHER, false), // different shape — excluded
      record('y', OTHER, true),
    ];
    expect(aggregatePrecedent(records, KEY)).toEqual({
      kind: 'rate',
      matched: 1,
      total: 1,
      rate: 1,
    });
  });

  it('does not count prediction-only records toward the total', () => {
    const records = [record('a', KEY, true), record('b', KEY)]; // b has no outcome
    expect(aggregatePrecedent(records, KEY)).toEqual({
      kind: 'rate',
      matched: 1,
      total: 1,
      rate: 1,
    });
  });
});

describe('precedentLookupFromRecords (the real PrecedentLookup P4 wires)', () => {
  it('an empty set yields unknown for every shape (P1 cold-start)', () => {
    const lookup = precedentLookupFromRecords([]);
    expect(lookup.rateForShape(KEY)).toEqual({ kind: 'unknown' });
    expect(lookup.rateForShape(OTHER)).toEqual({ kind: 'unknown' });
  });

  it('routes rateForShape through aggregatePrecedent', () => {
    const lookup = precedentLookupFromRecords([record('a', KEY, true), record('b', KEY, false)]);
    expect(lookup.rateForShape(KEY)).toEqual({ kind: 'rate', matched: 1, total: 2, rate: 0.5 });
    expect(lookup.rateForShape(OTHER)).toEqual({ kind: 'unknown' });
  });
});
