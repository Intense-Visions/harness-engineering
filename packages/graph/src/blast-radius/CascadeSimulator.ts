import type { GraphStore } from '../store/GraphStore.js';
import type { GraphNode } from '../types.js';
import type {
  CascadeSimulationOptions,
  CascadeResult,
  CascadeNode,
  CascadeLayer,
  ProbabilityStrategy,
} from './types.js';
import { CompositeProbabilityStrategy } from './CompositeProbabilityStrategy.js';

const DEFAULT_PROBABILITY_FLOOR = 0.05;
const DEFAULT_MAX_DEPTH = 10;

// Category classification matching groupNodesByImpact
const TEST_TYPES: ReadonlySet<string> = new Set(['test_result']);
const DOC_TYPES: ReadonlySet<string> = new Set(['adr', 'decision', 'document', 'learning']);
const CODE_TYPES: ReadonlySet<string> = new Set([
  'file', 'module', 'class', 'interface', 'function', 'method', 'variable',
]);

function classifyNode(node: GraphNode): 'tests' | 'docs' | 'code' | 'other' {
  if (TEST_TYPES.has(node.type)) return 'tests';
  if (DOC_TYPES.has(node.type)) return 'docs';
  if (CODE_TYPES.has(node.type)) return 'code';
  return 'other';
}

export class CascadeSimulator {
  constructor(private readonly store: GraphStore) {}

  simulate(
    sourceNodeId: string,
    options: CascadeSimulationOptions = {},
  ): CascadeResult {
    const sourceNode = this.store.getNode(sourceNodeId);
    if (!sourceNode) {
      throw new Error(`Node not found: ${sourceNodeId}. Ensure the file has been ingested.`);
    }

    const probabilityFloor = options.probabilityFloor ?? DEFAULT_PROBABILITY_FLOOR;
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    const edgeTypeFilter = options.edgeTypes
      ? new Set(options.edgeTypes)
      : null;
    const strategy = options.strategy ?? this.buildDefaultStrategy();

    // BFS state
    // visited maps nodeId -> best CascadeNode (highest cumulative probability)
    const visited = new Map<string, CascadeNode>();
    // Queue: [nodeId, cumulativeProbability, depth, parentId, incomingEdge]
    const queue: Array<{
      nodeId: string;
      cumProb: number;
      depth: number;
      parentId: string;
      incomingEdge: string;
    }> = [];

    // Seed: get outgoing edges from source
    const sourceEdges = this.store.getEdges({ from: sourceNodeId });
    for (const edge of sourceEdges) {
      if (edge.to === sourceNodeId) continue; // skip self-loop
      if (edgeTypeFilter && !edgeTypeFilter.has(edge.type)) continue;
      const targetNode = this.store.getNode(edge.to);
      if (!targetNode) continue;
      const edgeProb = strategy.getEdgeProbability(edge, sourceNode, targetNode);
      const cumProb = edgeProb; // 1.0 * edgeProb
      if (cumProb < probabilityFloor) continue;
      queue.push({
        nodeId: edge.to,
        cumProb,
        depth: 1,
        parentId: sourceNodeId,
        incomingEdge: edge.type,
      });
    }

    // Track fan-out per node in the cascade for amplification detection
    const fanOutCount = new Map<string, number>();
    // Count source node fan-out
    fanOutCount.set(sourceNodeId, sourceEdges.filter(
      e => e.to !== sourceNodeId && (!edgeTypeFilter || edgeTypeFilter.has(e.type)),
    ).length);

    let head = 0;
    while (head < queue.length) {
      const entry = queue[head++]!;
      const { nodeId, cumProb, depth, parentId, incomingEdge } = entry;

      // Multi-path: skip if we already found a higher-probability path
      const existing = visited.get(nodeId);
      if (existing && existing.cumulativeProbability >= cumProb) continue;

      const targetNode = this.store.getNode(nodeId);
      if (!targetNode) continue;

      const cascadeNode: CascadeNode = {
        nodeId,
        name: targetNode.name,
        path: targetNode.path,
        type: targetNode.type,
        cumulativeProbability: cumProb,
        depth,
        incomingEdge,
        parentId,
      };
      visited.set(nodeId, cascadeNode);

      // Expand if within depth cap
      if (depth < maxDepth) {
        const outEdges = this.store.getEdges({ from: nodeId });
        let childCount = 0;
        for (const edge of outEdges) {
          if (edgeTypeFilter && !edgeTypeFilter.has(edge.type)) continue;
          if (edge.to === sourceNodeId) continue; // skip back-edge to source
          const childNode = this.store.getNode(edge.to);
          if (!childNode) continue;
          const edgeProb = strategy.getEdgeProbability(edge, targetNode, childNode);
          const newCumProb = cumProb * edgeProb;
          if (newCumProb < probabilityFloor) continue;
          childCount++;
          queue.push({
            nodeId: edge.to,
            cumProb: newCumProb,
            depth: depth + 1,
            parentId: nodeId,
            incomingEdge: edge.type,
          });
        }
        fanOutCount.set(nodeId, (fanOutCount.get(nodeId) ?? 0) + childCount);
      }
    }

    // Build layers and flat summary from visited
    return this.buildResult(sourceNodeId, sourceNode.name, visited, fanOutCount);
  }

