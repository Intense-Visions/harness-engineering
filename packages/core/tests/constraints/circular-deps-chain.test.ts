import { describe, it, expect } from 'vitest';
import { detectCircularDeps } from '../../src/constraints/circular-deps';
import type { DependencyGraph } from '../../src/constraints/types';

/**
 * Regression coverage for #2329: the reported cycle chain must close on its
 * FIRST node (`b -> a -> b`), not repeat its last one (`b -> a -> a`).
 *
 * The chain is a data contract, not just rendering: `check-deps` prints it,
 * `--json` carries it, and the arch `circular-deps` collector hashes it into
 * a violation id. Every consecutive pair must therefore be a real import edge.
 */
function edgesOf(graph: DependencyGraph): Set<string> {
  return new Set(graph.edges.map((e) => `${e.from}=>${e.to}`));
}

function expectClosedRealChain(graph: DependencyGraph, size: number): string[] {
  const result = detectCircularDeps(graph);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('unreachable');
  expect(result.value.cycles).toHaveLength(1);
  const { cycle } = result.value.cycles[0]!;
  expect(cycle).toHaveLength(size + 1);
  expect(cycle[cycle.length - 1]).toBe(cycle[0]);
  // No node other than the closing one repeats.
  expect(new Set(cycle.slice(0, -1)).size).toBe(size);
  const edges = edgesOf(graph);
  for (let i = 0; i < cycle.length - 1; i++) {
    expect(edges.has(`${cycle[i]}=>${cycle[i + 1]}`)).toBe(true);
  }
  return cycle;
}

describe('detectCircularDeps chain shape (#2329)', () => {
  it('closes a 2-file cycle on its first node', () => {
    const cycle = expectClosedRealChain(
      {
        nodes: ['b.ts', 'a.ts'],
        edges: [
          { from: 'b.ts', to: 'a.ts', importType: 'static', line: 1 },
          { from: 'a.ts', to: 'b.ts', importType: 'static', line: 1 },
        ],
      },
      2
    );
    // Canonical rotation: the chain starts at the lowest-sorted node (#2390).
    expect(cycle).toEqual(['a.ts', 'b.ts', 'a.ts']);
  });

  it('closes a 3-file cycle on its first node', () => {
    const cycle = expectClosedRealChain(
      {
        nodes: ['a.ts', 'b.ts', 'c.ts'],
        edges: [
          { from: 'a.ts', to: 'b.ts', importType: 'static', line: 1 },
          { from: 'b.ts', to: 'c.ts', importType: 'static', line: 1 },
          { from: 'c.ts', to: 'a.ts', importType: 'static', line: 1 },
        ],
      },
      3
    );
    expect(cycle).toEqual(['a.ts', 'b.ts', 'c.ts', 'a.ts']);
  });

  it('closes a self-import on itself', () => {
    const result = detectCircularDeps({
      nodes: ['a.ts'],
      edges: [{ from: 'a.ts', to: 'a.ts', importType: 'static', line: 1 }],
    });
    expect(result.ok && result.value.cycles[0]!.cycle).toEqual(['a.ts', 'a.ts']);
  });
});

/**
 * #2390: an SCC with branching edges holds more than one elementary cycle.
 * Tarjan discovery order is then not a walk, so the chain could name pairs
 * with no import between them. The chain must be a real closed walk, and
 * its form must not depend on graph traversal order (the arch violation id
 * hashes it).
 */
describe('detectCircularDeps chain for a branching SCC (#2390)', () => {
  // Two cycles sharing hub.ts: hub -> a -> hub and hub -> b -> c -> hub.
  const nodes = ['hub.ts', 'a.ts', 'b.ts', 'c.ts'];
  const edges = [
    { from: 'hub.ts', to: 'b.ts', importType: 'static' as const, line: 1 },
    { from: 'b.ts', to: 'c.ts', importType: 'static' as const, line: 1 },
    { from: 'c.ts', to: 'hub.ts', importType: 'static' as const, line: 1 },
    { from: 'hub.ts', to: 'a.ts', importType: 'static' as const, line: 2 },
    { from: 'a.ts', to: 'hub.ts', importType: 'static' as const, line: 1 },
  ];

  function chainOf(graph: DependencyGraph): { cycle: string[]; size: number } {
    const result = detectCircularDeps(graph);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.cycles).toHaveLength(1);
    return result.value.cycles[0]!;
  }

  it('emits a chain whose every consecutive pair is a real import edge', () => {
    const graph: DependencyGraph = { nodes, edges };
    const { cycle, size } = chainOf(graph);
    expect(cycle[cycle.length - 1]).toBe(cycle[0]);
    const real = edgesOf(graph);
    for (let i = 0; i < cycle.length - 1; i++) {
      expect(real.has(`${cycle[i]}=>${cycle[i + 1]}`), `${cycle[i]} -> ${cycle[i + 1]}`).toBe(true);
    }
    // Shortest cycle through the lowest-sorted node, starting there.
    expect(cycle).toEqual(['a.ts', 'hub.ts', 'a.ts']);
    // `size` still reports how many files the SCC entangles.
    expect(size).toBe(4);
  });

  it('emits the same chain regardless of node and edge order', () => {
    const forward = chainOf({ nodes, edges }).cycle;
    const reversed = chainOf({ nodes: [...nodes].reverse(), edges: [...edges].reverse() }).cycle;
    const fromLeaf = chainOf({ nodes: ['c.ts', 'b.ts', 'a.ts', 'hub.ts'], edges }).cycle;
    expect(reversed).toEqual(forward);
    expect(fromLeaf).toEqual(forward);
  });
});
