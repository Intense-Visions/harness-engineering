import { describe, it, expect } from 'vitest';
import { LouvainDetector } from '../../src/community/LouvainDetector.js';
import type { CommunityGraphInput } from '../../src/community/CommunityDetector.js';

const detector = new LouvainDetector();

/** Group node ids by their assigned community. */
function groupByCommunity(input: CommunityGraphInput, seed?: number): Map<number, string[]> {
  const { assignments } = detector.detect(input, seed === undefined ? {} : { seed });
  const groups = new Map<number, string[]>();
  for (const { nodeId, community } of assignments) {
    const g = groups.get(community) ?? [];
    g.push(nodeId);
    groups.set(community, g);
  }
  return groups;
}

/** Build an undirected clique over the given node ids. */
function clique(ids: string[]): CommunityGraphInput {
  const edges = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      edges.push({ source: ids[i], target: ids[j] });
    }
  }
  return { nodeIds: ids, edges };
}

describe('LouvainDetector', () => {
  it('has a stable name for pluggability', () => {
    expect(detector.name).toBe('louvain');
  });

  it('splits two clearly-separable clusters into >= 2 communities', () => {
    // Two dense triangles bridged by a single weak edge.
    const input: CommunityGraphInput = {
      nodeIds: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'],
      edges: [
        { source: 'a1', target: 'a2' },
        { source: 'a2', target: 'a3' },
        { source: 'a3', target: 'a1' },
        { source: 'b1', target: 'b2' },
        { source: 'b2', target: 'b3' },
        { source: 'b3', target: 'b1' },
        { source: 'a1', target: 'b1' }, // single bridge
      ],
    };
    const result = detector.detect(input);
    expect(result.communityCount).toBeGreaterThanOrEqual(2);
    expect(result.modularity).toBeGreaterThan(0);

    // The two triangles must land in different communities.
    const byNode = new Map(result.assignments.map((a) => [a.nodeId, a.community]));
    expect(byNode.get('a1')).toBe(byNode.get('a2'));
    expect(byNode.get('a2')).toBe(byNode.get('a3'));
    expect(byNode.get('b1')).toBe(byNode.get('b2'));
    expect(byNode.get('b2')).toBe(byNode.get('b3'));
    expect(byNode.get('a1')).not.toBe(byNode.get('b1'));
  });

  it('separates two disconnected clusters', () => {
    const input: CommunityGraphInput = {
      nodeIds: ['x1', 'x2', 'x3', 'y1', 'y2', 'y3'],
      edges: [...clique(['x1', 'x2', 'x3']).edges, ...clique(['y1', 'y2', 'y3']).edges],
    };
    const groups = groupByCommunity(input);
    expect(groups.size).toBeGreaterThanOrEqual(2);
  });

  it('collapses a fully-connected clique into a single community', () => {
    const result = detector.detect(clique(['n1', 'n2', 'n3', 'n4', 'n5']));
    expect(result.communityCount).toBe(1);
    expect(new Set(result.assignments.map((a) => a.community))).toEqual(new Set([0]));
  });

  it('is deterministic: identical labels across repeated runs (no seed)', () => {
    const input: CommunityGraphInput = {
      nodeIds: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'],
      edges: [
        { source: 'a1', target: 'a2' },
        { source: 'a2', target: 'a3' },
        { source: 'a3', target: 'a1' },
        { source: 'b1', target: 'b2' },
        { source: 'b2', target: 'b3' },
        { source: 'b3', target: 'b1' },
        { source: 'a1', target: 'b1' },
      ],
    };
    const first = detector.detect(input).assignments;
    const second = detector.detect(input).assignments;
    expect(second).toEqual(first);
  });

  it('is deterministic given a fixed seed', () => {
    const input: CommunityGraphInput = {
      nodeIds: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3'],
      edges: [
        ...clique(['a1', 'a2', 'a3']).edges,
        ...clique(['b1', 'b2', 'b3']).edges,
        ...clique(['c1', 'c2', 'c3']).edges,
        { source: 'a1', target: 'b1' },
        { source: 'b1', target: 'c1' },
      ],
    };
    const first = detector.detect(input, { seed: 42 }).assignments;
    const second = detector.detect(input, { seed: 42 }).assignments;
    expect(second).toEqual(first);
    // Community ids are canonical: first-seen node gets community 0.
    expect(first[0].community).toBe(0);
  });

  it('honors edge weights: a heavy bridge merges otherwise-separate clusters', () => {
    const weak: CommunityGraphInput = {
      nodeIds: ['a1', 'a2', 'b1', 'b2'],
      edges: [
        { source: 'a1', target: 'a2', weight: 5 },
        { source: 'b1', target: 'b2', weight: 5 },
        { source: 'a2', target: 'b1', weight: 0.1 },
      ],
    };
    expect(detector.detect(weak).communityCount).toBeGreaterThanOrEqual(2);
  });

  it('labels isolated nodes each in their own community', () => {
    const input: CommunityGraphInput = {
      nodeIds: ['solo1', 'solo2', 'solo3'],
      edges: [],
    };
    const result = detector.detect(input);
    expect(result.communityCount).toBe(3);
  });

  it('ignores edges referencing unknown node ids', () => {
    const input: CommunityGraphInput = {
      nodeIds: ['a', 'b'],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'ghost' }, // dangling
      ],
    };
    const result = detector.detect(input);
    expect(result.communityCount).toBe(1);
    expect(result.assignments).toHaveLength(2);
  });

  it('handles an empty graph', () => {
    const result = detector.detect({ nodeIds: [], edges: [] });
    expect(result.communityCount).toBe(0);
    expect(result.assignments).toHaveLength(0);
    expect(result.modularity).toBe(0);
  });

  it('assigns every node exactly one community id in range', () => {
    const input: CommunityGraphInput = {
      nodeIds: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'],
      edges: [
        ...clique(['a1', 'a2', 'a3']).edges,
        ...clique(['b1', 'b2', 'b3']).edges,
        { source: 'a1', target: 'b1' },
      ],
    };
    const result = detector.detect(input);
    for (const { community } of result.assignments) {
      expect(community).toBeGreaterThanOrEqual(0);
      expect(community).toBeLessThan(result.communityCount);
    }
  });
});
