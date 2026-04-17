import { describe, it, expect } from 'vitest';
import { findParallelGroups } from '../../src/review/parallel-groups';
import type { GraphNode } from '../../src/review/types';

describe('findParallelGroups()', () => {
  it('returns empty result for empty input', () => {
    const result = findParallelGroups([]);
    expect(result.waves).toEqual([]);
    expect(result.cyclic).toEqual([]);
    expect(result.orphaned).toEqual([]);
  });

  it('places all independent nodes in a single wave, sorted', () => {
    const nodes: GraphNode[] = [
      { id: 'c', dependsOn: [] },
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
    ];
    const result = findParallelGroups(nodes);
    expect(result.waves).toEqual([['a', 'b', 'c']]);
  });

  it('produces sequential waves for linear chain', () => {
    const nodes: GraphNode[] = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['b'] },
    ];
    const result = findParallelGroups(nodes);
    expect(result.waves).toEqual([['a'], ['b'], ['c']]);
  });

  it('handles diamond dependency — fanout then fanin', () => {
    const nodes: GraphNode[] = [
      { id: 'root', dependsOn: [] },
      { id: 'left', dependsOn: ['root'] },
      { id: 'right', dependsOn: ['root'] },
      { id: 'sink', dependsOn: ['left', 'right'] },
    ];
    const result = findParallelGroups(nodes);
    expect(result.waves).toEqual([['root'], ['left', 'right'], ['sink']]);
  });

  it('is deterministic regardless of input order', () => {
    const ordered: GraphNode[] = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['a'] },
      { id: 'd', dependsOn: ['b', 'c'] },
    ];
    const shuffled: GraphNode[] = [
      { id: 'd', dependsOn: ['c', 'b'] },
      { id: 'c', dependsOn: ['a'] },
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
    ];
    expect(findParallelGroups(ordered)).toEqual(findParallelGroups(shuffled));
  });

  it('returns disconnected subgraphs in the same waves as their depth allows', () => {
    const nodes: GraphNode[] = [
      { id: 'a1', dependsOn: [] },
      { id: 'a2', dependsOn: ['a1'] },
      { id: 'b1', dependsOn: [] },
      { id: 'b2', dependsOn: ['b1'] },
    ];
    const result = findParallelGroups(nodes);
    expect(result.waves).toEqual([
      ['a1', 'b1'],
      ['a2', 'b2'],
    ]);
  });

  it('reports cyclic nodes without throwing', () => {
    const nodes: GraphNode[] = [
      { id: 'a', dependsOn: ['c'] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['b'] },
      { id: 'free', dependsOn: [] },
    ];
    const result = findParallelGroups(nodes);
    expect(result.waves).toEqual([['free']]);
    expect(result.cyclic.sort()).toEqual(['a', 'b', 'c']);
  });

  it('reports orphaned dependency ids separately', () => {
    const nodes: GraphNode[] = [
      { id: 'a', dependsOn: ['missing'] },
      { id: 'b', dependsOn: ['a'] },
    ];
    const result = findParallelGroups(nodes);
    expect(result.orphaned).toEqual(['missing']);
    // 'missing' is not a known id; it should not block 'a'
    expect(result.waves).toEqual([['a'], ['b']]);
  });

  it('deduplicates redundant dependsOn entries', () => {
    const nodes: GraphNode[] = [
      { id: 'root', dependsOn: [] },
      { id: 'leaf', dependsOn: ['root', 'root', 'root'] },
    ];
    const result = findParallelGroups(nodes);
    expect(result.waves).toEqual([['root'], ['leaf']]);
    expect(result.cyclic).toEqual([]);
  });

  it('sorts cyclic ids lexicographically', () => {
    const nodes: GraphNode[] = [
      { id: 'z', dependsOn: ['y'] },
      { id: 'y', dependsOn: ['x'] },
      { id: 'x', dependsOn: ['z'] },
    ];
    const result = findParallelGroups(nodes);
    expect(result.cyclic).toEqual(['x', 'y', 'z']);
  });
});
