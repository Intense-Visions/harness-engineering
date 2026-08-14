import { describe, it, expect } from 'vitest';
import type { GraphNode } from '../types.js';
import {
  classifyNodeCategory,
  groupNodesByImpact,
  TEST_TYPES,
  DOC_TYPES,
  CODE_TYPES,
} from './groupImpact.js';

/**
 * Unit coverage for the impact-grouping helpers shared by the NLQ orchestrator
 * and the MCP `get_impact` handler. Pure functions over graph nodes: a node's
 * `type` maps to one of four categories, and a node list partitions into those
 * categories with the root excluded.
 */

function node(id: string, type: string): GraphNode {
  return {
    id,
    type: type as GraphNode['type'],
    name: id,
    metadata: {},
  };
}

describe('classifyNodeCategory', () => {
  it('classifies test_result nodes as tests', () => {
    expect(classifyNodeCategory(node('t', 'test_result'))).toBe('tests');
  });

  it.each([...DOC_TYPES])('classifies %s as docs', (t) => {
    expect(classifyNodeCategory(node('d', t))).toBe('docs');
  });

  it.each([...CODE_TYPES])('classifies %s as code', (t) => {
    expect(classifyNodeCategory(node('c', t))).toBe('code');
  });

  it('classifies an unknown type as other', () => {
    expect(classifyNodeCategory(node('x', 'span'))).toBe('other');
  });

  it('exposes the expected category type-sets', () => {
    expect(TEST_TYPES.has('test_result')).toBe(true);
    expect(DOC_TYPES.has('adr')).toBe(true);
    expect(CODE_TYPES.has('function')).toBe(true);
  });
});

describe('groupNodesByImpact', () => {
  it('partitions nodes into the four categories', () => {
    const nodes = [
      node('fn', 'function'),
      node('adr', 'adr'),
      node('test', 'test_result'),
      node('metric', 'metric'),
    ];

    const groups = groupNodesByImpact(nodes);

    expect(groups.code.map((n) => n.id)).toEqual(['fn']);
    expect(groups.docs.map((n) => n.id)).toEqual(['adr']);
    expect(groups.tests.map((n) => n.id)).toEqual(['test']);
    expect(groups.other.map((n) => n.id)).toEqual(['metric']);
  });

  it('excludes the node matching excludeId (the root) from all buckets', () => {
    const nodes = [node('root', 'function'), node('dep', 'function')];

    const groups = groupNodesByImpact(nodes, 'root');

    expect(groups.code.map((n) => n.id)).toEqual(['dep']);
  });

  it('returns four empty arrays for an empty node list', () => {
    const groups = groupNodesByImpact([]);
    expect(groups).toEqual({ tests: [], docs: [], code: [], other: [] });
  });

  it('does not exclude anything when excludeId is omitted', () => {
    const nodes = [node('a', 'file'), node('b', 'file')];
    expect(groupNodesByImpact(nodes).code).toHaveLength(2);
  });

  it('preserves input order within a category', () => {
    const nodes = [node('a', 'file'), node('b', 'module'), node('c', 'class')];
    expect(groupNodesByImpact(nodes).code.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });
});
