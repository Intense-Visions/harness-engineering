import type { GraphEdge, GraphNode } from '../types.js';

// --- Probability Strategy ---

export interface ProbabilityStrategy {
  /** Compute failure propagation probability for a single edge (0..1). */
  getEdgeProbability(edge: GraphEdge, fromNode: GraphNode, toNode: GraphNode): number;
}

// --- Simulation Options ---

export interface CascadeSimulationOptions {
  /** Minimum cumulative probability to continue traversal. Default: 0.05 */
  readonly probabilityFloor?: number;
  /** Maximum BFS depth. Default: 10 */
  readonly maxDepth?: number;
  /** Filter to specific edge types. Default: all edge types. */
  readonly edgeTypes?: readonly string[];
  /** Pluggable probability strategy. Default: CompositeProbabilityStrategy. */
  readonly strategy?: ProbabilityStrategy;
}

// --- Result Structures ---

export interface CascadeNode {
  readonly nodeId: string;
  readonly name: string;
  readonly path?: string;
  readonly type: string;
  readonly cumulativeProbability: number;
  readonly depth: number;
  readonly incomingEdge: string;
  readonly parentId: string;
}

export interface CascadeLayer {
  readonly depth: number;
  readonly nodes: readonly CascadeNode[];
  readonly categoryBreakdown: {
    readonly code: number;
    readonly tests: number;
    readonly docs: number;
    readonly other: number;
  };
}

export interface CascadeResult {
  readonly sourceNodeId: string;
  readonly sourceName: string;
  readonly layers: readonly CascadeLayer[];
  readonly flatSummary: readonly CascadeNode[];
  readonly summary: {
    readonly totalAffected: number;
    readonly maxDepthReached: number;
    readonly highRisk: number;
    readonly mediumRisk: number;
    readonly lowRisk: number;
    readonly categoryBreakdown: {
      readonly code: number;
      readonly tests: number;
      readonly docs: number;
      readonly other: number;
    };
    readonly amplificationPoints: readonly string[];
  };
}
