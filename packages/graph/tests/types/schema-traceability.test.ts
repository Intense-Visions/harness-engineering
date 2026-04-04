import { describe, it, expect } from 'vitest';
import { NODE_TYPES, EDGE_TYPES, GraphNodeSchema, GraphEdgeSchema } from '../../src/types.js';

describe('Traceability graph schema additions', () => {
  it('NODE_TYPES includes requirement', () => {
    expect(NODE_TYPES).toContain('requirement');
  });

  it('EDGE_TYPES includes requires', () => {
    expect(EDGE_TYPES).toContain('requires');
  });

  it('EDGE_TYPES includes verified_by', () => {
    expect(EDGE_TYPES).toContain('verified_by');
  });

  it('EDGE_TYPES includes tested_by', () => {
    expect(EDGE_TYPES).toContain('tested_by');
  });

  it('GraphNodeSchema accepts requirement type', () => {
    const node = {
      id: 'req:abc123:1',
      type: 'requirement',
      name: 'The system shall return 404 for missing users',
      metadata: { section: 'Observable Truths', index: 1 },
    };
    expect(GraphNodeSchema.parse(node)).toMatchObject(node);
  });

  it('GraphEdgeSchema accepts requires edge', () => {
    const edge = { from: 'req:abc123:1', to: 'file:src/handler.ts', type: 'requires' };
    expect(GraphEdgeSchema.parse(edge)).toMatchObject(edge);
  });

  it('GraphEdgeSchema accepts verified_by edge with confidence', () => {
    const edge = {
      from: 'req:abc123:1',
      to: 'file:tests/handler.test.ts',
      type: 'verified_by',
      confidence: 0.6,
      metadata: { method: 'convention' },
    };
    expect(GraphEdgeSchema.parse(edge)).toMatchObject(edge);
  });

  it('GraphEdgeSchema accepts tested_by edge', () => {
    const edge = {
      from: 'file:src/handler.ts',
      to: 'file:tests/handler.test.ts',
      type: 'tested_by',
    };
    expect(GraphEdgeSchema.parse(edge)).toMatchObject(edge);
  });
});
