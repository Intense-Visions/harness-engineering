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

/**
 * Estimate the number of tokens for a node based on its name, path, and type.
 * Uses a 4-characters-per-token heuristic.
 */
function estimateNodeTokens(node: GraphNode): number {
  let chars = (node.name?.length ?? 0) + (node.path?.length ?? 0) + (node.type?.length ?? 0);
  if (node.metadata) {
    chars += JSON.stringify(node.metadata).length;
  }
  return Math.ceil(chars / 4); // ~4 chars per token
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
      return {
        nodes: [],
        edges: [],
        tokenEstimate: 0,
        intent,
        truncated: false,
      };
    }

    const contextQL = new ContextQL(this.store);
    const nodeMap = new Map<string, GraphNode>();
    const edgeSet = new Set<string>();
    const collectedEdges: GraphEdge[] = [];

    // Track fusion scores for priority-based truncation
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
          // Expanded nodes get a fraction of the root's score
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

    // Sort nodes by score (highest first) for truncation
    const sortedNodes = Array.from(nodeMap.values()).sort((a, b) => {
      return (nodeScores.get(b.id) ?? 0) - (nodeScores.get(a.id) ?? 0);
    });

    // Estimate tokens and truncate if over budget
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

    // Filter edges to only include those between kept nodes
    const keptNodeIds = new Set(keptNodes.map((n) => n.id));
    const keptEdges = collectedEdges.filter(
      (e) => keptNodeIds.has(e.from) && keptNodeIds.has(e.to)
    );

    return {
      nodes: keptNodes,
      edges: keptEdges,
      tokenEstimate,
      intent,
      truncated,
    };
  }

  /**
   * Compute a token budget allocation across node types.
   */
  computeBudget(totalTokens: number, phase?: string): GraphBudget {
    const allNodes = this.store.findNodes({});

    // Count nodes by type
    const typeCounts: Record<string, number> = {};
    for (const node of allNodes) {
      typeCounts[node.type] = (typeCounts[node.type] ?? 0) + 1;
    }

    // Compute density: for each module node, count its edges
    const density: Record<string, number> = {};
    const moduleNodes = this.store.findNodes({ type: 'module' });
    for (const mod of moduleNodes) {
      const outEdges = this.store.getEdges({ from: mod.id });
      const inEdges = this.store.getEdges({ to: mod.id });
      density[mod.name] = outEdges.length + inEdges.length;
    }

    // Apply phase boost
    const boostTypes = phase ? PHASE_NODE_TYPES[phase] : undefined;
    const boostFactor = 2.0;

    // Calculate weighted total
    let weightedTotal = 0;
    const weights: Record<string, number> = {};
    for (const [type, count] of Object.entries(typeCounts)) {
      const isBoosted = boostTypes?.includes(type as NodeType);
      const weight = count * (isBoosted ? boostFactor : 1.0);
      weights[type] = weight;
      weightedTotal += weight;
    }

    // Allocate proportionally
    const allocations: Record<string, number> = {};
    if (weightedTotal > 0) {
      let allocated = 0;
      const types = Object.keys(weights);
      for (let i = 0; i < types.length; i++) {
        const type = types[i]!;
        if (i === types.length - 1) {
          // Last type gets remainder to ensure exact sum
          allocations[type] = totalTokens - allocated;
        } else {
          const share = Math.round((weights[type]! / weightedTotal) * totalTokens);
          allocations[type] = share;
          allocated += share;
        }
      }
    }

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

  /**
   * Generate a markdown repository map from graph structure.
   */
  generateMap(): string {
    const moduleNodes = this.store.findNodes({ type: 'module' });

    // Sort modules by edge count (most connected first)
    const modulesWithEdgeCount = moduleNodes.map((mod) => {
      const outEdges = this.store.getEdges({ from: mod.id });
      const inEdges = this.store.getEdges({ to: mod.id });
      return { module: mod, edgeCount: outEdges.length + inEdges.length };
    });
    modulesWithEdgeCount.sort((a, b) => b.edgeCount - a.edgeCount);

    const lines: string[] = ['# Repository Structure', ''];

    if (modulesWithEdgeCount.length > 0) {
      lines.push('## Modules', '');
      for (const { module: mod, edgeCount } of modulesWithEdgeCount) {
        lines.push(`### ${mod.name} (${edgeCount} connections)`);
        lines.push('');

        // Find files contained in this module
        const containsEdges = this.store.getEdges({ from: mod.id, type: 'contains' });
        for (const edge of containsEdges) {
          const fileNode = this.store.getNode(edge.to);
          if (fileNode && fileNode.type === 'file') {
            // Count symbols in this file
            const symbolEdges = this.store.getEdges({ from: fileNode.id, type: 'contains' });
            lines.push(`- ${fileNode.path ?? fileNode.name} (${symbolEdges.length} symbols)`);
          }
        }
        lines.push('');
      }
    }

    // Find entry points: file nodes with high out-degree (excluding barrel files)
    const fileNodes = this.store.findNodes({ type: 'file' });
    const nonBarrelFiles = fileNodes.filter((n) => !n.name.startsWith('index.'));
    const filesWithOutDegree = nonBarrelFiles.map((f) => {
      const outEdges = this.store.getEdges({ from: f.id });
      return { file: f, outDegree: outEdges.length };
    });
    filesWithOutDegree.sort((a, b) => b.outDegree - a.outDegree);

    const entryPoints = filesWithOutDegree.filter((f) => f.outDegree > 0).slice(0, 5);

    if (entryPoints.length > 0) {
      lines.push('## Entry Points', '');
      for (const { file, outDegree } of entryPoints) {
        lines.push(`- ${file.path ?? file.name} (${outDegree} outbound edges)`);
      }
      lines.push('');
    }

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
