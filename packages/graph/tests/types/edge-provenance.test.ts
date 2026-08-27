import { describe, it, expect } from 'vitest';
import { EDGE_PROVENANCES, GraphEdgeSchema } from '../../src/types.js';

describe('Edge provenance schema', () => {
  it('EDGE_PROVENANCES enumerates EXTRACTED, INFERRED, AMBIGUOUS', () => {
    expect(EDGE_PROVENANCES).toEqual(['EXTRACTED', 'INFERRED', 'AMBIGUOUS']);
  });

  it('GraphEdgeSchema accepts an edge without provenance (back-compat)', () => {
    const edge = { from: 'file:a.ts', to: 'file:b.ts', type: 'imports' };
    const parsed = GraphEdgeSchema.parse(edge);
    expect(parsed).toMatchObject(edge);
    expect(parsed.provenance).toBeUndefined();
  });

  it.each(EDGE_PROVENANCES)('GraphEdgeSchema accepts provenance %s', (provenance) => {
    const edge = {
      from: 'file:src/a.ts',
      to: 'function:src/a.ts:foo',
      type: 'contains',
      provenance,
    };
    expect(GraphEdgeSchema.parse(edge)).toMatchObject(edge);
  });

  it('GraphEdgeSchema rejects an unknown provenance value', () => {
    const edge = {
      from: 'file:a.ts',
      to: 'file:b.ts',
      type: 'imports',
      provenance: 'GUESSED',
    };
    expect(() => GraphEdgeSchema.parse(edge)).toThrow();
  });

  it('provenance coexists with confidence on the same edge', () => {
    const edge = {
      from: 'req:abc:1',
      to: 'file:tests/a.test.ts',
      type: 'verified_by',
      confidence: 1.0,
      provenance: 'EXTRACTED',
    };
    expect(GraphEdgeSchema.parse(edge)).toMatchObject(edge);
  });
});
