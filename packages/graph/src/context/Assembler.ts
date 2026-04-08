import type { GraphStore } from '../store/GraphStore.js';
import type { VectorStore } from '../store/VectorStore.js';
import type { GraphNode, GraphEdge, NodeType } from '../types.js';
import { ContextQL } from '../query/ContextQL.js';
import { FusionLayer } from '../search/FusionLayer.js';

export interface AssembledContext {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly tokenEstimate: number;
  readonly intent: string;
  readonly truncated: boolean;
}

export interface GraphBudget {
  readonly total: number;
  readonly allocations: Record<string, number>;
  readonly density: Record<string, number>;
}

export interface GraphFilterResult {
  readonly phase: string;
  readonly nodes: readonly GraphNode[];
  readonly filePaths: readonly string[];
}

export interface GraphCoverageReport {
  readonly documented: readonly string[];
  readonly undocumented: readonly string[];
  readonly coveragePercentage: number;
  readonly totalCodeNodes: number;
}

const PHASE_NODE_TYPES: Record<string, readonly NodeType[]> = {
  implement: ['file', 'function', 'class', 'method', 'interface', 'variable'],
  review: ['adr', 'document', 'learning', 'commit'],
  debug: ['failure', 'learning', 'function', 'method'],
  plan: ['adr', 'document', 'module', 'layer'],
};

const CODE_NODE_TYPES: ReadonlySet<NodeType> = new Set([
  'file',
  'function',
  'class',
  'interface',
  'method',
  'variable',
]);

function estimateNodeTokens(node: GraphNode): number {
  const baseChars = (node.name?.length ?? 0) + (node.path?.length ?? 0) + (node.type?.length ?? 0);
  const metaChars = node.metadata ? JSON.stringify(node.metadata).length : 0;
  return Math.ceil((baseChars + metaChars) / 4);
}

export class Assembler {
  private readonly store: GraphStore;
  private readonly vectorStore: VectorStore | undefined;
  private fusionLayer: FusionLayer | undefined;

  constructor(store: GraphStore, vectorStore?: VectorStore) {
    this.store = store;
    this.vectorStore = vectorStore;
  }

  private getFusionLayer(): FusionLayer {
    if (!this.fusionLayer) {
      this.fusionLayer = new FusionLayer(this.store, this.vectorStore);
    }
    return this.fusionLayer;
  }

  /**
   * Assemble context relevant to an intent string within a token budget.
   */
  assembleContext(intent: string, tokenBudget = 4000): AssembledContext {
    const fusion = this.getFusionLayer();
    const topResults = fusion.search(intent, 10);

    if (topResults.length === 0) {
      return { nodes: [], edges: [], tokenEstimate: 0, intent, truncated: false };
    }

    const { nodeMap, collectedEdges, nodeScores } = this.expandSearchResults(topResults);

    // Sort nodes by score (highest first) for truncation
    const sortedNodes = Array.from(nodeMap.values()).sort((a, b) => {
      return (nodeScores.get(b.id) ?? 0) - (nodeScores.get(a.id) ?? 0);
    });

    const { keptNodes, tokenEstimate, truncated } = this.truncateToFit(sortedNodes, tokenBudget);

    // Filter edges to only include those between kept nodes
    const keptNodeIds = new Set(keptNodes.map((n) => n.id));
    const keptEdges = collectedEdges.filter(
      (e) => keptNodeIds.has(e.from) && keptNodeIds.has(e.to)
    );

    return { nodes: keptNodes, edges: keptEdges, tokenEstimate, intent, truncated };
  }