  private buildDefaultStrategy(): ProbabilityStrategy {
    // Default with empty maps -- no changeFreq/coupling data
    return new CompositeProbabilityStrategy(new Map(), new Map());
  }

  private buildResult(
    sourceNodeId: string,
    sourceName: string,
    visited: Map<string, CascadeNode>,
    fanOutCount: Map<string, number>,
  ): CascadeResult {
    if (visited.size === 0) {
      return {
        sourceNodeId,
        sourceName,
        layers: [],
        flatSummary: [],
        summary: {
          totalAffected: 0,
          maxDepthReached: 0,
          highRisk: 0,
          mediumRisk: 0,
          lowRisk: 0,
          categoryBreakdown: { code: 0, tests: 0, docs: 0, other: 0 },
          amplificationPoints: [],
        },
      };
    }

    const allNodes = Array.from(visited.values());

    // Flat summary: sorted by probability desc
    const flatSummary = [...allNodes].sort(
      (a, b) => b.cumulativeProbability - a.cumulativeProbability,
    );

    // Group by depth for layers
    const depthMap = new Map<number, CascadeNode[]>();
    for (const node of allNodes) {
      let list = depthMap.get(node.depth);
      if (!list) {
        list = [];
        depthMap.set(node.depth, list);
      }
      list.push(node);
    }

    const layers: CascadeLayer[] = [];
    const depths = Array.from(depthMap.keys()).sort((a, b) => a - b);
    for (const depth of depths) {
      const nodes = depthMap.get(depth)!;
      const breakdown = { code: 0, tests: 0, docs: 0, other: 0 };
      for (const n of nodes) {
        const graphNode = this.store.getNode(n.nodeId);
        if (graphNode) {
          breakdown[classifyNode(graphNode)]++;
        }
      }
      layers.push({ depth, nodes, categoryBreakdown: breakdown });
    }

    // Summary stats
    let highRisk = 0;
    let mediumRisk = 0;
    let lowRisk = 0;
    const catBreakdown = { code: 0, tests: 0, docs: 0, other: 0 };

    for (const node of allNodes) {
      if (node.cumulativeProbability >= 0.5) highRisk++;
      else if (node.cumulativeProbability >= 0.2) mediumRisk++;
      else lowRisk++;

      const graphNode = this.store.getNode(node.nodeId);
      if (graphNode) {
        catBreakdown[classifyNode(graphNode)]++;
      }
    }

    // Amplification points: nodes with fan-out > 3 in the cascade
    const amplificationPoints: string[] = [];
    for (const [nodeId, count] of fanOutCount) {
      if (count > 3) {
        amplificationPoints.push(nodeId);
      }
    }

    const maxDepthReached = allNodes.reduce(
      (max, n) => Math.max(max, n.depth),
      0,
    );

    return {
      sourceNodeId,
      sourceName,
      layers,
      flatSummary,
      summary: {
        totalAffected: allNodes.length,
        maxDepthReached,
        highRisk,
        mediumRisk,
        lowRisk,
        categoryBreakdown: catBreakdown,
        amplificationPoints,
      },
    };
  }
}
