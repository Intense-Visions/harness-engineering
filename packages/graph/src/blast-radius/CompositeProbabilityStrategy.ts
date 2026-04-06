import type { GraphEdge, GraphNode } from '../types.js';
import type { ProbabilityStrategy } from './types.js';

/**
 * Default probability strategy blending three signals:
 * - 50% edge type base weight
 * - 30% normalized change frequency of target node
 * - 20% normalized coupling strength of target node
 */
export class CompositeProbabilityStrategy implements ProbabilityStrategy {
  static readonly BASE_WEIGHTS: Record<string, number> = {
    imports: 0.7,
    calls: 0.5,
    implements: 0.6,
    inherits: 0.6,
    co_changes_with: 0.4,
    references: 0.2,
    contains: 0.3,
  };

  private static readonly FALLBACK_WEIGHT = 0.1;
  private static readonly EDGE_TYPE_BLEND = 0.5;
  private static readonly CHANGE_FREQ_BLEND = 0.3;
  private static readonly COUPLING_BLEND = 0.2;

  constructor(
    private readonly changeFreqMap: Map<string, number>,
    private readonly couplingMap: Map<string, number>
  ) {}

  getEdgeProbability(edge: GraphEdge, _fromNode: GraphNode, toNode: GraphNode): number {
    const base =
      CompositeProbabilityStrategy.BASE_WEIGHTS[edge.type] ??
      CompositeProbabilityStrategy.FALLBACK_WEIGHT;
    const changeFreq = this.changeFreqMap.get(toNode.id) ?? 0;
    const coupling = this.couplingMap.get(toNode.id) ?? 0;

    return Math.min(
      1,
      base * CompositeProbabilityStrategy.EDGE_TYPE_BLEND +
        changeFreq * CompositeProbabilityStrategy.CHANGE_FREQ_BLEND +
        coupling * CompositeProbabilityStrategy.COUPLING_BLEND
    );
  }
}
