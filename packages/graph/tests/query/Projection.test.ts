import { describe, it, expect } from 'vitest';
import { project } from '../../src/query/Projection.js';
import type { GraphNode } from '../../src/types.js';

const makeNode = (overrides: Partial<GraphNode> = {}): GraphNode => ({
  id: 'node-1',
  type: 'file',
  name: 'index.ts',
  path: 'src/index.ts',
  content: 'export const x = 1;',
  metadata: {},
  ...overrides,
});

describe('project', () => {
  it('projects specific fields', () => {
    const nodes = [makeNode()];
    const result = project(nodes, { fields: ['id', 'name', 'type'] });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'node-1', name: 'index.ts', type: 'file' });
    expect(result[0]).not.toHaveProperty('content');
    expect(result[0]).not.toHaveProperty('path');
  });

  it('returns full node copies when no projection specified', () => {
    const nodes = [makeNode()];
    const result = project(nodes, undefined);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(nodes[0]);
    // Verify it is a copy, not the same reference
    expect(result[0]).not.toBe(nodes[0]);
  });

  it('handles empty array', () => {
    const result = project([], { fields: ['id'] });
    expect(result).toEqual([]);

    const resultNoSpec = project([], undefined);
    expect(resultNoSpec).toEqual([]);
  });
});