  private expandSearchResults(topResults: Array<{ nodeId: string; score: number }>): {
    nodeMap: Map<string, GraphNode>;
    collectedEdges: GraphEdge[];
    nodeScores: Map<string, number>;
  } {
    const contextQL = new ContextQL(this.store);
    const nodeMap = new Map<string, GraphNode>();
    const edgeSet = new Set<string>();
    const collectedEdges: GraphEdge[] = [];
    const nodeScores = new Map<string, number>();

    for (const result of topResults) {
      nodeScores.set(result.nodeId, result.score);

      const expanded = contextQL.execute({
        rootNodeIds: [result.nodeId],
        maxDepth: 2,
      });

      for (const node of expanded.nodes) {
        if (!nodeMap.has(node.id)) {
          nodeMap.set(node.id, node);
          if (!nodeScores.has(node.id)) {
            nodeScores.set(node.id, result.score * 0.5);
          }
        }
      }

      for (const edge of expanded.edges) {
        const key = `${edge.from}|${edge.to}|${edge.type}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          collectedEdges.push(edge);
        }
      }
    }

    return { nodeMap, collectedEdges, nodeScores };
  }

  private truncateToFit(
    sortedNodes: GraphNode[],
    tokenBudget: number
  ): { keptNodes: GraphNode[]; tokenEstimate: number; truncated: boolean } {
    let tokenEstimate = 0;
    const keptNodes: GraphNode[] = [];
    let truncated = false;

    for (const node of sortedNodes) {
      const nodeTokens = estimateNodeTokens(node);
      if (tokenEstimate + nodeTokens > tokenBudget && keptNodes.length > 0) {
        truncated = true;
        break;
      }
      tokenEstimate += nodeTokens;
      keptNodes.push(node);
    }

    return { keptNodes, tokenEstimate, truncated };
  }

  private countNodesByType(): Record<string, number> {
    const typeCounts: Record<string, number> = {};
    for (const node of this.store.findNodes({})) {
      typeCounts[node.type] = (typeCounts[node.type] ?? 0) + 1;
    }
    return typeCounts;
  }

  private computeModuleDensity(): Record<string, number> {
    const density: Record<string, number> = {};
    for (const mod of this.store.findNodes({ type: 'module' })) {
      const out = this.store.getEdges({ from: mod.id }).length;
      const inn = this.store.getEdges({ to: mod.id }).length;
      density[mod.name] = out + inn;
    }
    return density;
  }

  private computeTypeWeights(
    typeCounts: Record<string, number>,
    boostTypes: readonly NodeType[] | undefined
  ): { weights: Record<string, number>; weightedTotal: number } {
    const weights: Record<string, number> = {};
    let weightedTotal = 0;
    for (const [type, count] of Object.entries(typeCounts)) {
      const weight = count * (boostTypes?.includes(type as NodeType) ? 2.0 : 1.0);
      weights[type] = weight;
      weightedTotal += weight;
    }
    return { weights, weightedTotal };
  }

  private allocateProportionally(
    weights: Record<string, number>,
    weightedTotal: number,
    totalTokens: number
  ): Record<string, number> {
    const allocations: Record<string, number> = {};
    if (weightedTotal === 0) return allocations;
    let allocated = 0;
    const types = Object.keys(weights);
    for (let i = 0; i < types.length; i++) {
      const type = types[i]!;
      if (i === types.length - 1) {
        allocations[type] = totalTokens - allocated;
      } else {
        const share = Math.round((weights[type]! / weightedTotal) * totalTokens);
        allocations[type] = share;
        allocated += share;
      }
    }
    return allocations;
  }

  computeBudget(totalTokens: number, phase?: string): GraphBudget {
    const typeCounts = this.countNodesByType();
    const density = this.computeModuleDensity();
    const boostTypes = phase ? PHASE_NODE_TYPES[phase] : undefined;
    const { weights, weightedTotal } = this.computeTypeWeights(typeCounts, boostTypes);
    const allocations = this.allocateProportionally(weights, weightedTotal, totalTokens);
    return { total: totalTokens, allocations, density };
  }

  /**
   * Filter graph nodes relevant to a development phase.
   */
  filterForPhase(phase: string): GraphFilterResult {
    const nodeTypes = PHASE_NODE_TYPES[phase];
    if (!nodeTypes) {
      console.warn(
        `[harness] Unknown phase "${phase}" in filterForPhase. Returning all code nodes.`
      );
      // fall back to implement types
    }
    const relevantTypes = nodeTypes ?? PHASE_NODE_TYPES['implement'] ?? [];
    const nodes: GraphNode[] = [];
    const filePathSet = new Set<string>();

    for (const type of relevantTypes) {
      const found = this.store.findNodes({ type });
      for (const node of found) {
        nodes.push(node);
        if (node.path) {
          filePathSet.add(node.path);
        }
      }
    }

    return {
      phase,
      nodes,
      filePaths: Array.from(filePathSet),
    };
  }

  private buildModuleLines(): string[] {
    const modulesWithEdgeCount = this.store.findNodes({ type: 'module' }).map((mod) => {
      const edgeCount =
        this.store.getEdges({ from: mod.id }).length + this.store.getEdges({ to: mod.id }).length;
      return { module: mod, edgeCount };
    });
    modulesWithEdgeCount.sort((a, b) => b.edgeCount - a.edgeCount);

    if (modulesWithEdgeCount.length === 0) return [];

    const lines: string[] = ['## Modules', ''];
    for (const { module: mod, edgeCount } of modulesWithEdgeCount) {
      lines.push(`### ${mod.name} (${edgeCount} connections)`, '');
      for (const edge of this.store.getEdges({ from: mod.id, type: 'contains' })) {
        const fileNode = this.store.getNode(edge.to);
        if (fileNode?.type === 'file') {
          const symbols = this.store.getEdges({ from: fileNode.id, type: 'contains' }).length;
          lines.push(`- ${fileNode.path ?? fileNode.name} (${symbols} symbols)`);
        }
      }
      lines.push('');
    }
    return lines;
  }

  private buildEntryPointLines(): string[] {
    const filesWithOutDegree = this.store
      .findNodes({ type: 'file' })
      .filter((n) => !n.name.startsWith('index.'))
      .map((f) => ({ file: f, outDegree: this.store.getEdges({ from: f.id }).length }));
    filesWithOutDegree.sort((a, b) => b.outDegree - a.outDegree);

    const entryPoints = filesWithOutDegree.filter((f) => f.outDegree > 0).slice(0, 5);
    if (entryPoints.length === 0) return [];

    const lines: string[] = ['## Entry Points', ''];
    for (const { file, outDegree } of entryPoints) {
      lines.push(`- ${file.path ?? file.name} (${outDegree} outbound edges)`);
    }
    lines.push('');
    return lines;
  }

  generateMap(): string {
    const lines: string[] = ['# Repository Structure', ''];
    lines.push(...this.buildModuleLines());
    lines.push(...this.buildEntryPointLines());
    return lines.join('\n');
  }

  /**
   * Check documentation coverage of code nodes.
   */
  checkCoverage(): GraphCoverageReport {
    const codeNodes: GraphNode[] = [];
    for (const type of CODE_NODE_TYPES) {
      codeNodes.push(...this.store.findNodes({ type }));
    }

    const documented: string[] = [];
    const undocumented: string[] = [];

    for (const node of codeNodes) {
      // Check if any edge with type 'documents' points TO this node
      const documentsEdges = this.store.getEdges({ to: node.id, type: 'documents' });
      if (documentsEdges.length > 0) {
        documented.push(node.id);
      } else {
        undocumented.push(node.id);
      }
    }

    const totalCodeNodes = codeNodes.length;
    const coveragePercentage = totalCodeNodes > 0 ? (documented.length / totalCodeNodes) * 100 : 0;

    return {
      documented,
      undocumented,
      coveragePercentage,
      totalCodeNodes,
    };
  }
}
