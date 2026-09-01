import { describe, it, expect } from 'vitest';
import type { GraphNode, NodeType } from '../../src/types.js';
import {
  StabilityTier,
  stabilityTierForNode,
  orderByStability,
  auditLayout,
  toLayoutSections,
  CacheEfficiencyMeter,
} from '../../src/context/StabilityLayout.js';

function node(
  id: string,
  type: NodeType,
  metadata: Record<string, unknown> = {},
  hash?: string
): GraphNode {
  return { id, type, name: id, metadata, ...(hash !== undefined && { hash }) };
}

const idsOf = (nodes: readonly GraphNode[]): string[] => nodes.map((n) => n.id);

describe('stabilityTierForNode', () => {
  it('maps node types to tiers, defaulting unknown types to VOLATILE', () => {
    expect(stabilityTierForNode(node('a', 'adr'))).toBe(StabilityTier.IMMUTABLE);
    expect(stabilityTierForNode(node('m', 'module'))).toBe(StabilityTier.CONVENTION);
    expect(stabilityTierForNode(node('f', 'function'))).toBe(StabilityTier.SESSION);
    expect(stabilityTierForNode(node('x', 'failure'))).toBe(StabilityTier.VOLATILE);
    // 'span' is present in the type map as VOLATILE; a genuinely unmapped-ish
    // per-turn type also lands VOLATILE via the fail-safe default.
    expect(stabilityTierForNode(node('l', 'log'))).toBe(StabilityTier.VOLATILE);
  });

  it('honors an explicit metadata.stabilityTier override', () => {
    // A function (normally SESSION) pinned as immutable knowledge.
    const pinned = node('f', 'function', { stabilityTier: StabilityTier.IMMUTABLE });
    expect(stabilityTierForNode(pinned)).toBe(StabilityTier.IMMUTABLE);
  });
});

describe('orderByStability', () => {
  it('orders nodes into strictly descending stability (most stable first)', () => {
    const input = [
      node('turn', 'failure'),
      node('fn', 'function'),
      node('mod', 'module'),
      node('adr', 'adr'),
    ];
    const ordered = orderByStability(input);
    const tiers = ordered.map(stabilityTierForNode);
    // Non-increasing stability: no node precedes a strictly more-stable node.
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]!).toBeGreaterThanOrEqual(tiers[i - 1]!);
    }
    expect(idsOf(ordered)).toEqual(['adr', 'mod', 'fn', 'turn']);
  });

  it('is content-neutral — output is a permutation of the input (acceptance #3)', () => {
    const input = [
      node('a', 'failure'),
      node('b', 'adr'),
      node('c', 'function'),
      node('d', 'module'),
      node('e', 'learning'),
    ];
    const ordered = orderByStability(input);
    expect(ordered).toHaveLength(input.length);
    expect([...idsOf(ordered)].sort()).toEqual([...idsOf(input)].sort());
  });

  it('preserves intra-tier relevance order (stable sort)', () => {
    // Three functions (same tier) fed in a specific relevance order.
    const input = [node('fn3', 'function'), node('fn1', 'function'), node('fn2', 'function')];
    expect(idsOf(orderByStability(input))).toEqual(['fn3', 'fn1', 'fn2']);
  });
});

describe('auditLayout', () => {
  it('flags a seeded volatile-first layout (acceptance #2)', () => {
    const volatileFirst = [
      node('turn', 'failure'), // VOLATILE placed ahead of stable content
      node('adr', 'adr'),
      node('mod', 'module'),
    ];
    const violations = auditLayout(volatileFirst);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.nodeId).toBe('turn');
    expect(violations[0]!.precedesNodeId).toBe('adr');
  });

  it('returns no violations on a stability-ordered layout', () => {
    const ordered = orderByStability([
      node('turn', 'failure'),
      node('adr', 'adr'),
      node('mod', 'module'),
      node('fn', 'function'),
    ]);
    expect(auditLayout(ordered)).toEqual([]);
  });
});

describe('CacheEfficiencyMeter', () => {
  it('reports zero cached fraction on the first assembly of a class', () => {
    const meter = new CacheEfficiencyMeter();
    const report = meter.record('review', [node('adr', 'adr', {}, 'h1')]);
    expect(report.workflowClass).toBe('review');
    expect(report.cachedFraction).toBe(0);
    expect(report.totalTokens).toBeGreaterThan(0);
  });

  it('stability ordering yields a larger cached fraction than relevance order (acceptance #1)', () => {
    // Two turns of the same workflow class. Stable knowledge is unchanged; one
    // volatile per-turn node changes content between turns.
    const stableA = node('adr', 'adr', { text: 'architecture decision' }, 'adr-h');
    const stableB = node('mod', 'module', { text: 'module map' }, 'mod-h');
    const stableC = node('fn', 'function', { text: 'a function' }, 'fn-h');
    const volatileTurn1 = node('turn', 'failure', { at: 1 }, 'turn-h1');
    const volatileTurn2 = node('turn', 'failure', { at: 2 }, 'turn-h2'); // changed content

    // Relevance order happens to place the volatile node FIRST (its score is
    // high because it matched the query) — invalidating the whole prefix.
    const relevanceTurn1 = [volatileTurn1, stableA, stableB, stableC];
    const relevanceTurn2 = [volatileTurn2, stableA, stableB, stableC];

    const relevanceMeter = new CacheEfficiencyMeter();
    relevanceMeter.record('debug', relevanceTurn1);
    const relevanceHit = relevanceMeter.record('debug', relevanceTurn2);

    // Stability order pushes the volatile node LAST, so the stable head caches.
    const stabilityTurn1 = orderByStability(relevanceTurn1);
    const stabilityTurn2 = orderByStability(relevanceTurn2);

    const stabilityMeter = new CacheEfficiencyMeter();
    stabilityMeter.record('debug', stabilityTurn1);
    const stabilityHit = stabilityMeter.record('debug', stabilityTurn2);

    // Denominators are equal (content-neutral: same nodes, reordered).
    expect(stabilityHit.totalTokens).toBe(relevanceHit.totalTokens);
    // The relevance layout invalidates from the first node → ~0 cached.
    expect(relevanceHit.cachedFraction).toBe(0);
    // The stability layout caches the entire stable head.
    expect(stabilityHit.cachedFraction).toBeGreaterThan(relevanceHit.cachedFraction);
    expect(stabilityHit.cachedFraction).toBeGreaterThan(0.5);
  });

  it('summarizes assemblies and mean cached fraction per workflow class', () => {
    const meter = new CacheEfficiencyMeter();
    const layout = orderByStability([node('adr', 'adr', {}, 'h'), node('fn', 'function', {}, 'g')]);
    meter.record('plan', layout);
    meter.record('plan', layout); // identical → full cache on the 2nd
    const summary = meter.summary();
    expect(summary['plan']!.assemblies).toBe(2);
    expect(summary['plan']!.meanCachedFraction).toBeGreaterThan(0);
  });
});

describe('toLayoutSections', () => {
  it('groups an ordered layout into per-tier sections, most stable first', () => {
    const ordered = orderByStability([
      node('turn', 'failure'),
      node('adr', 'adr'),
      node('fn', 'function'),
    ]);
    const sections = toLayoutSections(ordered);
    expect(sections.map((s) => s.tier)).toEqual([
      StabilityTier.IMMUTABLE,
      StabilityTier.SESSION,
      StabilityTier.VOLATILE,
    ]);
    expect(sections[0]!.nodeIds).toEqual(['adr']);
    expect(sections.every((s) => s.tokens > 0)).toBe(true);
  });
});
