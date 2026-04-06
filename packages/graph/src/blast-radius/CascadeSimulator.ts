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
import { classifyNodeCategory } from '../query/groupImpact.js';

interface BfsEntry {
  nodeId: string;
  cumProb: number;
  depth: number;
  parentId: string;
  incomingEdge: string;
}

const DEFAULT_PROBABILITY_FLOOR = 0.05;
const DEFAULT_MAX_DEPTH = 10;

export class CascadeSimulator {
  constructor(private readonly store: GraphStore) {}

  simulate(sourceNodeId: string, options: CascadeSimulationOptions = {}): CascadeResult {
    const sourceNode = this.store.getNode(sourceNodeId);
    if (!sourceNode) {
      throw new Error(`Node not found: ${sourceNodeId}. Ensure the file has been ingested.`);
    }

    const probabilityFloor = options.probabilityFloor ?? DEFAULT_PROBABILITY_FLOOR;
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    const edgeTypeFilter = options.edgeTypes ? new Set(options.edgeTypes) : null;
    const strategy = options.strategy ?? this.buildDefaultStrategy();

    const visited = new Map<string, CascadeNode>();
    const queue: BfsEntry[] = [];
    const fanOutCount = new Map<string, number>();

    this.seedQueue(
      sourceNodeId,
      sourceNode,
      strategy,
      edgeTypeFilter,
      probabilityFloor,
      queue,
      fanOutCount
    );
    this.runBfs(
      queue,
      visited,
      fanOutCount,
      sourceNodeId,
      strategy,
      edgeTypeFilter,
      probabilityFloor,
      maxDepth
    );

    return this.buildResult(sourceNodeId, sourceNode.name, visited, fanOutCount);
  }

  private seedQueue(
    sourceNodeId: string,
    sourceNode: GraphNode,
    strategy: ProbabilityStrategy,
    edgeTypeFilter: Set<string> | null,
    probabilityFloor: number,
    queue: BfsEntry[],
    fanOutCount: Map<string, number>
  ): void {
    const sourceEdges = this.store.getEdges({ from: sourceNodeId });
    for (const edge of sourceEdges) {
      if (edge.to === sourceNodeId) continue;
      if (edgeTypeFilter && !edgeTypeFilter.has(edge.type)) continue;
      const targetNode = this.store.getNode(edge.to);
      if (!targetNode) continue;
      const cumProb = strategy.getEdgeProbability(edge, sourceNode, targetNode);
      if (cumProb < probabilityFloor) continue;
      queue.push({
        nodeId: edge.to,
        cumProb,
        depth: 1,
        parentId: sourceNodeId,
        incomingEdge: edge.type,
      });
    }
    fanOutCount.set(
      sourceNodeId,
      sourceEdges.filter(
        (e) => e.to !== sourceNodeId && (!edgeTypeFilter || edgeTypeFilter.has(e.type))
      ).length
    );
  }

  private runBfs(
    queue: BfsEntry[],
    visited: Map<string, CascadeNode>,
    fanOutCount: Map<string, number>,
    sourceNodeId: string,
    strategy: ProbabilityStrategy,
    edgeTypeFilter: Set<string> | null,
    probabilityFloor: number,
    maxDepth: number
  ): void {
    const MAX_QUEUE_SIZE = 10_000;
    let head = 0;
    while (head < queue.length) {
      if (queue.length > MAX_QUEUE_SIZE) break; // safety cap for degenerate graphs
      const entry = queue[head++]!;

      const existing = visited.get(entry.nodeId);
      if (existing && existing.cumulativeProbability >= entry.cumProb) continue;

      const targetNode = this.store.getNode(entry.nodeId);
      if (!targetNode) continue;

      visited.set(entry.nodeId, {
        nodeId: entry.nodeId,
        name: targetNode.name,
        ...(targetNode.path !== undefined && { path: targetNode.path }),
        type: targetNode.type,
        cumulativeProbability: entry.cumProb,
        depth: entry.depth,
        incomingEdge: entry.incomingEdge,
        parentId: entry.parentId,
      });

      if (entry.depth < maxDepth) {
        const childCount = this.expandNode(
          entry,
          targetNode,
          sourceNodeId,
          strategy,
          edgeTypeFilter,
          probabilityFloor,
          queue
        );
        fanOutCount.set(entry.nodeId, (fanOutCount.get(entry.nodeId) ?? 0) + childCount);
      }
    }
  }

  private expandNode(
    entry: BfsEntry,
    fromNode: GraphNode,
    sourceNodeId: string,
    strategy: ProbabilityStrategy,
    edgeTypeFilter: Set<string> | null,
    probabilityFloor: number,
    queue: BfsEntry[]
  ): number {
    const outEdges = this.store.getEdges({ from: entry.nodeId });
    let childCount = 0;
    for (const edge of outEdges) {
      if (edgeTypeFilter && !edgeTypeFilter.has(edge.type)) continue;
      if (edge.to === sourceNodeId) continue;
      const childNode = this.store.getNode(edge.to);
      if (!childNode) continue;
      const newCumProb = entry.cumProb * strategy.getEdgeProbability(edge, fromNode, childNode);
      if (newCumProb < probabilityFloor) continue;
      childCount++;
      queue.push({
        nodeId: edge.to,
        cumProb: newCumProb,
        depth: entry.depth + 1,
        parentId: entry.nodeId,
        incomingEdge: edge.type,
      });
    }
    return childCount;
  }

  private buildDefaultStrategy(): ProbabilityStrategy {
    // Default with empty maps -- no changeFreq/coupling data
    return new CompositeProbabilityStrategy(new Map(), new Map());
  }

  private buildResult(
    sourceNodeId: string,
    sourceName: string,
    visited: Map<string, CascadeNode>,
    fanOutCount: Map<string, number>
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
      (a, b) => b.cumulativeProbability - a.cumulativeProbability
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
          breakdown[classifyNodeCategory(graphNode)]++;
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
        catBreakdown[classifyNodeCategory(graphNode)]++;
      }
    }

    // Amplification points: nodes with fan-out > 3 in the cascade
    const amplificationPoints: string[] = [];
    for (const [nodeId, count] of fanOutCount) {
      if (count > 3) {
        amplificationPoints.push(nodeId);
      }
    }

    const maxDepthReached = allNodes.reduce((max, n) => Math.max(max, n.depth), 0);

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
